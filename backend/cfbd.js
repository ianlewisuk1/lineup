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
// Spreads are matched to games by cfbd_game_id, not by team name.
//
// The previous version slugged line.homeTeam with a local regex and did an
// ilike against games.home_team. That regex stripped "&", so Texas A&M never
// matched, and an ilike on a slug would have hit both Miami rows had they
// collided. CFBD's /lines payload carries the same game id as /games, which
// backend/schedule.js already stored in games.cfbd_game_id.
// ---------------------------------------------------------------------------

// Provider preference. CFBD used to expose a "consensus" provider and this code
// asked for it first; it no longer exists, so that branch never matched and the
// spread fell through to Bovada or to whatever happened to be first in the
// array. That meant the spread — which drives the underdog bonus in scoring.js
// — came from a different sportsbook game to game.
//
// On 2025 week 5, ESPN Bet covered all 106 games while DraftKings and Bovada
// each covered 53, so ESPN Bet leads. The rest are fallbacks.
const PROVIDER_PREFERENCE = ['ESPN Bet', 'DraftKings', 'Bovada'];

function pickLine(lines) {
  if (!lines?.length) return null;
  for (const provider of PROVIDER_PREFERENCE) {
    const match = lines.find((l) => l.provider === provider && l.spread != null);
    if (match) return match;
  }
  return lines.find((l) => l.spread != null) || null;
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
    let unmatched = 0;

    for (const line of lines) {
      if (!line.id) continue;

      const lineData = pickLine(line.lines);
      if (!lineData) continue;

      const spread = parseFloat(lineData.spread);
      if (isNaN(spread)) continue;

      const { data, error } = await supabase
        .from('games')
        .update({ home_spread: spread })
        .eq('cfbd_game_id', String(line.id))
        .select('id');

      if (error) {
        console.error(`[CFBD] game ${line.id}: ${error.message}`);
        continue;
      }

      if (data?.length) updated++;
      else unmatched++;
    }

    console.log(`[CFBD] Updated spreads for ${updated} games`);

    // A line with no matching game row means the schedule import has not run
    // for this week, or CFBD added a game after the last import.
    if (unmatched) {
      console.log(`[CFBD] ${unmatched} lines had no matching game row — re-run the schedule import`);
    }
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
