/**
 * import-supabase.js
 *
 * Reads the JSON files produced by export-firestore.js and imports them
 * into Supabase (PostgreSQL). Safe to run multiple times — uses upsert.
 *
 * Usage:
 *   SUPABASE_URL=https://xxx.supabase.co \
 *   SUPABASE_SERVICE_KEY=your-service-role-key \
 *   node scripts/import-supabase.js
 *
 * Requirements:
 *   npm install @supabase/supabase-js
 */

const { createClient } = require('@supabase/supabase-js');
const { randomUUID } = require('crypto');
const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY env vars');
  process.exit(1);
}

// Service role key bypasses RLS — required for bulk import
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const EXPORT_DIR = path.join(__dirname, '..', 'export');
const MAPPING_FILE = path.join(EXPORT_DIR, 'uid-mapping.json');

// Firebase UID → Supabase UUID mapping (built during user import, reused for all other tables)
let uidMap = {};

// Firestore league ID → Supabase UUID mapping
let leagueMap = {};
const LEAGUE_MAPPING_FILE = path.join(EXPORT_DIR, 'league-id-mapping.json');

function readExport(filename) {
  const filePath = path.join(EXPORT_DIR, filename);
  if (!fs.existsSync(filePath)) {
    console.warn(`  ⚠ ${filename} not found — skipping`);
    return [];
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

// Firestore Timestamp → ISO string
function toISO(val) {
  if (!val) return null;
  if (typeof val === 'string') return val;
  // Firestore Timestamp serialized as {_seconds, _nanoseconds}
  if (val._seconds !== undefined) return new Date(val._seconds * 1000).toISOString();
  if (val instanceof Date) return val.toISOString();
  return null;
}

// Translate a Firebase UID to its Supabase UUID
function mapUid(firebaseUid) {
  if (!firebaseUid) return null;
  if (!uidMap[firebaseUid]) {
    console.warn(`  ⚠ No UUID mapping for Firebase UID: ${firebaseUid}`);
    return null;
  }
  return uidMap[firebaseUid];
}

// Batch upsert helper — chunks large arrays to stay under Supabase payload limits
async function upsert(table, rows, { onConflict } = {}) {
  if (!rows.length) {
    console.log(`  ✓ ${table}: 0 rows (nothing to import)`);
    return;
  }
  const CHUNK = 200;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const query = onConflict
      ? supabase.from(table).upsert(chunk, { onConflict })
      : supabase.from(table).upsert(chunk);
    const { error } = await query;
    if (error) throw new Error(`${table} upsert failed: ${error.message}\n${JSON.stringify(chunk[0], null, 2)}`);
    inserted += chunk.length;
  }
  console.log(`  ✓ ${table}: ${inserted} rows`);
}

// ---------------------------------------------------------------------------
// 1. Config
// ---------------------------------------------------------------------------
async function importConfig() {
  console.log('\nImporting config...');
  const records = readExport('config.json');
  const rows = records.map((r) => ({
    key: r._id,
    value: { currentWeek: r.currentWeek, faLocked: r.faLocked ?? false },
  }));
  await upsert('config', rows, { onConflict: 'key' });
}

// ---------------------------------------------------------------------------
// 2. Teams
// ---------------------------------------------------------------------------
async function importTeams() {
  console.log('\nImporting teams...');
  const records = readExport('teams.json');

  const rows = records.map((r) => ({
    id: r._id,
    school: r.school,
    mascot: r.mascot || null,
    abbreviation: r.abbreviation || null,
    classification: r.classification || null,
    conference: r.conference || null,
    color: r.color || null,
    alternate_color: r.alternateColor || null,
    logos: r.logos || null,
    city: r.location?.city || null,
    state: r.location?.state || null,
    stadium: r.location?.stadium || null,
    capacity: r.location?.capacity || null,
    timezone: r.location?.timezone || null,
    sos_rank: r.sosRank || null,
    phil_metrics: r.philMetrics || null,
    prev_year_points: r.prevYearPoints || null,
    alternate_names: [r.alternateNames1, r.alternateNames2].filter(Boolean),
    game_points: r.currentSeason?.gamePoints || 0,
    record: r.currentSeason?.record || null,
    conf_record: r.currentSeason?.confRecord || null,
    ats_record: r.currentSeason?.atsRecord || null,
    total_points_for: r.currentSeason?.totalPointsFor || 0,
    total_points_against: r.currentSeason?.totalPointsAgainst || 0,
    next_opponent: r.currentSeason?.nextOpponent || null,
    next_game_is_home: r.currentSeason?.nextGameIsHome ?? null,
    next_opponent_spread: r.currentSeason?.nextOpponentSpread || null,
    next_opponent_spread_display: r.currentSeason?.nextOpponentSpreadDisplay || null,
    is_on_bye: r.currentSeason?.isOnBye ?? false,
    weekly_points: r.currentSeason?.weeklyPoints || {},
    game_status: r.currentSeason?.gameStatus || 'scheduled',
    game_complete: r.currentSeason?.gameComplete ?? false,
    ats_wins: r.currentSeason?.atsWins || 0,
    ats_losses: r.currentSeason?.atsLosses || 0,
  }));

  await upsert('teams', rows, { onConflict: 'id' });
}

// ---------------------------------------------------------------------------
// 3. Games
// ---------------------------------------------------------------------------
async function importGames() {
  console.log('\nImporting games...');
  const records = readExport('games.json');

  const rows = records.map((r) => ({
    cfbd_game_id: r.cfbdGameId || r._id || null,
    year: r.year,
    week: String(r.week),
    home_team: r.homeTeam || null,
    away_team: r.awayTeam || null,
    game_time: toISO(r.startTime || r.gameTime),
    venue: r.venue || null,
    neutral_site: r.neutralSite ?? false,
    home_score: r.homeScore ?? null,
    away_score: r.awayScore ?? null,
    home_spread: r.homeSpread ?? r.spread ?? null,
    game_status: r.gameStatus || (r.completed ? 'final' : 'scheduled'),
    game_complete: r.gameComplete ?? r.completed ?? false,
    period: r.period ?? null,
    clock: r.clock || null,
    last_score_update: toISO(r.lastScoreUpdate),
  }));

  await upsert('games', rows, { onConflict: 'cfbd_game_id' });
}

// ---------------------------------------------------------------------------
// 4. Users — generates new UUIDs and builds Firebase UID → UUID mapping
// ---------------------------------------------------------------------------
async function importUsers() {
  console.log('\nImporting users...');
  const records = readExport('users.json');

  // Load existing mapping if re-running (keeps UUIDs stable across runs)
  if (fs.existsSync(MAPPING_FILE)) {
    uidMap = JSON.parse(fs.readFileSync(MAPPING_FILE, 'utf-8'));
    console.log(`  Loaded existing UID mapping (${Object.keys(uidMap).length} entries)`);
  }

  const rows = records.map((r) => {
    const firebaseUid = r._id;
    // Reuse existing UUID if we've already assigned one, otherwise generate new
    if (!uidMap[firebaseUid]) {
      uidMap[firebaseUid] = randomUUID();
    }
    return {
      id: uidMap[firebaseUid],
      firebase_uid: firebaseUid,
      first_name: r.firstName || null,
      last_name: r.lastName || null,
      email: r.email,
      dob: r.dob || null,
      is_admin: r.isAdmin ?? false,
      smack_talk: r.smackTalk || null,
      team_avatar: r.teamAvatar || null,
      custom_avatar: r.customAvatar ?? false,
      created_at: toISO(r.joinedAt) || new Date().toISOString(),
    };
  });

  await upsert('users', rows, { onConflict: 'firebase_uid' });

  // Save mapping to disk so other tables can use it and re-runs are stable
  fs.writeFileSync(MAPPING_FILE, JSON.stringify(uidMap, null, 2));
  console.log(`  Saved UID mapping → export/uid-mapping.json`);
}

// Helper to map a Firestore league ID to a Supabase UUID
function mapLeagueId(firestoreId) {
  if (!firestoreId) return null;
  if (!leagueMap[firestoreId]) {
    console.warn(`  ⚠ No UUID mapping for Firestore league ID: ${firestoreId}`);
    return null;
  }
  return leagueMap[firestoreId];
}

// ---------------------------------------------------------------------------
// 5. Leagues
// ---------------------------------------------------------------------------
async function importLeagues() {
  console.log('\nImporting leagues...');
  const records = readExport('leagues.json');

  // Load existing league mapping if re-running
  if (fs.existsSync(LEAGUE_MAPPING_FILE)) {
    leagueMap = JSON.parse(fs.readFileSync(LEAGUE_MAPPING_FILE, 'utf-8'));
    console.log(`  Loaded existing league ID mapping (${Object.keys(leagueMap).length} entries)`);
  }

  const rows = records.map((r) => {
    const firestoreId = r._id;
    if (!leagueMap[firestoreId]) {
      leagueMap[firestoreId] = randomUUID();
    }
    return {
      id: leagueMap[firestoreId],
      name: r.name,
      created_by: mapUid(r.createdBy),
      admin_id: mapUid(r.admin || r.createdBy),
      max_managers: r.maxManagers || 10,
      draft_complete: r.draftComplete ?? false,
      draft_type: r.draftType || 'manual',
      draft_order_type: r.draftOrderType || 'random',
      scoring_type: r.scoringType || 'cumulative',
      current_week: r.currentWeek || null,
      draft_date: toISO(r.draftDate),
      time_per_pick: r.timePerPick || null,
      created_at: toISO(r.createdAt) || new Date().toISOString(),
    };
  });

  await upsert('leagues', rows, { onConflict: 'id' });

  fs.writeFileSync(LEAGUE_MAPPING_FILE, JSON.stringify(leagueMap, null, 2));
  console.log(`  Saved league ID mapping → export/league-id-mapping.json`);
}

// ---------------------------------------------------------------------------
// 6. League Members
// ---------------------------------------------------------------------------
async function importLeagueMembers() {
  console.log('\nImporting league members...');
  const records = readExport('league_members.json');

  const rows = records
    .map((r) => ({
      league_id: mapLeagueId(r.leagueId),
      user_id: mapUid(r._id),
      team_name: r.teamName || null,
      points: r.points || 0,
      weekly_points: r.weeklyPoints || 0,
      weekly_points_history: r.weeklyPointsHistory || {},
      free_agent_moves: r.freeAgentMoves || 0,
      starters: r.lineup?.starters || [],
      bench: r.lineup?.bench || [],
      captain: r.lineup?.captain || null,
      trip_play_team: r.lineup?.tripPlayTeam || null,
      team_avatar: r.teamAvatar || null,
      custom_avatar: r.customAvatar ?? false,
      joined_at: toISO(r.joinedAt) || new Date().toISOString(),
    }))
    .filter((r) => r.user_id !== null);

  await upsert('league_members', rows, { onConflict: 'league_id,user_id' });
}

// ---------------------------------------------------------------------------
// 7. Drafts
// ---------------------------------------------------------------------------
async function importDrafts() {
  console.log('\nImporting drafts...');
  const records = readExport('drafts.json');

  const rows = records.map((r) => ({
    league_id: mapLeagueId(r.leagueId),
    draft_order: (r.draftOrder || []).map((uid) => mapUid(uid) || uid),
    current_pick_index: r.currentPickIndex || 0,
    selected_teams: remapKeys(r.selectedTeams || r.teams || {}),
    draft_started: r.draftStarted ?? false,
    draft_complete: r.draftComplete ?? false,
    draft_start_time: toISO(r.draftStartTime),
    pick_log: r.picks || [],
  }));

  await upsert('drafts', rows, { onConflict: 'league_id' });
}

// Remap object keys from Firebase UIDs to Supabase UUIDs
function remapKeys(obj) {
  const result = {};
  for (const [key, val] of Object.entries(obj)) {
    const newKey = uidMap[key] || key;
    result[newKey] = val;
  }
  return result;
}

// ---------------------------------------------------------------------------
// 8. Weekly Lineups
// ---------------------------------------------------------------------------
// Normalize starters/bench — can be plain strings or {team, lockedAt} objects
function normalizeTeamList(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map((item) => (typeof item === 'string' ? item : item?.team)).filter(Boolean);
}

const WEEK_KEYS = new Set([
  'week1','week2','week3','week4','week5','week6','week7',
  'week8','week9','week10','week11','week12','week13','week14',
  'Conference Championships','CFP Playoffs','National Championship',
]);

async function importWeeklyLineups() {
  console.log('\nImporting weekly lineups...');
  const records = readExport('weekly_lineups.json');
  const rows = [];

  for (const doc of records) {
    // Structure: _id = Firebase user UID, keys = week labels
    const firebaseUserId = doc._id;
    const leagueId = mapLeagueId(doc.leagueId);
    const mappedUserId = mapUid(firebaseUserId);
    if (!leagueId || !mappedUserId) continue;

    for (const [key, lineupData] of Object.entries(doc)) {
      if (['_id', 'leagueId'].includes(key)) continue;
      if (typeof lineupData !== 'object' || Array.isArray(lineupData)) continue;
      // Skip timestamp-only fields like lastCaptainMigration
      if (!lineupData.starters && !lineupData.bench) continue;

      // Normalise week label: "week1" → "Week 1", "week12" → "Week 12", etc.
      const week = key.startsWith('week')
        ? `Week ${key.replace('week', '')}`
        : key;

      rows.push({
        league_id: leagueId,
        user_id: mappedUserId,
        week,
        starters: normalizeTeamList(lineupData.starters),
        bench: normalizeTeamList(lineupData.bench),
        captain: lineupData.captain || null,
        trip_play_team: lineupData.tripPlayTeam || null,
        submitted_at: toISO(lineupData.lastUpdated || lineupData.migratedAt || lineupData.lockedAt) || new Date().toISOString(),
      });
    }
  }

  await upsert('weekly_lineups', rows, { onConflict: 'league_id,user_id,week' });
}

// ---------------------------------------------------------------------------
// 9. Weekly Standings
// ---------------------------------------------------------------------------
async function importWeeklyStandings() {
  console.log('\nImporting weekly standings...');
  const records = readExport('weekly_standings.json');
  const rows = [];

  for (const doc of records) {
    const userId = doc._id;
    const leagueId = mapLeagueId(doc.leagueId);
    if (!leagueId) continue;
    const mappedUserId = mapUid(userId);
    if (!mappedUserId) continue;
    for (const [week, standing] of Object.entries(doc)) {
      if (['_id', 'leagueId'].includes(week)) continue;
      if (typeof standing !== 'object') continue;
      rows.push({
        league_id: leagueId,
        user_id: mappedUserId,
        week,
        points: standing.points ?? null,
        rank: standing.rank ?? null,
        team_name: standing.teamName || null,
      });
    }
  }

  await upsert('weekly_standings', rows, { onConflict: 'league_id,user_id,week' });
}

// ---------------------------------------------------------------------------
// 10. Move History
// ---------------------------------------------------------------------------
async function importMoveHistory() {
  console.log('\nImporting move history...');
  const records = readExport('move_history.json');

  const rows = records
    .map((r) => ({
      league_id: mapLeagueId(r.leagueId),
      user_id: mapUid(r.userId),
      team_name: r.teamName || null,
      picked_up: r.pickedUp || null,
      dropped: r.dropped || null,
      move_type: r.moveType || null,
      week: r.week || null,
      created_at: toISO(r.timestamp) || new Date().toISOString(),
    }))
    .filter((r) => r.user_id !== null);

  await upsert('move_history', rows);
}

// ---------------------------------------------------------------------------
// 11. Playoffs
// ---------------------------------------------------------------------------
async function importPlayoffs() {
  console.log('\nImporting playoffs...');
  const records = readExport('playoffs.json');

  const rows = records.map((r) => ({
    league_id: mapLeagueId(r.leagueId),
    year: parseInt(r._id, 10) || new Date().getFullYear(),
    championship_bracket: r.championshipBracket || {},
    loser_bracket: r.loserBracket || {},
    final_draft_order: (r.finalDraftOrder || []).map((uid) => mapUid(uid) || uid),
    playoffs_complete: r.playoffsComplete ?? false,
  }));

  await upsert('playoffs', rows, { onConflict: 'league_id' });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('=== Supabase Import ===');
  console.log(`Source: ${EXPORT_DIR}`);

  await importConfig();
  await importTeams();
  await importGames();
  await importUsers();      // builds uidMap — must run before tables that reference users
  await importLeagues();
  await importLeagueMembers();
  await importDrafts();
  await importWeeklyLineups();
  await importWeeklyStandings();
  await importMoveHistory();
  await importPlayoffs();

  console.log('\n=== Import complete ===');
}

main().catch((err) => {
  console.error('\nImport failed:', err.message);
  process.exit(1);
});
