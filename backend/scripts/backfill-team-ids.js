/**
 * backfill-team-ids.js — one-shot population of teams.cfbd_id / teams.espn_id
 *
 * Run 017_team_external_ids.sql first.
 *
 * Usage (run from lineup/backend/):
 *   node scripts/backfill-team-ids.js          — dry run, prints what it would write
 *   node scripts/backfill-team-ids.js --write  — apply
 *
 * Matching strategy: for each of our rows, try teams.id, then teams.school,
 * then every entry in teams.alternate_names, each normalized. The first one
 * that hits the provider's alias index wins. alternate_names is what makes
 * this land — "Texas A&M", "Miami (FL)", "UMass" and "Hawai'i" all resolve
 * through it where school alone would miss.
 *
 * The script refuses to write if two of our rows resolve to the same provider
 * id. That is the Miami FL / Miami OH failure mode, and a partial write would
 * leave the table in a state where you cannot tell which row is wrong.
 */

require('dotenv').config();

const { supabase } = require('../db');

const CFBD_TEAMS_URL = 'https://api.collegefootballdata.com/teams';
const ESPN_TEAMS_URL =
  'https://site.api.espn.com/apis/site/v2/sports/football/college-football/teams?limit=1000';

const WRITE = process.argv.includes('--write');

// ---------------------------------------------------------------------------
// Normalization
//
// Mirrors normalizeTeamName in src/utils/teamName.js. It is duplicated here
// rather than imported because that module is ESM inside CRA's src/ scope and
// this is a CommonJS backend script. Keep the two in step — "&" becomes "-",
// never "". This is the last place the backend needs name matching at all;
// once the IDs are populated, espn.js and cfbd.js join on integers.
// ---------------------------------------------------------------------------
const normalize = (name) =>
  (name || '')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/&/g, '-')
    .replace(/[^a-z0-9-]/g, '');

/** Build alias -> provider id. First alias to claim a key keeps it. */
function buildIndex(entries) {
  const index = new Map();
  for (const { id, names } of entries) {
    for (const name of names) {
      const key = normalize(name);
      if (key && !index.has(key)) index.set(key, id);
    }
  }
  return index;
}

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------
async function fetchCFBD() {
  if (!process.env.CFB_KEY) throw new Error('CFB_KEY is not set');
  const res = await fetch(CFBD_TEAMS_URL, {
    headers: { Authorization: `Bearer ${process.env.CFB_KEY}` },
  });
  if (!res.ok) throw new Error(`CFBD HTTP ${res.status}`);
  const teams = await res.json();

  return teams.map((t) => ({
    id: t.id,
    label: t.school,
    names: [t.school, t.abbreviation, ...(t.alternateNames || [])],
  }));
}

async function fetchESPN() {
  const res = await fetch(ESPN_TEAMS_URL);
  if (!res.ok) throw new Error(`ESPN HTTP ${res.status}`);
  const body = await res.json();
  const entries = body?.sports?.[0]?.leagues?.[0]?.teams || [];

  return entries.map(({ team }) => ({
    id: parseInt(team.id, 10),
    label: team.displayName,
    names: [
      team.location,
      team.displayName,
      team.shortDisplayName,
      team.abbreviation,
      team.nickname,
    ],
  }));
}

// ---------------------------------------------------------------------------
// Resolve one of our rows against one provider
// ---------------------------------------------------------------------------
function resolve(team, index) {
  const candidates = [team.id, team.school, ...(team.alternate_names || [])];
  for (const candidate of candidates) {
    const key = normalize(candidate);
    if (index.has(key)) return { id: index.get(key), via: key };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log(`[backfill] ${WRITE ? 'WRITE' : 'DRY RUN'} — fetching providers...`);

  const [cfbdTeams, espnTeams] = await Promise.all([fetchCFBD(), fetchESPN()]);
  console.log(`[backfill] CFBD ${cfbdTeams.length} teams, ESPN ${espnTeams.length} teams`);

  const cfbdIndex = buildIndex(cfbdTeams);
  const espnIndex = buildIndex(espnTeams);
  const cfbdLabels = new Map(cfbdTeams.map((t) => [t.id, t.label]));
  const espnLabels = new Map(espnTeams.map((t) => [t.id, t.label]));

  const { data: teams, error } = await supabase
    .from('teams')
    .select('id, school, alternate_names, classification')
    .order('school');
  if (error) throw error;

  const updates = [];
  const misses = [];
  const collisions = [];
  const claimed = { cfbd: new Map(), espn: new Map() };

  for (const team of teams) {
    const cfbd = resolve(team, cfbdIndex);
    const espn = resolve(team, espnIndex);

    if (!cfbd || !espn) {
      misses.push({
        school: team.school,
        classification: team.classification,
        missing: [!cfbd && 'cfbd', !espn && 'espn'].filter(Boolean).join(' + '),
      });
      continue;
    }

    for (const [provider, hit] of [['cfbd', cfbd], ['espn', espn]]) {
      const prior = claimed[provider].get(hit.id);
      if (prior) {
        collisions.push(`${provider} id ${hit.id}: ${prior} and ${team.school}`);
      } else {
        claimed[provider].set(hit.id, team.school);
      }
    }

    updates.push({
      id: team.id,
      school: team.school,
      cfbd_id: cfbd.id,
      espn_id: espn.id,
      cfbdLabel: cfbdLabels.get(cfbd.id),
      espnLabel: espnLabels.get(espn.id),
      via: cfbd.via,
    });
  }

  // Report ------------------------------------------------------------------
  const divergent = updates.filter((u) => u.cfbd_id !== u.espn_id);

  console.log(`\n[backfill] resolved ${updates.length} of ${teams.length}`);
  console.log(`[backfill] cfbd_id !== espn_id on ${divergent.length} rows`);
  for (const d of divergent) {
    console.log(`   ${d.school}: cfbd=${d.cfbd_id} (${d.cfbdLabel}) espn=${d.espn_id} (${d.espnLabel})`);
  }

  if (misses.length) {
    console.log(`\n[backfill] ${misses.length} UNRESOLVED — add an entry to teams.alternate_names:`);
    for (const m of misses) {
      console.log(`   ${m.school} [${m.classification}] — no ${m.missing} match`);
    }
  }

  if (collisions.length) {
    console.log(`\n[backfill] ${collisions.length} COLLISIONS — two rows claim one provider id:`);
    for (const c of collisions) console.log(`   ${c}`);
    console.log('\n[backfill] aborting. Fix alternate_names before writing.');
    process.exit(1);
  }

  if (!WRITE) {
    console.log('\n[backfill] dry run — sample of what would be written:');
    for (const u of updates.slice(0, 5)) {
      console.log(`   ${u.school} -> cfbd ${u.cfbd_id}, espn ${u.espn_id} (matched via "${u.via}")`);
    }
    console.log(`   ... and ${Math.max(0, updates.length - 5)} more`);
    console.log('\n[backfill] re-run with --write to apply.');
    return;
  }

  // Write -------------------------------------------------------------------
  let written = 0;
  for (const u of updates) {
    const { error: updateErr } = await supabase
      .from('teams')
      .update({ cfbd_id: u.cfbd_id, espn_id: u.espn_id })
      .eq('id', u.id);

    if (updateErr) {
      console.error(`[backfill] ${u.school}: ${updateErr.message}`);
      continue;
    }
    written++;
  }

  console.log(`\n[backfill] wrote ${written} of ${updates.length} rows`);

  const { count: remaining } = await supabase
    .from('teams')
    .select('*', { count: 'exact', head: true })
    .or('cfbd_id.is.null,espn_id.is.null');

  console.log(`[backfill] rows still missing an id: ${remaining}`);
}

main().catch((err) => {
  console.error('[backfill] failed:', err.message);
  process.exit(1);
});
