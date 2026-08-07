/**
 * scoring.js
 *
 * Fantasy point calculation logic.
 *
 * Scoring system:
 *   Win:  +5 pts
 *   Loss: -3 pts
 *   Underdog win bonus: +3 pts
 *   Cover spread (tiered): -5 to +5 pts
 *
 * v2 schema notes:
 *   - Team weekly points live in team_season_stats.weekly_points (keyed by week number string, e.g. "3")
 *   - Lineup data (starters, captain, trip_play_team, frozen_teams) lives in weekly_lineups
 *   - Results written to weekly_lineups.team_points + weekly_lineups.points
 *   - Cumulative season total written to league_members.points
 */

const { supabase } = require('./db');

// Week 0 — the late-August opening weekend, split out from CFBD's week 1 by
// backend/schedule.js. Those games ingest and display like any other, so the
// live pipeline gets a real run before anything counts, but they award no
// fantasy points: no member scoring, and excluded from team season totals.
const WEEK_ZERO = '0';

// ---------------------------------------------------------------------------
// Extract a numeric week from a config week value ("Week 3", "3", 3 → "3")
// ---------------------------------------------------------------------------
function normalizeWeekKey(week) {
  if (week === null || week === undefined) return null;
  const n = parseInt(String(week).replace(/\D/g, ''), 10);
  return isNaN(n) ? null : String(n);
}

// ---------------------------------------------------------------------------
// Core scoring formula
// ---------------------------------------------------------------------------
function calculateTeamFantasyPoints({ won, isUnderdog, spread, actualMargin }) {
  let points = won ? 5 : -3;

  if (isUnderdog && won) points += 3;

  if (spread !== null && spread !== undefined) {
    let coverPoints;
    if (spread < 0) {
      coverPoints = actualMargin - Math.abs(spread);
    } else if (spread > 0) {
      coverPoints = actualMargin + spread;
    } else {
      coverPoints = actualMargin;
    }

    if (Math.abs(coverPoints) < 0.5) {
      // Push — no spread points
    } else if (coverPoints >= 20) {
      points += 5;
    } else if (coverPoints >= 14.5) {
      points += 3;
    } else if (coverPoints >= 7.5) {
      points += 2;
    } else if (coverPoints >= 0.5) {
      points += 1;
    } else if (coverPoints >= -7) {
      points -= 1;
    } else if (coverPoints >= -14) {
      points -= 2;
    } else if (coverPoints >= -20) {
      points -= 3;
    } else {
      points -= 5;
    }
  }

  return points;
}

// ---------------------------------------------------------------------------
// Recalculate all member points for a given week
// ---------------------------------------------------------------------------
async function recalculateAllMemberPoints(currentWeek) {
  console.log('[Scoring] Recalculating member points for week', currentWeek);

  const weekKey = normalizeWeekKey(currentWeek);
  if (!weekKey) {
    console.warn('[Scoring] Invalid week, skipping:', currentWeek);
    return;
  }

  if (weekKey === WEEK_ZERO) {
    console.log('[Scoring] Week 0 is a dress rehearsal — no fantasy points awarded');
    return;
  }

  // Get all team weekly points from team_season_stats in one query
  const { data: stats } = await supabase
    .from('team_season_stats')
    .select('team_id, weekly_points');

  const teamPointsMap = {};
  for (const s of stats || []) {
    teamPointsMap[s.team_id] = s.weekly_points || {};
  }

  // Get all leagues
  const { data: leagues } = await supabase.from('leagues').select('id');
  if (!leagues?.length) return;

  for (const league of leagues) {
    // Get all lineups for this week in this league
    const { data: lineups } = await supabase
      .from('weekly_lineups')
      .select('id, member_id, starters, captain, trip_play_team, frozen_teams, team_points')
      .eq('league_id', league.id)
      .eq('week', parseInt(weekKey, 10));

    if (!lineups?.length) continue;

    for (const lineup of lineups) {
      const starters      = lineup.starters || [];
      const captain       = lineup.captain;
      const tripPlayTeam  = lineup.trip_play_team;
      const frozenTeams   = lineup.frozen_teams || [];
      const storedPoints  = lineup.team_points || {};

      let weeklyPoints = 0;
      const teamPoints = {};

      for (const teamId of starters) {
        let pts;

        // Frozen teams keep their stored score regardless of final result
        if (frozenTeams.includes(teamId) && storedPoints[teamId] !== undefined) {
          pts = storedPoints[teamId];
        } else {
          const rawPts = (teamPointsMap[teamId] || {})[weekKey] ?? 0;

          if (teamId === captain && teamId === tripPlayTeam) {
            pts = rawPts * 5;
          } else if (teamId === captain) {
            pts = rawPts * 2;
          } else if (teamId === tripPlayTeam) {
            pts = rawPts * 3;
          } else {
            pts = rawPts;
          }
        }

        teamPoints[teamId] = pts;
        weeklyPoints += pts;
      }

      // Write per-team earned points + week total back to weekly_lineups
      await supabase
        .from('weekly_lineups')
        .update({ team_points: teamPoints, points: weeklyPoints })
        .eq('id', lineup.id);
    }

    // Recalculate each member's cumulative season total from all their weekly_lineups
    const { data: allLineups } = await supabase
      .from('weekly_lineups')
      .select('member_id, points')
      .eq('league_id', league.id);

    const memberTotals = {};
    for (const l of allLineups || []) {
      memberTotals[l.member_id] = (memberTotals[l.member_id] || 0) + (l.points || 0);
    }

    for (const [memberId, total] of Object.entries(memberTotals)) {
      await supabase
        .from('league_members')
        .update({ points: total })
        .eq('id', memberId);
    }
  }

  console.log('[Scoring] Member points updated');
}

// ---------------------------------------------------------------------------
// Backfill: re-process games that completed in the last 24h but were missed
// ---------------------------------------------------------------------------
async function backfillRecentGames() {
  console.log('[Backfill] Checking for recently completed games...');

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: games } = await supabase
    .from('games')
    .select('*')
    .eq('game_complete', true)
    .gte('date', since);

  if (!games?.length) {
    console.log('[Backfill] No recent games found');
    return;
  }

  console.log(`[Backfill] Found ${games.length} recently completed games`);

  const { data: configRow } = await supabase
    .from('config')
    .select('value')
    .eq('key', 'season')
    .single();

  const currentWeek = configRow?.value?.currentWeek;
  if (currentWeek) {
    await recalculateAllMemberPoints(currentWeek);
  }
}

// ---------------------------------------------------------------------------
// Update team W-L records in team_season_stats from completed games
// ---------------------------------------------------------------------------
async function updateTeamRecords() {
  console.log('[Records] Updating team records from schedule...');

  const { data: configRow } = await supabase
    .from('config')
    .select('value')
    .eq('key', 'season')
    .single();

  const year = configRow?.value?.year || new Date().getFullYear();

  const { data: games } = await supabase
    .from('games')
    .select('*')
    .eq('game_complete', true);

  if (!games?.length) return;

  const records = {};
  for (const game of games) {
    for (const [teamId, isHome] of [[game.home_team, true], [game.away_team, false]]) {
      if (!teamId) continue;
      if (!records[teamId]) records[teamId] = { wins: 0, losses: 0 };
      const teamScore = isHome ? game.home_score : game.away_score;
      const oppScore  = isHome ? game.away_score : game.home_score;
      if (teamScore > oppScore) records[teamId].wins++;
      else records[teamId].losses++;
    }
  }

  for (const [teamId, rec] of Object.entries(records)) {
    await supabase
      .from('team_season_stats')
      .upsert(
        { team_id: teamId, season_year: year, record: `${rec.wins}-${rec.losses}` },
        { onConflict: 'team_id,season_year' }
      );
  }

  console.log(`[Records] Updated records for ${Object.keys(records).length} teams`);
}

module.exports = {
  WEEK_ZERO,
  calculateTeamFantasyPoints,
  recalculateAllMemberPoints,
  backfillRecentGames,
  updateTeamRecords,
};
