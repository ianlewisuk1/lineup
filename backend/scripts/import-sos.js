/**
 * import-sos.js — populate team_preseason_stats.sos_rank from ESPN's FPI resume ranks
 *
 * Run 025_preseason_sos_rank.sql first.
 *
 * Usage (run from lineup/backend/):
 *   node scripts/import-sos.js 2026          — dry run
 *   node scripts/import-sos.js 2026 --write  — apply
 *
 * Source is ESPN's public FPI endpoint — no API key, and it carries preseason
 * numbers months before CFBD publishes anything for the year (as of Aug 2026,
 * /ratings/sp and /ratings/elo both return [] for 2026, and SP+'s own `sos`
 * field is null even in completed seasons).
 *
 * The rank we take is `avgsosrank` — full-season strength of schedule across
 * every game, played and unplayed. ESPN also exposes `sosremainingrank`, which
 * is identical preseason and diverges once games are played. Full-season is the
 * right one for the Scouting page, which is a pre-draft view of the whole year.
 *
 * This writes team_preseason_stats.sos_rank, which is a different column from
 * team_season_stats.sos_rank — see 025_preseason_sos_rank.sql. The Scouting
 * page reads the preseason one; Stats and TeamDrawer read the in-season one.
 *
 * Joins on teams.espn_id (migration 017), never on names. Safe to re-run: it
 * upserts on the (team_id, season_year) primary key and writes only sos_rank,
 * so the odds and projection columns in that row are left alone.
 *
 * ESPN covers ~138 teams, which is not the same set as our teams table — a
 * handful of FCS schools appear in their index and some of ours will not appear
 * in theirs. Both directions are reported rather than silently dropped.
 */

require('dotenv').config();

const { supabase } = require('../db');

const FPI_URL =
  'https://site.web.api.espn.com/apis/fitt/v3/sports/football/college-football/powerindex';

const yearArg = process.argv.find((a) => /^\d{4}$/.test(a));
const YEAR = yearArg ? parseInt(yearArg, 10) : new Date().getFullYear();
const WRITE = process.argv.includes('--write');

// ---------------------------------------------------------------------------
// ESPN
//
// Each team carries a `resume` category whose column order is described by the
// matching entry in the top-level `categories` array. Read the index out of
// that instead of hardcoding 2 — ESPN has reordered these columns before.
// ---------------------------------------------------------------------------
async function fetchSosRanks(year) {
  const res = await fetch(`${FPI_URL}?region=us&lang=en&season=${year}&limit=500`);
  if (!res.ok) throw new Error(`ESPN HTTP ${res.status}`);
  const body = await res.json();

  const resumeCategory = (body.categories || []).find((c) => c.name === 'resume');
  const sosIndex = (resumeCategory?.names || []).indexOf('avgsosrank');
  if (sosIndex === -1) {
    throw new Error('ESPN payload has no resume.avgsosrank column — schema changed');
  }

  const teams = body.teams || [];
  if (!teams.length) throw new Error(`ESPN returned no teams for ${year}`);

  const ranks = new Map();
  const blanks = [];

  for (const entry of teams) {
    const resume = (entry.categories || []).find((c) => c.name === 'resume');
    const raw = resume?.values?.[sosIndex];
    const espnId = parseInt(entry.team?.id, 10);
    const label = entry.team?.displayName || `espn:${espnId}`;

    // Preseason ESPN sometimes carries a team with the resume block zeroed out.
    // 0 is not a rank; writing it would sort that team to the top of the page.
    if (!Number.isFinite(raw) || raw < 1) {
      blanks.push(label);
      continue;
    }
    ranks.set(espnId, { rank: Math.round(raw), label });
  }

  return { ranks, blanks, lastUpdated: body.lastUpdated, total: teams.length };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log(`[sos] ${WRITE ? 'WRITE' : 'DRY RUN'} — season ${YEAR}`);

  const { ranks, blanks, lastUpdated, total } = await fetchSosRanks(YEAR);
  console.log(`[sos] ESPN returned ${total} teams, ${ranks.size} with a rank (updated ${lastUpdated})`);

  const { data: teams, error } = await supabase
    .from('teams')
    .select('id, school, classification, espn_id')
    .order('school');
  if (error) throw error;

  const rows = [];
  const missingId = [];
  const notInEspn = [];
  const seen = new Set();

  for (const team of teams) {
    if (team.espn_id == null) {
      missingId.push(team);
      continue;
    }
    const hit = ranks.get(team.espn_id);
    if (!hit) {
      notInEspn.push(team);
      continue;
    }
    seen.add(team.espn_id);
    rows.push({
      team_id: team.id,
      season_year: YEAR,
      sos_rank: hit.rank,
      school: team.school,
      espnLabel: hit.label,
    });
  }

  const unmatchedEspn = [...ranks.entries()].filter(([id]) => !seen.has(id));

  // Report ------------------------------------------------------------------
  console.log(`\n[sos] matched ${rows.length} of ${teams.length} teams`);

  const fbsMisses = [...missingId, ...notInEspn].filter((t) => t.classification === 'fbs');
  if (fbsMisses.length) {
    console.log(`\n[sos] ${fbsMisses.length} FBS teams got NO rank — these will render "-" on Scouting:`);
    for (const t of fbsMisses) {
      const why = t.espn_id == null ? 'no espn_id (run backfill-team-ids.js)' : `espn_id ${t.espn_id} absent from FPI`;
      console.log(`   ${t.school} — ${why}`);
    }
  }

  const nonFbsMisses = [...missingId, ...notInEspn].filter((t) => t.classification !== 'fbs');
  if (nonFbsMisses.length) {
    console.log(`\n[sos] ${nonFbsMisses.length} non-FBS teams skipped (expected): ${nonFbsMisses.map((t) => t.school).join(', ')}`);
  }

  if (unmatchedEspn.length) {
    console.log(`\n[sos] ${unmatchedEspn.length} FPI teams not in our teams table (expected — ESPN indexes some FCS):`);
    console.log(`   ${unmatchedEspn.map(([, v]) => `${v.label} (#${v.rank})`).join(', ')}`);
  }

  if (blanks.length) {
    console.log(`\n[sos] ${blanks.length} FPI teams had no usable rank: ${blanks.join(', ')}`);
  }

  const dupes = new Map();
  for (const r of rows) {
    if (!dupes.has(r.sos_rank)) dupes.set(r.sos_rank, []);
    dupes.get(r.sos_rank).push(r.school);
  }
  const collisions = [...dupes.entries()].filter(([, v]) => v.length > 1);
  if (collisions.length) {
    console.log(`\n[sos] WARNING — duplicate ranks: ${collisions.map(([k, v]) => `#${k}: ${v.join(' / ')}`).join('; ')}`);
  }

  if (!rows.length) {
    console.log('\n[sos] nothing to write.');
    return;
  }

  const sorted = [...rows].sort((a, b) => a.sos_rank - b.sos_rank);
  console.log('\n[sos] hardest schedules:');
  for (const r of sorted.slice(0, 5)) console.log(`   ${r.sos_rank}. ${r.school} (${r.espnLabel})`);
  console.log('[sos] easiest schedules:');
  for (const r of sorted.slice(-3)) console.log(`   ${r.sos_rank}. ${r.school} (${r.espnLabel})`);

  if (!WRITE) {
    console.log(`\n[sos] dry run — would upsert sos_rank on ${rows.length} team_preseason_stats rows.`);
    console.log('[sos] re-run with --write to apply.');
    return;
  }

  // Write -------------------------------------------------------------------
  // Only the three key/value columns go in the payload. PostgREST leaves any
  // column not present in the payload untouched on conflict, so this cannot
  // clobber the conf odds, power rank, or projections already in these rows.
  const payload = rows.map(({ team_id, season_year, sos_rank }) => ({
    team_id,
    season_year,
    sos_rank,
  }));

  const { error: upsertErr } = await supabase
    .from('team_preseason_stats')
    .upsert(payload, { onConflict: 'team_id,season_year' });

  if (upsertErr) throw new Error(upsertErr.message);

  const { count } = await supabase
    .from('team_preseason_stats')
    .select('*', { count: 'exact', head: true })
    .eq('season_year', YEAR)
    .not('sos_rank', 'is', null);

  console.log(`\n[sos] wrote ${payload.length} rows — ${count} rows now have sos_rank for ${YEAR}`);
}

main().catch((err) => {
  console.error('[sos] failed:', err.message);
  process.exit(1);
});
