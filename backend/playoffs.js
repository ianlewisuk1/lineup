/**
 * playoffs.js
 *
 * Playoff bracket initialization and advancement logic.
 *
 * Bracket structure (12-team league):
 *
 * Championship bracket (Seeds 1-6):
 *   Week 12: QF1 (3v6), QF2 (4v5); Seeds 1 & 2 get byes
 *   Week 13: SF1 (1 vs QF1 winner), SF2 (2 vs QF2 winner); consolation QF
 *   Week 14: Championship, 3rd Place, 5th Place
 *
 * Loser bracket (Seeds 7-12):
 *   Weeks 12-13: Mini-league (cumulative points)
 *   Week 14: 1st Pick Game, 7th/8th Place, Toilet Bowl
 *
 * v2 schema notes:
 *   - Weekly points come from weekly_standings (member_id, week, points)
 *   - Bracket data still references user_id (via league_members) for bracket identity
 */

const { supabase } = require('./db');

// ---------------------------------------------------------------------------
// Resolve weekly points for all members in a league for a given week.
// Returns a map of user_id → points for that week.
// ---------------------------------------------------------------------------
async function getWeeklyPointsByUserId(leagueId, week) {
  // Normalise week to int
  const weekNum = parseInt(String(week).replace(/\D/g, ''), 10);

  // Get member_id → user_id mapping for this league
  const { data: members } = await supabase
    .from('league_members')
    .select('id, user_id')
    .eq('league_id', leagueId);

  const memberIdToUserId = {};
  for (const m of members || []) {
    memberIdToUserId[m.id] = m.user_id;
  }

  // Get weekly standings for this week
  const { data: standings } = await supabase
    .from('weekly_standings')
    .select('member_id, points')
    .eq('league_id', leagueId)
    .eq('week', weekNum);

  const weekPoints = {};
  for (const row of standings || []) {
    const userId = memberIdToUserId[row.member_id];
    if (userId) weekPoints[userId] = row.points;
  }

  return weekPoints;
}

// ---------------------------------------------------------------------------
// Initialize brackets for a league at the start of playoffs
// ---------------------------------------------------------------------------
async function initializePlayoffs(leagueId, year) {
  const { data: members, error } = await supabase
    .from('league_members')
    .select('user_id, team_name, points')
    .eq('league_id', leagueId)
    .order('points', { ascending: false });

  if (error) throw error;
  if (!members?.length) throw new Error('No members found for league ' + leagueId);

  const seeds = members.map((m, i) => ({ ...m, seed: i + 1 }));

  const [s1, s2, s3, s4, s5, s6] = seeds;

  const championshipBracket = {
    week12: {
      QF1: { home: s3, away: s6, homePoints: null, awayPoints: null, winner: null },
      QF2: { home: s4, away: s5, homePoints: null, awayPoints: null, winner: null },
      bye1: s1,
      bye2: s2,
    },
    week13: {
      SF1: { home: s1, away: null, homePoints: null, awayPoints: null, winner: null },
      SF2: { home: s2, away: null, homePoints: null, awayPoints: null, winner: null },
      consolationQF: { home: null, away: null, homePoints: null, awayPoints: null, winner: null },
    },
    week14: {
      championship: { home: null, away: null, homePoints: null, awayPoints: null, winner: null },
      thirdPlace:   { home: null, away: null, homePoints: null, awayPoints: null, winner: null },
      fifthPlace:   { home: null, away: null, homePoints: null, awayPoints: null, winner: null },
    },
  };

  const loserSeeds = seeds.slice(6);
  const loserBracket = {
    miniLeague: {
      participants:  loserSeeds,
      week12Points:  {},
      week13Points:  {},
      totalPoints:   {},
      finalRankings: [],
    },
    week14: {
      firstPickGame: { home: null, away: null, homePoints: null, awayPoints: null, winner: null },
      seventhPlace:  { home: null, away: null, homePoints: null, awayPoints: null, winner: null },
      toiletBowl:    { home: null, away: null, homePoints: null, awayPoints: null, winner: null },
    },
    toiletBowlParticipant: seeds[seeds.length - 1],
  };

  const { error: upsertErr } = await supabase
    .from('playoffs')
    .upsert(
      {
        league_id:             leagueId,
        year,
        championship_bracket:  championshipBracket,
        loser_bracket:         loserBracket,
        final_draft_order:     [],
        playoffs_complete:     false,
      },
      { onConflict: 'league_id' }
    );

  if (upsertErr) throw upsertErr;

  console.log(`[Playoffs] Initialized for league ${leagueId}`);
  return { championshipBracket, loserBracket };
}

// ---------------------------------------------------------------------------
// Advance the bracket after each playoff week
// ---------------------------------------------------------------------------
async function advancePlayoffWeek(leagueId, fromWeek) {
  const { data: playoff } = await supabase
    .from('playoffs')
    .select('*')
    .eq('league_id', leagueId)
    .single();

  if (!playoff) throw new Error('No playoff record for league ' + leagueId);

  // Resolve weekly points from weekly_standings
  const weekPoints = await getWeeklyPointsByUserId(leagueId, fromWeek);

  const cb = playoff.championship_bracket;
  const lb = playoff.loser_bracket;

  if (fromWeek === 'Week 12' || fromWeek === 12) {
    cb.week12.QF1.homePoints = weekPoints[cb.week12.QF1.home?.user_id] ?? 0;
    cb.week12.QF1.awayPoints = weekPoints[cb.week12.QF1.away?.user_id] ?? 0;
    cb.week12.QF1.winner =
      cb.week12.QF1.homePoints >= cb.week12.QF1.awayPoints
        ? cb.week12.QF1.home
        : cb.week12.QF1.away;

    cb.week12.QF2.homePoints = weekPoints[cb.week12.QF2.home?.user_id] ?? 0;
    cb.week12.QF2.awayPoints = weekPoints[cb.week12.QF2.away?.user_id] ?? 0;
    cb.week12.QF2.winner =
      cb.week12.QF2.homePoints >= cb.week12.QF2.awayPoints
        ? cb.week12.QF2.home
        : cb.week12.QF2.away;

    cb.week13.SF1.away = cb.week12.QF1.winner;
    cb.week13.SF2.away = cb.week12.QF2.winner;

    const QF1Loser =
      cb.week12.QF1.winner?.user_id === cb.week12.QF1.home?.user_id
        ? cb.week12.QF1.away
        : cb.week12.QF1.home;
    const QF2Loser =
      cb.week12.QF2.winner?.user_id === cb.week12.QF2.home?.user_id
        ? cb.week12.QF2.away
        : cb.week12.QF2.home;
    cb.week13.consolationQF.home = QF1Loser;
    cb.week13.consolationQF.away = QF2Loser;

    for (const p of lb.miniLeague.participants) {
      lb.miniLeague.week12Points[p.user_id] = weekPoints[p.user_id] ?? 0;
    }
  } else if (fromWeek === 'Week 13' || fromWeek === 13) {
    cb.week13.SF1.homePoints = weekPoints[cb.week13.SF1.home?.user_id] ?? 0;
    cb.week13.SF1.awayPoints = weekPoints[cb.week13.SF1.away?.user_id] ?? 0;
    cb.week13.SF1.winner =
      cb.week13.SF1.homePoints >= cb.week13.SF1.awayPoints
        ? cb.week13.SF1.home
        : cb.week13.SF1.away;

    cb.week13.SF2.homePoints = weekPoints[cb.week13.SF2.home?.user_id] ?? 0;
    cb.week13.SF2.awayPoints = weekPoints[cb.week13.SF2.away?.user_id] ?? 0;
    cb.week13.SF2.winner =
      cb.week13.SF2.homePoints >= cb.week13.SF2.awayPoints
        ? cb.week13.SF2.home
        : cb.week13.SF2.away;

    cb.week13.consolationQF.homePoints = weekPoints[cb.week13.consolationQF.home?.user_id] ?? 0;
    cb.week13.consolationQF.awayPoints = weekPoints[cb.week13.consolationQF.away?.user_id] ?? 0;
    cb.week13.consolationQF.winner =
      cb.week13.consolationQF.homePoints >= cb.week13.consolationQF.awayPoints
        ? cb.week13.consolationQF.home
        : cb.week13.consolationQF.away;

    cb.week14.championship.home = cb.week13.SF1.winner;
    cb.week14.championship.away = cb.week13.SF2.winner;

    const SF1Loser =
      cb.week13.SF1.winner?.user_id === cb.week13.SF1.home?.user_id
        ? cb.week13.SF1.away
        : cb.week13.SF1.home;
    const SF2Loser =
      cb.week13.SF2.winner?.user_id === cb.week13.SF2.home?.user_id
        ? cb.week13.SF2.away
        : cb.week13.SF2.home;

    const SF1LosrPts = weekPoints[SF1Loser?.user_id] ?? 0;
    const SF2LosrPts = weekPoints[SF2Loser?.user_id] ?? 0;
    cb.week14.thirdPlace.home = cb.week13.consolationQF.winner;
    cb.week14.thirdPlace.away = SF1LosrPts >= SF2LosrPts ? SF1Loser : SF2Loser;

    const consolationLoser =
      cb.week13.consolationQF.winner?.user_id === cb.week13.consolationQF.home?.user_id
        ? cb.week13.consolationQF.away
        : cb.week13.consolationQF.home;
    cb.week14.fifthPlace.home = consolationLoser;
    cb.week14.fifthPlace.away = SF1LosrPts < SF2LosrPts ? SF1Loser : SF2Loser;

    for (const p of lb.miniLeague.participants) {
      lb.miniLeague.week13Points[p.user_id] = weekPoints[p.user_id] ?? 0;
      lb.miniLeague.totalPoints[p.user_id] =
        (lb.miniLeague.week12Points[p.user_id] ?? 0) +
        (lb.miniLeague.week13Points[p.user_id] ?? 0);
    }

    lb.miniLeague.finalRankings = [...lb.miniLeague.participants].sort(
      (a, b) => (lb.miniLeague.totalPoints[b.user_id] ?? 0) - (lb.miniLeague.totalPoints[a.user_id] ?? 0)
    );

    const [ml1, ml2, ml3, ml4, ml5] = lb.miniLeague.finalRankings;
    lb.week14.firstPickGame.home = ml1;
    lb.week14.firstPickGame.away = ml2;
    lb.week14.seventhPlace.home  = ml3;
    lb.week14.seventhPlace.away  = ml4;
    lb.week14.toiletBowl.home    = ml5;
    lb.week14.toiletBowl.away    = lb.toiletBowlParticipant;
  } else if (fromWeek === 'Week 14' || fromWeek === 14) {
    for (const matchup of ['championship', 'thirdPlace', 'fifthPlace']) {
      const m = cb.week14[matchup];
      m.homePoints = weekPoints[m.home?.user_id] ?? 0;
      m.awayPoints = weekPoints[m.away?.user_id] ?? 0;
      m.winner = m.homePoints >= m.awayPoints ? m.home : m.away;
    }

    for (const matchup of ['firstPickGame', 'seventhPlace', 'toiletBowl']) {
      const m = lb.week14[matchup];
      m.homePoints = weekPoints[m.home?.user_id] ?? 0;
      m.awayPoints = weekPoints[m.away?.user_id] ?? 0;
      m.winner = m.homePoints >= m.awayPoints ? m.home : m.away;
    }

    const draftOrder = [
      getWinner(lb.week14.firstPickGame),
      getWinner(cb.week14.fifthPlace, 'loser'),
      getWinner(cb.week14.thirdPlace, 'loser'),
      getWinner(cb.week14.fifthPlace),
      getWinner(cb.week14.thirdPlace),
      getWinner(lb.week14.firstPickGame, 'loser'),
      getWinner(lb.week14.seventhPlace),
      getWinner(lb.week14.seventhPlace, 'loser'),
      getWinner(lb.week14.toiletBowl),
      getWinner(lb.week14.toiletBowl, 'loser'),
      getWinner(cb.week14.championship, 'loser'),
      getWinner(cb.week14.championship),
    ].filter(Boolean).map((m) => m.user_id);

    await supabase
      .from('playoffs')
      .update({
        championship_bracket: cb,
        loser_bracket:        lb,
        final_draft_order:    draftOrder,
        playoffs_complete:    true,
      })
      .eq('league_id', leagueId);

    console.log(`[Playoffs] League ${leagueId} playoffs complete`);
    return;
  }

  await supabase
    .from('playoffs')
    .update({ championship_bracket: cb, loser_bracket: lb })
    .eq('league_id', leagueId);

  console.log(`[Playoffs] Advanced ${leagueId} from ${fromWeek}`);
}

function getWinner(matchup, side = 'winner') {
  if (!matchup) return null;
  if (side === 'winner') return matchup.winner;
  if (!matchup.winner) return null;
  return matchup.winner.user_id === matchup.home?.user_id ? matchup.away : matchup.home;
}

module.exports = { initializePlayoffs, advancePlayoffWeek };
