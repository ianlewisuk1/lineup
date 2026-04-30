// gameStatus.js — Pure utility functions extracted from WeeklyLineupManager
import { supabase } from '../supabase/supabase';
import { weeklyLineupUtils } from './weeklyLineupUtils';

/**
 * Get game information for a specific team in a specific week
 * @param {string} teamName - The team name to look up
 * @param {number} week - The week number
 * @returns {Promise<Object|null>} Game info object or null if no game found
 */
export const getTeamGameInfo = async (teamName, week) => {
  try {
    const { data: teamRow } = await supabase
      .from('teams')
      .select('id, school, team_season_stats(is_on_bye, next_opponent, game_status, game_complete)')
      .eq('school', teamName)
      .single();

    if (!teamRow) return null;

    const stats = teamRow.team_season_stats?.[0] || {};

    if (stats.is_on_bye) return null;

    const nextOpponent = stats.next_opponent || null;
    if (!nextOpponent) return null;

    const gameStatus = stats.game_status || 'scheduled';

    // For live games, read actual scores + period/clock from the games table
    let myScore = 0, oppScore = 0, period = null, clock = null;
    if (gameStatus === 'in_progress') {
      const { data: liveGame } = await supabase
        .from('games')
        .select('home_team, away_team, home_score, away_score, period, clock')
        .or(`home_team.eq.${teamRow.id},away_team.eq.${teamRow.id}`)
        .eq('year', new Date().getFullYear())
        .eq('game_status', 'in_progress')
        .maybeSingle();

      if (liveGame) {
        const isHome = liveGame.home_team === teamRow.id;
        myScore  = isHome ? (liveGame.home_score || 0) : (liveGame.away_score || 0);
        oppScore = isHome ? (liveGame.away_score || 0) : (liveGame.home_score || 0);
        period   = liveGame.period;
        clock    = liveGame.clock;
      }
    }

    return {
      id: null,
      date: null,
      teamId: teamRow.id,
      homeTeam: teamName,
      awayTeam: nextOpponent,
      gameComplete: stats.game_complete || false,
      gameStatus,
      // homeScore/awayScore are from the queried team's perspective (my score vs opponent)
      homeScore: myScore,
      awayScore: oppScore,
      homeSpread: null,
      period,
      clock
    };
  } catch (error) {
    console.error(`Error getting game info for ${teamName}, week ${week}:`, error);
    return null;
  }
};

export const getGameSpreadDisplay = (gameInfo, teamName) => {
  if (!gameInfo || typeof gameInfo.homeSpread !== 'number') return null;

  const isHome = gameInfo.homeTeam === teamName;
  const teamSpread = isHome ? gameInfo.homeSpread : -gameInfo.homeSpread;

  if (teamSpread === 0) return 'PICK';
  return teamSpread > 0 ? `+${teamSpread}` : `${teamSpread}`;
};

export const getGameDisplayInfo = (gameInfo, teamName) => {
  if (!gameInfo) {
    return {
      type: 'bye-week',
      display: 'BYE WEEK',
      chipClass: 'bg-purple-500/20 text-purple-300 border border-purple-400/30',
      subtext: 'No game this week',
      isLive: false,
      hideSpread: true  // New flag to hide spread chip
    };
  }

  const isHome = gameInfo.homeTeam === teamName;
  const myScore = isHome ? gameInfo.homeScore : gameInfo.awayScore;
  const opponentScore = isHome ? gameInfo.awayScore : gameInfo.homeScore;
  const opponent = isHome ? gameInfo.awayTeam : gameInfo.homeTeam;

  if (gameInfo.gameComplete) {
    const won = myScore > opponentScore;
    return {
      type: 'completed',
      display: `${myScore}-${opponentScore} ${won ? 'W' : 'L'}`,
      chipClass: won ? 'bg-green-500/20 text-green-300 border border-green-500/30' : 'bg-red-500/20 text-red-300 border border-red-500/30',
      subtext: `${isHome ? 'vs' : '@'} ${opponent}`,
      isLive: false
    };
  }

  if (gameInfo.gameStatus === 'in_progress' || gameInfo.gameStatus === 'live') {
    const won = myScore > opponentScore;
    const tied = myScore === opponentScore;

    let periodDisplay = '';
    if (gameInfo.period) {
      const quarter = gameInfo.period;
      if (quarter <= 4) {
        periodDisplay = ` Q${quarter}`;
      } else if (quarter === 5) {
        periodDisplay = ' OT';
      } else {
        periodDisplay = ` ${quarter - 4}OT`;
      }
    }

    let clockDisplay = '';
    if (gameInfo.clock && gameInfo.clock !== '0:00' && gameInfo.clock !== '00:00') {
      clockDisplay = ` ${gameInfo.clock}`;
    }

    let resultIndicator = '';
    if (tied) {
      resultIndicator = ' T';
    } else if (won) {
      resultIndicator = ' W';
    } else {
      resultIndicator = ' L';
    }

    return {
      type: 'live',
      display: `${myScore}-${opponentScore}${resultIndicator}${periodDisplay}${clockDisplay}`,
      chipClass: 'bg-green-500/30 text-green-200 border border-green-400/50 animate-pulse',
      subtext: `${isHome ? 'vs' : '@'} ${opponent} LIVE`,
      isLive: true,
      period: gameInfo.period,
      clock: gameInfo.clock
    };
  }

  const gameTime = formatGameTimeChip(gameInfo.date);
  return {
    type: 'upcoming',
    display: gameTime || 'TBD',
    chipClass: 'bg-white/10 text-white/80',
    subtext: `${isHome ? 'vs' : '@'} ${opponent}`,
    isLive: false
  };
};

export const isTeamLocked = async (teamName, week, currentTime = window.TEST_CURRENT_TIME || new Date()) => {
  try {
    const gameInfo = await getTeamGameInfo(teamName, week);

    if (!gameInfo || !gameInfo.date) {
      return {
        locked: false,
        reason: null,
        message: null,
        gameInfo: null
      };
    }

    if (gameInfo.gameComplete) {
      return {
        locked: true,
        reason: 'game_completed',
        message: `${teamName} is locked - game completed`,
        gameInfo
      };
    }

    const gameDate = gameInfo.date instanceof Date ? gameInfo.date : new Date(gameInfo.date);

    if (isNaN(gameDate.getTime())) {
      console.error(`Invalid date for ${teamName}:`, gameInfo.date);
      return {
        locked: false,
        reason: 'invalid_date',
        message: `${teamName} lock status unavailable - invalid date`,
        gameInfo
      };
    }

    const lockTime = new Date(gameDate.getTime() - (60 * 60 * 1000));
    if (currentTime >= lockTime) {
      return {
        locked: true,
        reason: gameDate <= currentTime ? 'game_started' : 'lock_time_reached',
        message: `${teamName} is locked - ${gameDate <= currentTime ? 'game started' : 'lineup locked'}`,
        gameInfo,
        lockTime,
        gameDate
      };
    }

    return {
      locked: false,
      reason: null,
      message: null,
      gameInfo,
      lockTime,
      gameDate
    };
  } catch (error) {
    console.error(`Error checking lock status for ${teamName}:`, error);
    return {
      locked: false,
      reason: 'error',
      message: `${teamName} lock status check failed`,
      gameInfo: null
    };
  }
};

export const getTeamsWithMultipleGames = async (week) => {
  // Schedule data not in Supabase; return empty array
  return [];
};

export const enhanceTeamWithLiveData = (team) => {
  if (!team) return null;

  return {
    ...team,
    currentSeason: {
      ...team.currentSeason,
      liveGame: team.currentSeason?.liveGame || {
        gameStatus: null,
        homeScore: null,
        awayScore: null,
        quarter: null,
        timeRemaining: null,
        lastUpdated: null,
        possession: null
      }
    },
    lockStatus: {
      locked: false,
      reason: null,
      message: null,
      lockTime: null
    }
  };
};

export const checkDualGameTeamsInStarters = async (starters, week) => {
  try {
    if (week !== 1) {
      return { hasDualGameTeams: false, teams: [] };
    }

    const multiGameTeams = await getTeamsWithMultipleGames(week);
    const starterTeamNames = starters
      .filter(team => team !== null)
      .map(team => team.school || team.name);

    const dualGameStarterTeams = multiGameTeams.filter(teamName =>
      starterTeamNames.includes(teamName)
    );

    return {
      hasDualGameTeams: dualGameStarterTeams.length > 0,
      teams: dualGameStarterTeams,
      totalMultiGameTeams: multiGameTeams
    };
  } catch (error) {
    console.error('Error checking dual game teams in starters:', error);
    return { hasDualGameTeams: false, teams: [] };
  }
};

export const getLineupStatus = async (weeklyLineups, week, currentTime = new Date()) => {
  const weekKey = `week${week}`;
  const lineup = weeklyLineups[weekKey];

  if (!lineup) {
    return {
      status: 'open',
      message: 'Lineup not found',
      lockedTeams: [],
      unlockedTeams: [],
      totalTeams: 0
    };
  }

  const allTeams = [...lineup.starters, ...lineup.bench].filter(team => team !== null);

  if (allTeams.length === 0) {
    return {
      status: 'open',
      message: 'No teams selected',
      lockedTeams: [],
      unlockedTeams: [],
      totalTeams: 0
    };
  }

  const teamStatuses = await Promise.all(
    allTeams.map(async (teamName) => {
      const lockInfo = await isTeamLocked(teamName, week, currentTime);
      return {
        teamName,
        locked: lockInfo.locked,
        lockInfo
      };
    })
  );

  const lockedTeams = teamStatuses.filter(t => t.locked).map(t => t.teamName);
  const unlockedTeams = teamStatuses.filter(t => !t.locked).map(t => t.teamName);

  let status, message;

  if (lockedTeams.length === 0) {
    status = 'open';
    message = 'All teams available for changes';
  } else if (lockedTeams.length === allTeams.length) {
    status = 'locked';
    message = 'All teams are locked';
  } else {
    status = 'partially_locked';
    message = `${lockedTeams.length} of ${allTeams.length} teams are locked`;
  }

  return {
    status,
    message,
    lockedTeams,
    unlockedTeams,
    totalTeams: allTeams.length,
    teamStatuses
  };
};

export const canMoveTeam = async (teamName, week, currentTime = new Date()) => {
  const lockInfo = await isTeamLocked(teamName, week, currentTime);

  return {
    canMove: !lockInfo.locked,
    reason: lockInfo.locked ? lockInfo.reason : 'team_available',
    message: lockInfo.message,
    lockInfo
  };
};

/* ---------- Captain Helper Functions ---------- */

export const canBeCaptain = (team, starters, bench) => {
  if (!team) return false;

  const normalizedCaptain = typeof team === 'string' ? team : weeklyLineupUtils.normalizeTeamName(team);

  // Only check starters, not bench
  const starterTeams = starters
    .filter(team => team !== null)
    .map(team => typeof team === 'string' ? team : weeklyLineupUtils.normalizeTeamName(team));

  return starterTeams.includes(normalizedCaptain);
};

export const calculateCaptainPoints = (basePoints, isCaptain = false) => {
  const finalPoints = isCaptain ? basePoints * 2 : basePoints;
  const bonus = isCaptain ? basePoints : 0;

  return {
    basePoints,
    finalPoints,
    bonus,
    isCaptain
  };
};

/* ---------- Trip Play Helper Functions ---------- */

export const canUseTripPlay = (team, starters, bench) => {
  if (!team) return false;

  const normalizedTripPlay = typeof team === 'string' ? team : weeklyLineupUtils.normalizeTeamName(team);

  // Only check starters, not bench (same as captain)
  const starterTeams = starters
    .filter(team => team !== null)
    .map(team => typeof team === 'string' ? team : weeklyLineupUtils.normalizeTeamName(team));

  return starterTeams.includes(normalizedTripPlay);
};

export const calculateTripPlayPoints = (basePoints, isTripPlay = false) => {
  const finalPoints = isTripPlay ? basePoints * 3 : basePoints;
  const bonus = isTripPlay ? basePoints * 2 : 0; // 2x bonus (3x total)

  return {
    basePoints,
    finalPoints,
    bonus,
    isTripPlay
  };
};

export const calculateCombinedPoints = (basePoints, isCaptain = false, isTripPlay = false) => {
  if (isCaptain && isTripPlay) {
    // 5x total (2x from captain, 3x from trip play, but they multiply)
    const finalPoints = basePoints * 5;
    const bonus = basePoints * 4; // 4x bonus (5x total)
    return {
      basePoints,
      finalPoints,
      bonus,
      multiplier: '5x',
      isCaptain,
      isTripPlay
    };
  } else if (isCaptain) {
    return {
      ...calculateCaptainPoints(basePoints, true),
      multiplier: '2x',
      isTripPlay: false
    };
  } else if (isTripPlay) {
    return {
      ...calculateTripPlayPoints(basePoints, true),
      multiplier: '3x',
      isCaptain: false
    };
  } else {
    return {
      basePoints,
      finalPoints: basePoints,
      bonus: 0,
      multiplier: '1x',
      isCaptain: false,
      isTripPlay: false
    };
  }
};

/* ---------- Shared helpers ---------- */
export const toJSDate = (v) => {
  if (!v) return null;
  if (typeof v?.toDate === 'function') return v.toDate();
  if (typeof v === 'number') return new Date(v);
  const d = new Date(v);
  return isNaN(d) ? null : d;
};

export const formatGameTimeChip = (value) => {
  const date = toJSDate(value);
  if (!date) return null;
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const isTomorrow = date.toDateString() === new Date(now.getTime() + 86400000).toDateString();
  if (isToday)    return `Today ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
  if (isTomorrow) return `Tomorrow ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

export const isWeekEditable = (week, currentWeek) => {
  return week === currentWeek;
};
