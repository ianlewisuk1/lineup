/**
 * espn.js
 *
 * Fetches live scores from the ESPN college football scoreboard API and
 * updates game records + team weekly points in Supabase.
 *
 * Ported from functions/index.js (triggerLiveScoresScheduled logic).
 */

const { supabase } = require('./db');
const { calculateTeamFantasyPoints, recalculateAllMemberPoints } = require('./scoring');

const ESPN_URL =
  'https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard?groups=80';

const RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 300;
const FETCH_TIMEOUT_MS = 7000;

// ---------------------------------------------------------------------------
// Fetch with retry + timeout
// ---------------------------------------------------------------------------
async function fetchESPN(url) {
  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`ESPN HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (attempt === RETRY_ATTEMPTS) throw err;
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * attempt));
    }
  }
}

// ---------------------------------------------------------------------------
// Team name normalization (ESPN → our team ids)
// Ported from functions/index.js baseNorm()
// ---------------------------------------------------------------------------
function normalizeESPNName(name) {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// Build a lookup map from ESPN event: homeTeam slug → event
function buildEventIndex(events) {
  const index = new Map();
  for (const event of events) {
    const competition = event.competitions?.[0];
    if (!competition) continue;
    for (const competitor of competition.competitors || []) {
      const slug = normalizeESPNName(competitor.team?.location || '');
      if (slug) index.set(slug, { event, competition, competitor });
    }
  }
  return index;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------
async function ingestESPNScores() {
  console.log('[ESPN] Fetching scores...');

  // Get current week from config
  const { data: configRow } = await supabase
    .from('config')
    .select('value')
    .eq('key', 'season')
    .single();

  const currentWeek = String(configRow?.value?.currentWeek ?? '');
  if (!currentWeek || ['Preseason', 'Off-Season', 'Offseason'].includes(currentWeek)) {
    console.log('[ESPN] Off-season — skipping');
    return;
  }

  // Fetch ESPN data
  const espnData = await fetchESPN(ESPN_URL);
  const events = espnData?.events || [];
  if (!events.length) {
    console.log('[ESPN] No events returned');
    return;
  }

  // Get all games for the current week
  const { data: games, error: gamesErr } = await supabase
    .from('games')
    .select('*')
    .eq('year', new Date().getFullYear())
    .eq('week', currentWeek);

  if (gamesErr) throw gamesErr;

  const eventIndex = buildEventIndex(events);
  const teamUpdates = [];
  let updatedGames = 0;

  for (const game of games) {
    if (game.game_complete) continue;

    // Try to find matching ESPN event by home team name
    const homeSlug = normalizeESPNName(game.home_team);
    const match = eventIndex.get(homeSlug);
    if (!match) continue;

    const { competition } = match;
    const status = competition.status?.type?.name || '';
    const completed = status === 'STATUS_FINAL';
    const inProgress = status === 'STATUS_IN_PROGRESS' || status === 'STATUS_HALFTIME';

    let homeScore = null;
    let awayScore = null;
    for (const comp of competition.competitors || []) {
      const score = parseInt(comp.score, 10);
      if (comp.homeAway === 'home') homeScore = score;
      else awayScore = score;
    }

    const gameStatus = completed ? 'final' : inProgress ? 'in_progress' : 'scheduled';

    // Update game record
    const { error: updateErr } = await supabase
      .from('games')
      .update({
        home_score: homeScore,
        away_score: awayScore,
        game_status: gameStatus,
        game_complete: completed,
        last_score_update: new Date().toISOString(),
      })
      .eq('id', game.id);

    if (updateErr) {
      console.error(`[ESPN] Failed to update game ${game.id}:`, updateErr.message);
      continue;
    }

    updatedGames++;

    // If game just completed, calculate fantasy points for both teams
    if (completed && homeScore !== null && awayScore !== null) {
      const spread = game.home_spread;

      const homePoints = calculateTeamFantasyPoints({
        won: homeScore > awayScore,
        isUnderdog: spread !== null && spread > 0,
        spread,
        actualMargin: homeScore - awayScore,
      });

      const awayPoints = calculateTeamFantasyPoints({
        won: awayScore > homeScore,
        isUnderdog: spread !== null && spread < 0,
        spread: spread !== null ? -spread : null,
        actualMargin: awayScore - homeScore,
      });

      teamUpdates.push({ teamId: game.home_team, week: currentWeek, points: homePoints });
      teamUpdates.push({ teamId: game.away_team, week: currentWeek, points: awayPoints });
    }
  }

  // Update weekly_points JSONB for each team
  for (const { teamId, week, points } of teamUpdates) {
    const { data: team } = await supabase
      .from('teams')
      .select('weekly_points, game_points')
      .eq('id', teamId)
      .single();

    if (!team) continue;

    const weeklyPoints = team.weekly_points || {};
    weeklyPoints[week] = points;

    const gamePoints = Object.values(weeklyPoints).reduce((a, b) => a + b, 0);

    await supabase
      .from('teams')
      .update({ weekly_points: weeklyPoints, game_points: gamePoints, game_complete: true, game_status: 'final' })
      .eq('id', teamId);
  }

  console.log(`[ESPN] Updated ${updatedGames} games, ${teamUpdates.length} team point updates`);

  // Recalculate all member points if any games completed
  if (teamUpdates.length > 0) {
    await recalculateAllMemberPoints(currentWeek);
  }
}

module.exports = { ingestESPNScores };
