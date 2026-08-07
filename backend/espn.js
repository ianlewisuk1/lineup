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
// ESPN event id → our game row
//
// Two earlier versions of this matched on the team instead of the game:
// first by slugging ESPN's team.location (which stripped "&", so Texas A&M
// never matched and the Aggies scored zero all season), then by teams.espn_id.
//
// Both were wrong in the same deeper way. Keying by team means any team in
// ESPN's current slate matches our row for that team in whatever week we happen
// to be querying. Run it in August with the config week set to 3 and it writes
// week 1 scores onto week 3 rows — observed, 78 rows corrupted.
//
// ESPN's event id is the same integer CFBD publishes as its game id, so
// games.cfbd_game_id already holds it (verified: 99 of 99 events on the current
// scoreboard match a row). Keying on it identifies one specific game, which is
// what we actually need — no team lookup, no week arithmetic, no ambiguity.
// ---------------------------------------------------------------------------
function buildEventIndex(events) {
  const index = new Map();
  for (const event of events) {
    const competition = event.competitions?.[0];
    if (!competition || !event.id) continue;
    index.set(String(event.id), competition);
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
  const unmatched   = [];
  let updatedGames  = 0;

  for (const game of games) {
    if (game.game_complete) continue;

    // Match this exact game, not merely a team that happens to be playing.
    const competition = game.cfbd_game_id ? eventIndex.get(game.cfbd_game_id) : null;
    if (!competition) {
      unmatched.push(`${game.away_team}@${game.home_team}`);
      continue;
    }
    const status    = competition.status?.type?.name || '';
    const completed = status === 'STATUS_FINAL';
    const inProgress = status === 'STATUS_IN_PROGRESS' || status === 'STATUS_HALFTIME';

    // ESPN reports a score of "0" for games that have not kicked off, so a
    // scoreboard entry alone is not evidence of a score. Writing it turns a
    // null into a 0-0 that reads as a real result — observed on 75 rows.
    // Only games that have actually started have scores worth storing.
    if (!completed && !inProgress) continue;

    let homeScore = null;
    let awayScore = null;
    for (const comp of competition.competitors || []) {
      const score = parseInt(comp.score, 10);
      if (comp.homeAway === 'home') homeScore = score;
      else awayScore = score;
    }

    const gameStatus = completed ? 'final' : inProgress ? 'in_progress' : 'scheduled';
    const period = competition.status?.period || null;
    const clock  = competition.status?.clock  || null;

    const { error: updateErr } = await supabase
      .from('games')
      .update({
        home_score:         homeScore,
        away_score:         awayScore,
        game_status:        gameStatus,
        game_complete:      completed,
        period:             inProgress ? period : (completed ? period : null),
        clock:              inProgress ? clock  : null,
        last_score_update:  new Date().toISOString(),
      })
      .eq('id', game.id);

    if (updateErr) {
      console.error(`[ESPN] Failed to update game ${game.id}:`, updateErr.message);
      continue;
    }

    updatedGames++;

    // Keep team_season_stats.game_status in sync so the frontend can detect live games
    if (inProgress) {
      for (const teamId of [game.home_team, game.away_team]) {
        await supabase.from('team_season_stats')
          .update({ game_status: 'in_progress', game_complete: false })
          .eq('team_id', teamId)
          .eq('season_year', year);
      }
    }

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

  // A scheduled game with no ESPN event is normal early in the week — the
  // scoreboard only carries the current slate. A game that stays unmatched
  // through kickoff means an espn_id is missing or wrong, which otherwise
  // looks exactly like a bye week.
  if (unmatched.length) {
    const sample = unmatched.slice(0, 10).join(', ');
    const more = unmatched.length > 10 ? `, +${unmatched.length - 10} more` : '';
    console.log(`[ESPN] ${unmatched.length} games had no scoreboard event: ${sample}${more}`);
  }

  if (teamUpdates.length > 0) {
    await recalculateAllMemberPoints(currentWeek);
  }
}

module.exports = { ingestESPNScores };
