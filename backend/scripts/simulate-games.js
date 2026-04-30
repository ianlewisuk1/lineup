/**
 * simulate-games.js — Off-season scoring feature test harness
 *
 * Creates fake in-progress games in Supabase so you can test freeze play,
 * captain (2x), and trip play (3x) without waiting for CFB season.
 *
 * Usage (run from lineup/backend/):
 *   node scripts/simulate-games.js setup    — create test games, set config week
 *   node scripts/simulate-games.js tick     — advance scores, recalculate points
 *   node scripts/simulate-games.js final    — complete all games, run final scoring
 *   node scripts/simulate-games.js clean    — remove test data, restore Off-Season
 *
 * Add some of the team slugs printed by "setup" to your lineup before testing.
 */

require('dotenv').config();
const path = require('path');

const { supabase } = require('../db');
const { calculateTeamFantasyPoints, recalculateAllMemberPoints } = require('../scoring');

const TEST_WEEK = '3';
const TEST_YEAR = 2026;
const SIM_PREFIX = 'SIM_';

// Matchups to simulate. home_spread is from home team's perspective (negative = home favourite).
const MATCHUPS = [
  { home: 'alabama',    away: 'auburn',    homeSpread: -7.5 },
  { home: 'ohio-state', away: 'michigan',  homeSpread: -3.5 },
  { home: 'georgia',    away: 'florida',   homeSpread: -10  },
];

// ---------------------------------------------------------------------------
// setup — insert test games + mark teams as in_progress
// ---------------------------------------------------------------------------
async function setup() {
  console.log('[SIM] Setting up test games...');

  const { data: cfg, error: cfgErr } = await supabase
    .from('config').select('value').eq('key', 'season').single();
  if (cfgErr) { console.error('[SIM] Config read error:', cfgErr.message); process.exit(1); }

  await supabase.from('config')
    .update({ value: { ...(cfg?.value || {}), currentWeek: TEST_WEEK } })
    .eq('key', 'season');

  const gameRows = MATCHUPS.map((m, i) => ({
    cfbd_game_id:  `${SIM_PREFIX}${i + 1}`,
    year:          TEST_YEAR,
    week:          TEST_WEEK,
    home_team:     m.home,
    away_team:     m.away,
    home_spread:   m.homeSpread,
    home_score:    0,
    away_score:    0,
    game_status:   'in_progress',
    game_complete: false,
    period:        3,
    clock:         '15:00',
  }));

  const { error: gameErr } = await supabase
    .from('games')
    .upsert(gameRows, { onConflict: 'cfbd_game_id' });
  if (gameErr) { console.error('[SIM] Game insert error:', gameErr.message); process.exit(1); }

  const allTeamIds = MATCHUPS.flatMap(m => [m.home, m.away]);
  for (const teamId of allTeamIds) {
    const { error } = await supabase.from('team_season_stats').upsert({
      team_id:       teamId,
      season_year:   TEST_YEAR,
      game_status:   'in_progress',
      game_complete: false,
      weekly_points: { [TEST_WEEK]: 0 },
    }, { onConflict: 'team_id,season_year' });
    if (error) console.error(`[SIM] Stats error for ${teamId}:`, error.message);
  }

  console.log(`\n[SIM] Done. Config week → ${TEST_WEEK} (was ${cfg?.value?.currentWeek})`);
  console.log('[SIM] Test games:');
  MATCHUPS.forEach((m, i) =>
    console.log(`  ${SIM_PREFIX}${i + 1}: ${m.home} (${m.homeSpread}) vs ${m.away}`)
  );
  console.log('\n[SIM] Add any of these team slugs to your lineup, then run "tick" to test:\n  ' +
    allTeamIds.join(', '));
}

// ---------------------------------------------------------------------------
// tick — advance each game score and recalculate member points
// ---------------------------------------------------------------------------
async function tick() {
  const { data: games, error } = await supabase
    .from('games')
    .select('*')
    .like('cfbd_game_id', `${SIM_PREFIX}%`)
    .eq('year', TEST_YEAR);

  if (error || !games?.length) {
    console.error('[SIM] No test games found — run "setup" first.');
    process.exit(1);
  }

  console.log('[SIM] Advancing scores...');

  for (const game of games) {
    const idx = parseInt(game.cfbd_game_id.replace(SIM_PREFIX, ''), 10);
    // Home scores a TD (7), away scores a FG (3) — alternates each tick based on game index
    const newHome = (game.home_score || 0) + (idx % 2 === 1 ? 7 : 3);
    const newAway = (game.away_score || 0) + (idx % 2 === 0 ? 7 : 3);
    const newPeriod = Math.min((game.period || 3) + 1, 4);

    await supabase.from('games').update({
      home_score: newHome,
      away_score: newAway,
      period:     newPeriod,
      clock:      newPeriod === 4 ? '08:22' : '12:00',
    }).eq('id', game.id);

    // Live fantasy points based on current score
    const spread = game.home_spread;
    const homePts = calculateTeamFantasyPoints({
      won:          newHome > newAway,
      isUnderdog:   spread !== null && spread > 0,
      spread,
      actualMargin: newHome - newAway,
    });
    const awayPts = calculateTeamFantasyPoints({
      won:          newAway > newHome,
      isUnderdog:   spread !== null && spread < 0,
      spread:       spread !== null ? -spread : null,
      actualMargin: newAway - newHome,
    });

    for (const [teamId, pts] of [[game.home_team, homePts], [game.away_team, awayPts]]) {
      await supabase.from('team_season_stats').upsert({
        team_id:       teamId,
        season_year:   TEST_YEAR,
        game_status:   'in_progress',
        game_complete: false,
        weekly_points: { [TEST_WEEK]: pts },
      }, { onConflict: 'team_id,season_year' });
    }

    console.log(
      `  ${game.home_team} ${newHome} – ${game.away_team} ${newAway}` +
      `  Q${newPeriod} | home pts: ${homePts}  away pts: ${awayPts}`
    );
  }

  await recalculateAllMemberPoints(TEST_WEEK);
  console.log('[SIM] Tick done — member points recalculated. Run "tick" again or "final" to complete.');
}

// ---------------------------------------------------------------------------
// final — mark games complete, write final points, run full scoring
// ---------------------------------------------------------------------------
async function final() {
  const { data: games, error } = await supabase
    .from('games')
    .select('*')
    .like('cfbd_game_id', `${SIM_PREFIX}%`)
    .eq('year', TEST_YEAR);

  if (error || !games?.length) {
    console.error('[SIM] No test games found — run "setup" first.');
    process.exit(1);
  }

  console.log('[SIM] Finalising test games...');

  for (const game of games) {
    await supabase.from('games').update({
      game_status:   'final',
      game_complete: true,
      period:        4,
      clock:         '00:00',
    }).eq('id', game.id);

    const hs = game.home_score || 21;
    const as = game.away_score || 14;
    const spread = game.home_spread;

    const homePts = calculateTeamFantasyPoints({
      won:          hs > as,
      isUnderdog:   spread !== null && spread > 0,
      spread,
      actualMargin: hs - as,
    });
    const awayPts = calculateTeamFantasyPoints({
      won:          as > hs,
      isUnderdog:   spread !== null && spread < 0,
      spread:       spread !== null ? -spread : null,
      actualMargin: as - hs,
    });

    for (const [teamId, pts] of [[game.home_team, homePts], [game.away_team, awayPts]]) {
      const { data: existing } = await supabase
        .from('team_season_stats')
        .select('weekly_points')
        .eq('team_id', teamId)
        .eq('season_year', TEST_YEAR)
        .single();

      const weeklyPoints = { ...(existing?.weekly_points || {}), [TEST_WEEK]: pts };
      const gamePoints   = Object.values(weeklyPoints).reduce((a, b) => a + b, 0);

      await supabase.from('team_season_stats').upsert({
        team_id:       teamId,
        season_year:   TEST_YEAR,
        weekly_points: weeklyPoints,
        game_points:   gamePoints,
        game_status:   'final',
        game_complete: true,
      }, { onConflict: 'team_id,season_year' });
    }

    console.log(`  Final: ${game.home_team} ${hs} – ${game.away_team} ${as} | home pts: ${homePts}  away pts: ${awayPts}`);
  }

  await recalculateAllMemberPoints(TEST_WEEK);
  console.log('[SIM] Done. Check standings for your test league.');
}

// ---------------------------------------------------------------------------
// clean — remove all test data, restore Off-Season config
// ---------------------------------------------------------------------------
async function clean() {
  console.log('[SIM] Cleaning up...');

  const { data: games } = await supabase
    .from('games')
    .select('home_team, away_team')
    .like('cfbd_game_id', `${SIM_PREFIX}%`);

  const teamIds = (games || []).flatMap(g => [g.home_team, g.away_team]).filter(Boolean);

  await supabase.from('games').delete().like('cfbd_game_id', `${SIM_PREFIX}%`);

  for (const teamId of teamIds) {
    const { data: existing } = await supabase
      .from('team_season_stats')
      .select('weekly_points, game_points')
      .eq('team_id', teamId)
      .eq('season_year', TEST_YEAR)
      .single();

    if (existing) {
      const weeklyPoints = { ...(existing.weekly_points || {}) };
      delete weeklyPoints[TEST_WEEK];
      const gamePoints = Object.values(weeklyPoints).reduce((a, b) => a + b, 0);

      await supabase.from('team_season_stats').upsert({
        team_id:       teamId,
        season_year:   TEST_YEAR,
        weekly_points: weeklyPoints,
        game_points:   gamePoints,
        game_status:   'scheduled',
        game_complete: false,
      }, { onConflict: 'team_id,season_year' });
    }
  }

  const { data: cfg } = await supabase.from('config').select('value').eq('key', 'season').single();
  await supabase.from('config')
    .update({ value: { ...(cfg?.value || {}), currentWeek: 'Off-Season' } })
    .eq('key', 'season');

  console.log('[SIM] Cleanup done. Config restored to Off-Season.');
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
const COMMANDS = { setup, tick, final, clean };
const cmd = process.argv[2];

if (!COMMANDS[cmd]) {
  console.log('Usage: node scripts/simulate-games.js <setup|tick|final|clean>');
  process.exit(1);
}

COMMANDS[cmd]()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('[SIM] Fatal:', err.message);
    process.exit(1);
  });
