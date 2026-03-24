/**
 * cfbd.js
 *
 * Fetches spread/line data from the College Football Data API (CFBD)
 * and updates the games table with spread values + team next opponent fields.
 *
 * v2 schema notes:
 *   - next_opponent / next_opponent_spread / is_on_bye live in team_season_stats
 */

const { supabase } = require('./db');

const CFBD_BASE = 'https://api.collegefootballdata.com';

async function fetchCFBD(path) {
  const res = await fetch(`${CFBD_BASE}${path}`, {
    headers: { Authorization: `Bearer ${process.env.CFB_KEY}` },
  });
  if (!res.ok) throw new Error(`CFBD HTTP ${res.status} for ${path}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------
async function ingestCFBDLines() {
  console.log('[CFBD] Fetching lines...');

  const { data: configRow } = await supabase
    .from('config')
    .select('value')
    .eq('key', 'season')
    .single();

  const currentWeek = String(configRow?.value?.currentWeek ?? '');
  if (!currentWeek || ['Preseason', 'Off-Season', 'Offseason'].includes(currentWeek)) {
    console.log('[CFBD] Off-season — skipping');
    return;
  }

  const weekNum = parseInt(currentWeek.replace(/\D/g, ''), 10);
  if (isNaN(weekNum)) {
    console.log('[CFBD] Non-regular week — skipping lines ingestion');
    return;
  }

  const year = configRow?.value?.year || new Date().getFullYear();

  try {
    const lines = await fetchCFBD(`/lines?year=${year}&week=${weekNum}&seasonType=regular`);

    let updated = 0;
    for (const line of lines) {
      if (!line.homeTeam || !line.awayTeam) continue;

      const lineData =
        line.lines?.find((l) => l.provider === 'consensus') ||
        line.lines?.find((l) => l.provider === 'Bovada') ||
        line.lines?.[0];

      if (!lineData?.spread) continue;

      const spread = parseFloat(lineData.spread);
      if (isNaN(spread)) continue;

      const homeSlug = line.homeTeam.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

      await supabase
        .from('games')
        .update({ home_spread: spread })
        .eq('year', year)
        .eq('week', weekNum)
        .ilike('home_team', homeSlug);

      updated++;
    }

    console.log(`[CFBD] Updated spreads for ${updated} games`);
  } catch (err) {
    console.error('[CFBD] Failed to fetch lines:', err.message);
  }

  await updateNextOpponents(weekNum, year);
}

async function updateNextOpponents(weekNum, year) {
  const { data: upcomingGames } = await supabase
    .from('games')
    .select('*')
    .eq('year', year)
    .eq('week', weekNum)
    .eq('game_complete', false);

  if (!upcomingGames?.length) return;

  for (const game of upcomingGames) {
    if (game.home_team) {
      await supabase
        .from('team_season_stats')
        .upsert(
          {
            team_id:                      game.home_team,
            season_year:                  year,
            next_opponent:                game.away_team,
            next_game_is_home:            true,
            next_opponent_spread:         game.home_spread,
            next_opponent_spread_display: game.home_spread
              ? `${game.home_spread > 0 ? '+' : ''}${game.home_spread}`
              : null,
            is_on_bye: false,
          },
          { onConflict: 'team_id,season_year' }
        );
    }

    if (game.away_team) {
      const awaySpread = game.home_spread !== null ? -game.home_spread : null;
      await supabase
        .from('team_season_stats')
        .upsert(
          {
            team_id:                      game.away_team,
            season_year:                  year,
            next_opponent:                game.home_team,
            next_game_is_home:            false,
            next_opponent_spread:         awaySpread,
            next_opponent_spread_display: awaySpread
              ? `${awaySpread > 0 ? '+' : ''}${awaySpread}`
              : null,
            is_on_bye: false,
          },
          { onConflict: 'team_id,season_year' }
        );
    }
  }

  console.log(`[CFBD] Updated next opponent for ${upcomingGames.length * 2} teams`);
}

module.exports = { ingestCFBDLines };
