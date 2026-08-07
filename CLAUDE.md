# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

**Frontend (React):**
```bash
npm start          # Dev server on port 5173
npm run build      # Production build (required before mobile sync)
npm test           # Run tests
```

**Backend (Node.js cron service):**
```bash
cd backend && npm install
node index.js      # Runs Express + cron jobs locally
```

**Mobile (Capacitor):**
```bash
npm run build                    # Must build first
npx cap sync                     # Sync web build to iOS/Android
npx cap open ios                 # Open in Xcode
npx cap open android             # Open in Android Studio
```

**Environment:** Copy `.env.example` to `.env`. Frontend uses `REACT_APP_SUPABASE_URL` and `REACT_APP_SUPABASE_ANON_KEY`. Backend uses `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, and `CFB_KEY`.

## Architecture

### Two separate processes

**Frontend** — React 19 SPA deployed on Vercel. Talks directly to Supabase using the anon key (RLS enforced). Packaged for iOS/Android via Capacitor.

**Backend** — Express.js + node-cron service deployed on Render. Uses the Supabase service role key (bypasses RLS). Runs cron jobs every 2 min (ESPN score ingestion), every 20 min (CFBD spread data), weekly (schedule refresh), daily (records/backfill), and every 5 seconds (draft auto-pick/auto-start). Exposes `/admin/*` endpoints and a `/health` endpoint pinged by UptimeRobot to keep the Render free tier alive.

### Deployment

Both services build from **`main`**. The `supabase-migration` branch is historical — it was the production branch for both until the migration was merged, and it now points at the same commit. Do not push to it.

| Service | Builds | Config |
|---|---|---|
| Vercel (frontend) | `main` | Settings → Git → Branch Tracking. Domains `www.lineupcfb.com`, `lineup-henna.vercel.app` |
| Render (backend) | `main` | `render.yaml`, plus the dashboard — see below |

`render.yaml` documents the Render service but **does not drive it**. The live service was created by hand, so changing that file has no effect until the service is adopted as a Blueprint. Change the branch or build settings in the dashboard, and mirror them into `render.yaml`.

Render needs `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `CFB_KEY`, `ADMIN_SECRET`. `CFB_KEY` is required by both the schedule import and the lines ingestion; both throw without it rather than failing quietly.

To confirm a Render deploy actually took, check the boot log for the cron table — it lists every scheduled job, so a missing line means stale code:

```
Cron jobs scheduled:
  */2  * * * *  ESPN score ingestion
  */20 * * * *  CFBD lines ingestion
  0 6  * * *    Backfill recent games
  0 8  * * *    Update team records
  0 5  * * 2    Schedule refresh (CFBD)
```

### Season data pipeline

`games` is populated by `backend/schedule.js` from the CFBD API — nothing else creates game rows. `espn.js` and `cfbd.js` only UPDATE, so if `games` is empty both cron jobs iterate an empty list and log success while doing nothing.

```bash
cd backend
node scripts/import-schedule.js 2026          # dry run
node scripts/import-schedule.js 2026 --write  # apply
```

Safe to re-run: it upserts on `cfbd_game_id` and writes schedule columns only, never scores. It re-runs weekly on its own, because roughly half of kickoff times are TBD until ~12 days out and the postseason schedule isn't published until December.

**External IDs are the join key, never team names.** `teams.cfbd_id` and `teams.espn_id` (migration 017) map to both providers; CFBD sources its IDs from ESPN so they're currently identical, but the columns are kept separate so divergence is visible rather than silent. `games.cfbd_game_id` is *also* the ESPN event id, which is how `espn.js` matches a scoreboard entry to a specific game.

Matching on names caused two separate bugs: the old slug regex stripped `&`, so Texas A&M never matched and scored zero all season; and keying the ESPN index by team rather than by game wrote one week's scores onto another week's rows. Repopulate IDs with `node scripts/backfill-team-ids.js`.

**Week 0** is the late-August opening weekend, split out of CFBD's week 1 by `resolveWeek()` in `schedule.js` (CFBD has no week 0). Those games ingest and display normally but award no fantasy points — `recalculateAllMemberPoints` returns early, and `espn.js` excludes week 0 from `game_points`. The week is derived from the **Eastern** month, not UTC: a west-coast night game is stored past midnight UTC and would otherwise be misfiled.

### Schema drift

**`supabase/migrations/001_initial_schema.sql` does not describe the live database.** Every table has drifted, largely via a `migration_2026_03_24.sql` that migration 015 references but which was never committed. Trusting it over the live schema cost five debugging cycles during the 2026 schedule import.

Current column names and types: `supabase/SCHEMA.md`. That file does **not** cover defaults, constraints, indexes, or RLS — and those were the expensive misses (a missing `UNIQUE` on `cfbd_game_id`, a missing `DEFAULT` on `games.id`). Probe the live database before writing anything that depends on them.

Note `teams.classification` is lowercase (`'fbs'`/`'fcs'`), so `.eq('classification', 'FBS')` silently matches zero rows.

### Three-layer context hierarchy

Data flows top-down through three React contexts, nested in this order:

1. **`AuthContext`** (global, wraps entire app) — Loads at boot: current Supabase auth user, user profile row, `seasonConfig` (currentWeek, faLocked, etc.), and a normalized map of **all 130+ FBS teams** keyed by slug (includes all stats from `teams` JOIN `team_season_stats`). This teams map is the single source of truth for team metadata and stats — pages should read from it rather than re-querying the `teams` table.

2. **`LeagueContext`** (league-scoped, active when URL contains `/:leagueId`) — Loads league row, all league members (joined with user data), and computes `isDraftComplete`, `isAdmin`, `currentMemberId`, `currentWeek`. Subscribes to real-time changes on `leagues` and `league_members`.

3. **`DraftContext`** (league-scoped, nested inside LeagueContext) — Loads draft row, all picks, and derives `pickedTeamIds`, `availableTeams`, `currentPickerUid`, `isMyTurn`, `rosterByUser`, `memberMap`. Subscribes to real-time changes on `drafts` and `draft_picks`. Exposes `makePick()`, `startDraft()`, `saveDraftOrder()` which call Supabase RPCs.

Both `LeagueContext` and `DraftContext` are provided by `LeagueLayout`, which wraps all `/:leagueId/*` routes.

### Routing guards

- **`PrivateRoute`** — Redirects to `/login` if no Supabase session.
- **`DraftGuard`** — Redirects to `/:leagueId/draft-room` if `isDraftComplete` is false. Wraps post-draft pages: `my-lineup`, `free-agents`, `my-league`, `stats`.
- **Scouting page** — Manually redirects to `/home` if `isDraftComplete` is true (pre-draft only page).

### Supabase usage

Frontend imports `supabase` from `src/supabase/supabase.js` (anon key). Backend imports from `backend/db.js` (service role). Never use the service role key in frontend code. Real-time subscriptions use `supabase.channel()` and are cleaned up in `useEffect` returns.

### Team name normalization

Teams are stored in the DB by school name (e.g. `"Ohio State"`). The **slug** is the join key everywhere: it keys the `AuthContext` teams map, it is what gets written into `weekly_lineups` starters/bench arrays, it equals `teams.id`, and it names the logo file in `public/logos`.

**Import `normalizeTeamName` from `src/utils/teamName.js`. Never hand-roll the regex.** Eleven divergent copies previously existed in two incompatible variants, which made Texas A&M miss every teams-map lookup.

```js
name.toLowerCase().replace(/\s+/g, "-").replace(/&/g, "-").replace(/[^a-z0-9-]/g, "")
```

Note `&` becomes `-`, not `""` — `"Texas A&M"` → `texas-a-m`, matching `teams.id`. Stripping it yields `texas-am`, which silently fails to match stored roster data.

Logo URLs come from `teamLogoUrl()` in `src/utils/teamLogo.js`, which additionally folds accents (`"San José State"` → `san-jose-state.png`). That folding is deliberately *not* in `normalizeTeamName`, since slugs must keep matching the accent-stripped `teams.id`.

Run `npm run check:logos` after adding teams or changing FBS membership — it diffs the DB against `public/logos` on both lookup paths and fails on a miss.

### Design system

Pages use a light gray/white aesthetic: `bg-gray-50` page background, `bg-white rounded-2xl border border-gray-200 shadow-sm` cards, `text-gray-900` headings, `text-gray-500` secondary text, `bg-blue-600` primary actions. Schedule/data table headers use `backgroundColor: "#0072BC"` with white text (match the Scouting page pattern). Modals use `bg-black/40` backdrop with white `rounded-2xl` boxes.

Pages added or redesigned before this convention (some still use a dark `bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900` theme) are being migrated to the light theme.

### Mobile considerations

This is a Capacitor app targeting iOS and Android. App ID is `com.lineupapp.lineup`. After any frontend change intended for mobile, run `npm run build && npx cap sync`. The splash screen and status bar use `#0f172a` (slate-900) — update `capacitor.config.ts` if the app chrome color changes.
