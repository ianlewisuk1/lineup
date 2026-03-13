/**
 * scoring.js
 *
 * Fantasy point calculation logic.
 * Ported directly from functions/index.js calculateTeamFantasyPoints().
 *
 * Scoring system:
 *   Win:  +5 pts
 *   Loss: -3 pts
 *   Underdog win bonus: +3 pts
 *   Cover spread (tiered): -5 to +5 pts
 */

const { supabase } = require('./db');

// ---------------------------------------------------------------------------
// Core scoring formula (unchanged from Cloud Functions)
// ---------------------------------------------------------------------------
function calculateTeamFantasyPoints({ won, isUnderdog, spread, actualMargin }) {
  // Base win/loss
  let points = won ? 5 : -3;

  // Underdog bonus
  if (isUnderdog && won) points += 3;

  // Spread cover points
  if (spread !== null && spread !== undefined) {
    let coverPoints;
    if (spread < 0) {
      // Team was favored
      coverPoints = actualMargin - Math.abs(spread);
    } else if (spread > 0) {
      // Team was underdog
      coverPoints = actualMargin + spread;
    } else {
      // Pick'em
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
// Recalculate all member season points based on their lineup + team weekly pts
// ---------------------------------------------------------------------------
async function recalculateAllMemberPoints(currentWeek) {
  console.log('[Scoring] Recalculating member points for', currentWeek);

  // Get all leagues
  const { data: leagues } = await supabase.from('leagues').select('id');
  if (!leagues?.length) return;

  // Get all team weekly points in one query
  const { data: teams } = await supabase.from('teams').select('id, weekly_points');
  const teamPointsMap = {};
  for (const t of teams || []) {
    teamPointsMap[t.id] = t.weekly_points || {};
  }

  for (const league of leagues) {
    const { data: members } = await supabase
      .from('league_members')
      .select('*')
      .eq('league_id', league.id);

    if (!members?.length) continue;

    for (const member of members) {
      const starters = member.starters || [];
      const captain = member.captain;
      const tripPlayTeam = member.trip_play_team;

      let weeklyPoints = 0;
      for (const teamId of starters) {
        const teamWeeklyPoints = teamPointsMap[teamId] || {};
        let pts = teamWeeklyPoints[currentWeek] ?? 0;

        if (teamId === captain && teamId === tripPlayTeam) {
          pts *= 5;
        } else if (teamId === captain) {
          pts *= 2;
        } else if (teamId === tripPlayTeam) {
          pts *= 3;
        }

        weeklyPoints += pts;
      }

      // Rebuild season total from weekly history + current week
      const history = member.weekly_points_history || {};
      history[currentWeek] = weeklyPoints;
      const totalPoints = Object.values(history).reduce((a, b) => a + b, 0);

      await supabase
        .from('league_members')
        .update({
          weekly_points: weeklyPoints,
          weekly_points_history: history,
          points: totalPoints,
        })
        .eq('id', member.id);
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
    .gte('last_score_update', since);

  if (!games?.length) {
    console.log('[Backfill] No recent games found');
    return;
  }

  console.log(`[Backfill] Found ${games.length} recently completed games`);

  // Get current week and trigger a recalculation
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
// Update team W-L records from completed schedule games
// ---------------------------------------------------------------------------
async function updateTeamRecords() {
  console.log('[Records] Updating team records from schedule...');

  const { data: games } = await supabase
    .from('games')
    .select('*')
    .eq('game_complete', true);

  if (!games?.length) return;

  // Tally wins/losses per team
  const records = {}; // teamId → { wins, losses, confWins, confLosses }

  for (const game of games) {
    for (const [teamId, isHome] of [[game.home_team, true], [game.away_team, false]]) {
      if (!teamId) continue;
      if (!records[teamId]) records[teamId] = { wins: 0, losses: 0 };
      const teamScore = isHome ? game.home_score : game.away_score;
      const oppScore = isHome ? game.away_score : game.home_score;
      if (teamScore > oppScore) records[teamId].wins++;
      else records[teamId].losses++;
    }
  }

  // Update team records
  for (const [teamId, rec] of Object.entries(records)) {
    await supabase
      .from('teams')
      .update({ record: `${rec.wins}-${rec.losses}` })
      .eq('id', teamId);
  }

  console.log(`[Records] Updated records for ${Object.keys(records).length} teams`);
}

module.exports = {
  calculateTeamFantasyPoints,
  recalculateAllMemberPoints,
  backfillRecentGames,
  updateTeamRecords,
};
