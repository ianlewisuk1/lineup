/**
 * espn.js
 *
 * Fetches live scores from the ESPN college football scoreboard API and
 * updates game records + team weekly points in Supabase.
 *
 * v2 schema notes:
 *   - Team stat writes go to team_season_stats (upsert on team_id, season_year)
 *   - weekly_points keyed by normalised week number string ("3", "14", etc.)
 */

const { supabase } = require('./db');
const { calculateTeamFantasyPoints, recalculateAllMemberPoints } = require('./scoring');

const ESPN_URL =
  'https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard?groups=80';

const RETRY_ATTEMPTS  = 3;
const RETRY_DELAY_MS  = 300;
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

  // Normalised week key for JSONB storage ("Week 3" → "3")
  const weekKey = String(parseInt(currentWeek.replace(/\D/g, ''), 10));
  if (weekKey === 'NaN') {
    console.log('[ESPN] Non-numeric week — skipping');
    return;
  }

  const year = configRow?.value?.year || new Date().getFullYear();

  const espnData = await fetchESPN(ESPN_URL);
  const events = espnData?.events || [];
  if (!events.length) {
    console.log('[ESPN] No events returned');
    return;
  }

  const { data: games, error: gamesErr } = await supabase
    .from('games')
    .select('*')
    .eq('year', year)
    .eq('week', parseInt(weekKey, 10));

  if (gamesErr) throw gamesErr;

  const eventIndex  = buildEventIndex(events);
  const teamUpdates = [];
  let updatedGames  = 0;

  for (const game of games) {
    if (game.game_complete) continue;

    const homeSlug = normalizeESPNName(game.home_team);
    const match = eventIndex.get(homeSlug);
    if (!match) continue;

    const { competition } = match;
    const status    = competition.status?.type?.name || '';
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

    const { error: updateErr } = await supabase
      .from('games')
      .update({
        home_score:    homeScore,
        away_score:    awayScore,
        game_status:   gameStatus,
        game_complete: completed,
      })
      .eq('id', game.id);

    if (updateErr) {
      console.error(`[ESPN] Failed to update game ${game.id}:`, updateErr.message);
      continue;
    }

    updatedGames++;

    if (completed && homeScore !== null && awayScore !== null) {
      const spread = game.home_spread;

      const homePoints = calculateTeamFantasyPoints({
        won:          homeScore > awayScore,
        isUnderdog:   spread !== null && spread > 0,
        spread,
        actualMargin: homeScore - awayScore,
      });

      const awayPoints = calculateTeamFantasyPoints({
        won:          awayScore > homeScore,
        isUnderdog:   spread !== null && spread < 0,
        spread:       spread !== null ? -spread : null,
        actualMargin: awayScore - homeScore,
      });

      teamUpdates.push({ teamId: game.home_team, weekKey, points: homePoints, year });
      teamUpdates.push({ teamId: game.away_team, weekKey, points: awayPoints, year });
    }
  }

  // Write weekly points to team_season_stats
  for (const { teamId, weekKey: wk, points, year: yr } of teamUpdates) {
    const { data: existing } = await supabase
      .from('team_season_stats')
      .select('weekly_points, game_points')
      .eq('team_id', teamId)
      .eq('season_year', yr)
      .single();

    const weeklyPoints = existing?.weekly_points || {};
    weeklyPoints[wk] = points;
    const gamePoints = Object.values(weeklyPoints).reduce((a, b) => a + b, 0);

    await supabase
      .from('team_season_stats')
      .upsert(
        {
          team_id:       teamId,
          season_year:   yr,
          weekly_points: weeklyPoints,
          game_points:   gamePoints,
          game_complete: true,
          game_status:   'final',
        },
        { onConflict: 'team_id,season_year' }
      );
  }

  console.log(`[ESPN] Updated ${updatedGames} games, ${teamUpdates.length} team point updates`);

  if (teamUpdates.length > 0) {
    await recalculateAllMemberPoints(currentWeek);
  }
}

module.exports = { ingestESPNScores };
