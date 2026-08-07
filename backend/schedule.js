/**
 * schedule.js
 *
 * Populates the games table from the College Football Data API.
 *
 * Nothing else creates game rows — espn.js and cfbd.js only UPDATE rows that
 * already exist. Until this runs, both of those cron jobs iterate an empty list
 * and log success while doing nothing.
 *
 * Teams resolve through teams.cfbd_id, not through name matching. CFBD's game
 * payload carries homeId/awayId, which are integer ids that either hit a row or
 * do not. This is the whole reason 017 added the column.
 *
 * Re-runnable. Upserts on cfbd_game_id, and deliberately does NOT write score
 * or status columns — see SCHEDULE_FIELDS below.
 */

const { supabase } = require('./db');

const CFBD_BASE = 'https://api.collegefootballdata.com';

async function fetchCFBD(path) {
  if (!process.env.CFB_KEY) throw new Error('CFB_KEY is not set');
  const res = await fetch(`${CFBD_BASE}${path}`, {
    headers: { Authorization: `Bearer ${process.env.CFB_KEY}` },
  });
  if (!res.ok) throw new Error(`CFBD HTTP ${res.status} for ${path}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// cfbd_id -> teams.id
// ---------------------------------------------------------------------------
async function loadTeamIndex() {
  const { data, error } = await supabase
    .from('teams')
    .select('id, school, cfbd_id')
    .not('cfbd_id', 'is', null);

  if (error) throw error;
  if (!data.length) {
    throw new Error(
      'No teams have cfbd_id set. Run migration 017 and scripts/backfill-team-ids.js first.'
    );
  }

  return new Map(data.map((t) => [t.cfbd_id, t.id]));
}

// Week 0 — the late-August opening weekend.
//
// CFBD does not have a week 0. It files those games as week 1 alongside the
// Labor Day weekend openers, so CFBD week 1 spans 2026-08-29 to 2026-09-07.
// We split them out: week 0 games are ingested and displayed normally but do
// not score, giving the live pipeline a dress rehearsal before results count.
//
// The rule is "kicks off before September", which is unambiguous because
// college football's opening weekend is always the last weekend of August.
// Applying it here rather than as a one-time UPDATE matters — the weekly
// refresh re-upserts every game, and would otherwise reset these to week 1.
//
// The month is read in US Eastern, not UTC. Kickoff times are stored as UTC
// instants, and a late kickoff on the US west coast rolls past midnight UTC —
// memphis at unlv opens at 7pm Pacific on August 29 and is stored as
// 2026-08-30T02:00Z. Eastern is what college football schedules against, so
// reading the date there is what makes "an August game" mean the same thing
// the schedule does.
//
// UTC happens to give the right answer for 2026, where opening weekend is
// August 29. It would not for a season opening on August 30 or 31, where a
// west-coast night game crosses into September UTC and would score for real.
const EASTERN_MONTH = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  month: 'numeric',
});

function resolveWeek(game, seasonType) {
  if (seasonType === 'regular' && game.week === 1 && game.startDate) {
    const month = EASTERN_MONTH.format(new Date(game.startDate));
    if (month === '8') return 0; // August
  }
  return game.week;
}

// ---------------------------------------------------------------------------
// CFBD game -> games row
//
// The returned row carries schedule columns only. home_score, away_score,
// game_status, game_complete, period, clock, last_score_update and home_spread
// are deliberately absent — those belong to espn.js and cfbd.js.
//
// This matters because the weekly refresh runs during the season, potentially
// mid-game. Upserting a full row would blank out live scores ESPN wrote sixty
// seconds earlier. Omitting the columns keeps the writers off each other.
// ---------------------------------------------------------------------------
function toGameRow(game, teamIndex, seasonType) {
  const homeSlug = teamIndex.get(game.homeId);
  const awaySlug = teamIndex.get(game.awayId);

  // A missing side means CFBD listed a team that is not in our teams table —
  // usually a D2/D3 opponent living in CFBD's synthetic 1000000+ id range.
  // Reported rather than silently dropped, since a real FBS team going
  // unresolved would otherwise look identical to a bye week all season.
  if (!homeSlug || !awaySlug) {
    return {
      unresolved: {
        cfbdGameId: game.id,
        week: game.week,
        home: `${game.homeTeam} (${game.homeId})`,
        away: `${game.awayTeam} (${game.awayId})`,
        missing: [!homeSlug && 'home', !awaySlug && 'away'].filter(Boolean).join(' + '),
      },
    };
  }

  return {
    row: {
      cfbd_game_id:    String(game.id),
      year:            game.season,
      week:            String(resolveWeek(game, seasonType)),
      season_type:     seasonType,
      home_team:       homeSlug,
      away_team:       awaySlug,
      date:            game.startDate,
      start_time_tbd:  Boolean(game.startTimeTBD),
      venue:           game.venue || null,
      neutral_site:    Boolean(game.neutralSite),
      conference_game: Boolean(game.conferenceGame),
    },
  };
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------
/**
 * @param {number} year
 * @param {{ dryRun?: boolean }} [options]
 */
async function importSchedule(year, { dryRun = false } = {}) {
  console.log(`[Schedule] Importing ${year}${dryRun ? ' (dry run)' : ''}...`);

  const teamIndex = await loadTeamIndex();
  console.log(`[Schedule] ${teamIndex.size} teams have a cfbd_id`);

  const rows = [];
  const unresolved = [];

  for (const seasonType of ['regular', 'postseason']) {
    // classification=fbs returns games with at least one FBS team. Without it
    // CFBD also returns pure FCS/D2/D3 matchups — 1638 games instead of 888 on
    // the 2026 regular season — none of which are scoreable in this app.
    const games = await fetchCFBD(
      `/games?year=${year}&seasonType=${seasonType}&classification=fbs`
    );

    console.log(`[Schedule] CFBD returned ${games.length} ${seasonType} games`);

    for (const game of games) {
      const { row, unresolved: miss } = toGameRow(game, teamIndex, seasonType);
      if (miss) unresolved.push(miss);
      else rows.push(row);
    }
  }

  if (unresolved.length) {
    console.log(`[Schedule] ${unresolved.length} games have an unresolved team:`);
    for (const u of unresolved.slice(0, 20)) {
      console.log(`   week ${u.week}: ${u.away} at ${u.home} — no ${u.missing} match`);
    }
    if (unresolved.length > 20) {
      console.log(`   ... and ${unresolved.length - 20} more`);
    }
  }

  if (dryRun) {
    const byType = rows.reduce((acc, r) => {
      acc[r.season_type] = (acc[r.season_type] || 0) + 1;
      return acc;
    }, {});
    console.log(`[Schedule] dry run — would upsert ${rows.length} games`, byType);
    return { imported: 0, resolved: rows.length, unresolved: unresolved.length, dryRun: true };
  }

  // Chunked so a full-season import is a handful of round trips rather than 888.
  const CHUNK = 200;
  let imported = 0;

  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error } = await supabase
      .from('games')
      .upsert(chunk, { onConflict: 'cfbd_game_id' });

    if (error) {
      console.error(`[Schedule] chunk ${i / CHUNK + 1} failed:`, error.message);
      continue;
    }
    imported += chunk.length;
  }

  console.log(`[Schedule] Upserted ${imported} of ${rows.length} games`);

  return { imported, resolved: rows.length, unresolved: unresolved.length, unresolvedGames: unresolved };
}

/**
 * Weekly refresh. Kickoff times firm up about 12 days out, and the postseason
 * schedule is not published until December — both arrive through the same
 * upsert path, so this is just importSchedule against the configured year.
 */
async function refreshSchedule() {
  const { data: configRow } = await supabase
    .from('config')
    .select('value')
    .eq('key', 'season')
    .single();

  const year = configRow?.value?.year || new Date().getFullYear();
  return importSchedule(year);
}

module.exports = { importSchedule, refreshSchedule };
