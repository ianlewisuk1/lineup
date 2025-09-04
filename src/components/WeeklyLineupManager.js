// WeeklyLineupManager.js — Enhanced with Captain Selection Feature
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { doc, getDoc, updateDoc, collection, getDocs, addDoc, increment } from 'firebase/firestore';
import { db } from '../firebase/firebase';
import { weeklyLineupUtils } from '../utils/weeklyLineupUtils';
import { ChevronLeft, ChevronRight, Lock, Clock, CheckCircle, ChevronDown, ChevronUp, Crown } from 'lucide-react';

/**
 * Get game information for a specific team in a specific week
 * @param {string} teamName - The team name to look up
 * @param {number} week - The week number
 * @returns {Promise<Object|null>} Game info object or null if no game found
 */
const getTeamGameInfo = async (teamName, week) => {
  try {
    const gamesSnap = await getDocs(
      collection(db, "schedule", "2025", "weeks", week.toString(), "games")
    );

    const teamGames = [];
    gamesSnap.forEach(gameDoc => {
      const gameData = gameDoc.data();
      if (gameData.homeTeam === teamName || gameData.awayTeam === teamName) {
        teamGames.push({
          id: gameDoc.id,
          date: toJSDate(gameData.date),
          homeTeam: gameData.homeTeam,
          awayTeam: gameData.awayTeam,
          gameComplete: gameData.gameComplete || false,
          venue: gameData.venue || null,
          homeScore: gameData.homeScore || 0,
          awayScore: gameData.awayScore || 0,
          gameStatus: gameData.gameStatus || 'scheduled',
          period: gameData.period,
          clock: gameData.clock,
          ...gameData
        });
      }
    });

    if (teamGames.length === 0) return null;

    teamGames.sort((a, b) => a.date - b.date);
    return teamGames[0];
  } catch (error) {
    console.error(`Error getting game info for ${teamName}, week ${week}:`, error);
    return null;
  }
};

const getGameSpreadDisplay = (gameInfo, teamName) => {
  if (!gameInfo || typeof gameInfo.homeSpread !== 'number') return null;
  
  const isHome = gameInfo.homeTeam === teamName;
  const teamSpread = isHome ? gameInfo.homeSpread : -gameInfo.homeSpread;
  
  if (teamSpread === 0) return 'PICK';
  return teamSpread > 0 ? `+${teamSpread}` : `${teamSpread}`;
};

const getGameDisplayInfo = (gameInfo, teamName) => {
  if (!gameInfo) {
    return { 
      type: 'no-game', 
      display: 'No game scheduled',
      chipClass: 'bg-gray-500/20 text-gray-400',
      isLive: false
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

const isTeamLocked = async (teamName, week, currentTime = window.TEST_CURRENT_TIME || new Date()) => {
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

const getTeamsWithMultipleGames = async (week) => {
  try {
    const gamesSnap = await getDocs(
      collection(db, "schedule", "2025", "weeks", week.toString(), "games")
    );

    const teamGameCounts = {};
    gamesSnap.forEach(gameDoc => {
      const gameData = gameDoc.data();
      if (gameData.homeTeam) {
        teamGameCounts[gameData.homeTeam] = (teamGameCounts[gameData.homeTeam] || 0) + 1;
      }
      if (gameData.awayTeam) {
        teamGameCounts[gameData.awayTeam] = (teamGameCounts[gameData.awayTeam] || 0) + 1;
      }
    });

    return Object.entries(teamGameCounts)
      .filter(([teamName, count]) => count > 1)
      .map(([teamName]) => teamName);
  } catch (error) {
    console.error(`Error getting teams with multiple games for week ${week}:`, error);
    return [];
  }
};

const enhanceTeamWithLiveData = (team) => {
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

const checkDualGameTeamsInStarters = async (starters, week) => {
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

const getLineupStatus = async (weeklyLineups, week, currentTime = new Date()) => {
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

const canMoveTeam = async (teamName, week, currentTime = new Date()) => {
  const lockInfo = await isTeamLocked(teamName, week, currentTime);
  
  return {
    canMove: !lockInfo.locked,
    reason: lockInfo.locked ? lockInfo.reason : 'team_available',
    message: lockInfo.message,
    lockInfo
  };
};

/* ---------- Captain Helper Functions ---------- */

const canBeCaptain = (team, starters, bench) => {
  if (!team) return false;
  
  const normalizedCaptain = typeof team === 'string' ? team : weeklyLineupUtils.normalizeTeamName(team);
  console.log("Checking captain candidate:", team, "normalized:", normalizedCaptain);
  
  // Only check starters, not bench
  const starterTeams = starters
    .filter(team => team !== null)
    .map(team => typeof team === 'string' ? team : weeklyLineupUtils.normalizeTeamName(team));
  
  console.log("Starter team names in lineup:", starterTeams);
  console.log("Does starters include captain?", starterTeams.includes(normalizedCaptain));
  
  return starterTeams.includes(normalizedCaptain);
};

const calculateCaptainPoints = (basePoints, isCaptain = false) => {
  const finalPoints = isCaptain ? basePoints * 2 : basePoints;
  const bonus = isCaptain ? basePoints : 0;
  
  return {
    basePoints,
    finalPoints,
    bonus,
    isCaptain
  };
};

/* ---------- Shared helpers ---------- */
const toJSDate = (v) => {
  if (!v) return null;
  if (typeof v?.toDate === 'function') return v.toDate();
  if (typeof v === 'number') return new Date(v);
  const d = new Date(v);
  return isNaN(d) ? null : d;
};

const formatGameTimeChip = (value) => {
  const date = toJSDate(value);
  if (!date) return null;
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const isTomorrow = date.toDateString() === new Date(now.getTime() + 86400000).toDateString();
  if (isToday)    return `Today ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
  if (isTomorrow) return `Tomorrow ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

function useLockBodyScroll(locked) {
  useEffect(() => {
    const { style } = document.body;
    const prevOverflow = style.overflow;
    const prevTouch = style.touchAction;

    if (locked) {
      style.overflow = 'hidden';
      style.touchAction = 'none';
    } else {
      style.overflow = '';
      style.touchAction = '';
    }

    return () => {
      style.overflow = prevOverflow;
      style.touchAction = prevTouch;
    };
  }, [locked]);
}

const ModalPortal = ({ open, children }) => (open ? createPortal(children, document.body) : null);

/* ---------- WeeklyLineupManager ---------- */
const WeeklyLineupManager = ({ 
  leagueId,
  userId,
  allTeams,
  currentWeek,
  onTeamClick,
  TeamLogo,
  userDisplayName
}) => {
  const [selectedWeek, setSelectedWeek] = useState(currentWeek);
  const [weeklyLineups, setWeeklyLineups] = useState({});
  const [weekStatuses, setWeekStatuses] = useState({});
  const [loading, setLoading] = useState(true);
  const [availableWeeks, setAvailableWeeks] = useState([]);

  const fixTexasAMNormalization = async () => {
    try {
      console.log("Starting Texas A&M normalization fix...");
      
      const memberRef = doc(db, "leagues", leagueId, "members", userId);
      const memberSnap = await getDoc(memberRef);
      
      if (memberSnap.exists()) {
        const memberData = memberSnap.data();
        const currentLineup = memberData.lineup;
        
        if (currentLineup) {
          let needsUpdate = false;
          
          const fixedStarters = currentLineup.starters.map(teamName => {
            if (teamName === "texas-am") {
              needsUpdate = true;
              return "texas-a-m";
            }
            return teamName;
          });
          
          const fixedBench = currentLineup.bench.map(teamName => {
            if (teamName === "texas-am") {
              needsUpdate = true;
              return "texas-a-m";
            }
            return teamName;
          });
          
          if (needsUpdate) {
            await updateDoc(memberRef, {
              lineup: {
                starters: fixedStarters,
                bench: fixedBench
              }
            });
            console.log("✅ Fixed member's current lineup");
          }
        }
      }
      
      const weeklyLineupsRef = doc(db, "leagues", leagueId, "weeklyLineups", userId);
      const weeklyLineupsSnap = await getDoc(weeklyLineupsRef);
      
      if (weeklyLineupsSnap.exists()) {
        const weeklyData = weeklyLineupsSnap.data();
        let needsWeeklyUpdate = false;
        const updatedWeeklyData = {};
        
        Object.keys(weeklyData).forEach(weekKey => {
          const weekLineup = weeklyData[weekKey];
          
          const fixedStarters = weekLineup.starters?.map(teamName => {
            if (teamName === "texas-am") {
              needsWeeklyUpdate = true;
              return "texas-a-m";
            }
            return teamName;
          }) || [];
          
          const fixedBench = weekLineup.bench?.map(teamName => {
            if (teamName === "texas-am") {
              needsWeeklyUpdate = true;
              return "texas-a-m";
            }
            return teamName;
          }) || [];
          
          updatedWeeklyData[weekKey] = {
            ...weekLineup,
            starters: fixedStarters,
            bench: fixedBench
          };
        });
        
        if (needsWeeklyUpdate) {
          await updateDoc(weeklyLineupsRef, updatedWeeklyData);
          console.log("✅ Fixed weekly lineups data");
        }
      }
      
      console.log("🎉 Texas A&M normalization fix completed!");
      
      await initializeWeeklyLineups();
      
    } catch (error) {
      console.error("❌ Error fixing Texas A&M normalization:", error);
    }
  };

  useEffect(() => {
    console.log("🔍 Debug: allTeams prop:", allTeams ? Object.keys(allTeams).length : "undefined/null");
    
    if (allTeams && Object.keys(allTeams).length > 0) {
      const texasAM = Object.values(allTeams).find(team => 
        team.school && team.school.toLowerCase().includes('texas') && team.school.toLowerCase().includes('a')
      );
      
      if (texasAM) {
        console.log("🔍 Found Texas A&M in allTeams:", texasAM.school);
        console.log("🔍 Normalized:", weeklyLineupUtils.normalizeTeamName(texasAM));
      } else {
        console.log("❌ Texas A&M not found in allTeams");
        console.log("🔍 First 10 team names:", Object.values(allTeams).slice(0, 10).map(t => t.school));
        
        const texasTeams = Object.values(allTeams).filter(team => 
          team.school && team.school.toLowerCase().includes('texas')
        );
        console.log("🔍 All Texas teams:", texasTeams.map(t => t.school));
      }
    } else {
      console.log("❌ allTeams is empty or undefined");
    }
  }, [allTeams]);

  useEffect(() => {
    initializeWeeklyLineups();
  }, [leagueId, userId]);

  useEffect(() => {
    if (leagueId && userId) {
      fixTexasAMNormalization();
    }
  }, []);

  const initializeWeeklyLineups = async () => {
    try {
      const weeks = Array.from({ length: 14 }, (_, i) => i + 1);
      setAvailableWeeks(weeks);

      const lineupData = {};
      const weeklyLineupsRef = doc(db, "leagues", leagueId, "weeklyLineups", userId);
      const weeklyLineupsSnap = await getDoc(weeklyLineupsRef);
      const existingWeeklyData = weeklyLineupsSnap.exists() ? weeklyLineupsSnap.data() : {};

      const memberRef = doc(db, "leagues", leagueId, "members", userId);
      const memberSnap = await getDoc(memberRef);
      const memberData = memberSnap.data();
      const currentLineup = memberData?.lineup;

      weeks.forEach(week => {
        const weekKey = `week${week}`;
        
        const createEnhancedLineup = (existingLineup = null) => {
          const baseLineup = existingLineup || {
            starters: Array(5).fill(null),
            bench: Array(2).fill(null),
            captain: null,
            lockedAt: null
          };
          
          return {
            starters: baseLineup.starters || Array(5).fill(null),
            bench: baseLineup.bench || Array(2).fill(null),
            captain: baseLineup.captain || null,
            lockedTeams: baseLineup.lockedTeams || [],
            teamLockTimes: baseLineup.teamLockTimes || {},
            lockedAt: baseLineup.lockedAt || null
          };
        };
        
        if (week === currentWeek && currentLineup) {
          lineupData[weekKey] = createEnhancedLineup({
            starters: currentLineup.starters || Array(5).fill(null),
            bench: currentLineup.bench || Array(2).fill(null),
            captain: currentLineup.captain || null,  // ← Read from member doc instead
            lockedAt: null
          });
        } else if (existingWeeklyData[weekKey]) {
          lineupData[weekKey] = createEnhancedLineup(existingWeeklyData[weekKey]);
        } else {
          lineupData[weekKey] = createEnhancedLineup();
        }
      });

      setWeeklyLineups(lineupData);
      await calculateWeekStatuses(weeks);
      setLoading(false);
    } catch (error) {
      console.error("Error initializing weekly lineups:", error);
      setLoading(false);
    }
  };

  const calculateWeekStatuses = async (weeks) => {
    const statuses = {};
    const now = new Date();
    for (const week of weeks) {
      try {
        const gamesSnap = await getDocs(
          collection(db, "schedule", "2025", "weeks", week.toString(), "games")
        );

        let firstGameTime = null;
        let lastGameTime = null;
        let allGamesComplete = true;
        let hasLiveGames = false;

        gamesSnap.forEach(gameDoc => {
          const gameData = gameDoc.data();
          if (gameData.date) {
            const gameTime = toJSDate(gameData.date);
            if (gameTime) {
              if (!firstGameTime || gameTime < firstGameTime) firstGameTime = gameTime;
              if (!lastGameTime || gameTime > lastGameTime) lastGameTime = gameTime;
            }
          }
          if (!gameData.gameComplete) allGamesComplete = false;
          
          if (gameData.gameStatus === 'in_progress' || gameData.gameStatus === 'live') {
            hasLiveGames = true;
          }
        });

        let status = 'locked';
        let lockTime = null;
        let unlockTime = null;

        if (firstGameTime) {
          lockTime = new Date(firstGameTime.getTime() - (60 * 60 * 1000));
          if (lastGameTime) unlockTime = new Date(lastGameTime.getTime() + (60 * 60 * 1000));

          if (week === currentWeek && now < lockTime) status = 'editable';
          else if (week === currentWeek && hasLiveGames) status = 'live';
          else if (week === currentWeek && now >= lockTime && !allGamesComplete) status = 'locked_playing';
          else if (allGamesComplete && week < currentWeek) status = 'completed';
          else if (week > currentWeek) status = 'future';
        }

        statuses[week] = { status, lockTime, unlockTime, firstGameTime, lastGameTime, allGamesComplete, hasLiveGames };
      } catch (error) {
        console.error(`Error calculating status for week ${week}:`, error);
        statuses[week] = { status: 'locked' };
      }
    }
    setWeekStatuses(statuses);
  };

  const saveLineup = async (week, starters, bench, captain = null) => {
    try {
      console.log("saveLineup called with captain:", captain);
      
      const normalizedStarters = starters.map(team => team ? weeklyLineupUtils.normalizeTeamName(team) : null);
      const normalizedBench = bench.map(team => team ? weeklyLineupUtils.normalizeTeamName(team) : null);
      const normalizedCaptain = captain;      
      console.log("normalized captain:", normalizedCaptain);

      if (week === currentWeek) {
        const memberRef = doc(db, "leagues", leagueId, "members", userId);
        await updateDoc(memberRef, { 
          lineup: { 
            starters: normalizedStarters, 
            bench: normalizedBench,
            captain: normalizedCaptain 
          } 
        });
      } else {
        console.warn(`Attempted to save non-current week ${week}. Current week is ${currentWeek}`);
      }

      const weekKey = `week${week}`;
      
      const updatedLineup = {
        starters: normalizedStarters,
        bench: normalizedBench,
        captain: normalizedCaptain,
        lockedTeams: weeklyLineups[weekKey]?.lockedTeams || [],
        teamLockTimes: weeklyLineups[weekKey]?.teamLockTimes || {},
        lockedAt: null
      };

      // Keep this to update your frontend state
      setWeeklyLineups(prev => ({ 
        ...prev, 
        [weekKey]: updatedLineup
      }));
    } catch (error) {
      console.error("Error saving lineup:", error);
      throw error;
    }
  };

  const getWeekStatusIcon = (week) => {
    const status = weekStatuses[week]?.status;
    switch (status) {
      case 'editable':       return <Clock className="text-green-400" size={16} />;
      case 'live':           return <div className="w-4 h-4 bg-red-500 rounded-full animate-pulse" />;
      case 'locked_playing': return <Lock className="text-yellow-400" size={16} />;
      case 'completed':      return <CheckCircle className="text-blue-400" size={16} />;
      case 'future':         return <Lock className="text-gray-400" size={16} />;
      default:               return <Lock className="text-gray-400" size={16} />;
    }
  };

  const getStatusMessage = (week) => {
    const status = weekStatuses[week];
    if (!status) return "Loading...";
    
    switch (status.status) {
      case 'editable':       
        return `Teams lock 1 hour before their games start`;
      case 'live':           
        return "Games are live! Check your scores";
      case 'locked_playing': 
        return "Games in progress - individual teams may be locked";
      case 'completed':      
        return "Week completed";
      case 'future':         
        return "Future week";
      default:               
        return "Individual teams lock based on game times";
    }
  };

  const formatDateTime = (date) =>
    new Date(date).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });

  if (loading) {
    return (
      <div className="bg-white/10 rounded-2xl p-6 border border-white/20">
        <div className="text-center">
          <div className="text-2xl mb-2 animate-spin">🏈</div>
          <p className="text-white/80">Loading weekly lineups...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white/10 rounded-2xl border border-white/20 overflow-hidden">
      {/* Week Selector Header */}
      <div className="bg-white/5 p-4 border-b border-white/20">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setSelectedWeek(Math.max(1, selectedWeek - 1))}
            disabled={selectedWeek <= 1}
            className="p-2 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
          >
            <ChevronLeft size={20} />
          </button>
          
          <div className="text-center">
            <div className="flex items-center gap-2 justify-center mb-1">
              {getWeekStatusIcon(selectedWeek)}
              <h3 className="text-xl font-bold text-white">Week {selectedWeek}</h3>
              {selectedWeek === currentWeek && (
                <span className="bg-blue-500 text-white text-xs px-2 py-1 rounded-full font-medium">
                  Current
                </span>
              )}
            </div>
            <p className="text-sm text-white/60">{getStatusMessage(selectedWeek)}</p>
          </div>
          
          <button
            onClick={() => setSelectedWeek(Math.min(14, selectedWeek + 1))}
            disabled={selectedWeek >= 14}
            className="p-2 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
          >
            <ChevronRight size={20} />
          </button>
        </div>
        
        {/* Week Pills */}
        <div className="flex gap-1 mt-4 overflow-x-auto pb-2">
          {availableWeeks.map(week => (
            <button
              key={week}
              onClick={() => setSelectedWeek(week)}
              className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-all duration-200 ${
                week === selectedWeek
                  ? 'bg-blue-500 text-white'
                  : 'bg-white/10 text-white/80 hover:bg-white/20'
              }`}
            >
              {week}
            </button>
          ))}
        </div>
      </div>
      
      {/* Lineup Content */}
      <div className="p-5">
        <WeeklyLineupContent
          week={selectedWeek}
          lineup={weeklyLineups[`week${selectedWeek}`]}
          allTeams={allTeams}
          isEditable={true}
          onSave={(starters, bench, captain) => saveLineup(selectedWeek, starters, bench, captain)}
          onTeamClick={onTeamClick}
          TeamLogo={TeamLogo}
          leagueId={leagueId}
          userId={userId}
          userDisplayName={userDisplayName}
          currentWeek={currentWeek}
        />
      </div>
    </div>
  );
};

/* ---------- WeeklyLineupContent: lineup editor + modals ---------- */
const WeeklyLineupContent = ({ 
  week,
  lineup,
  allTeams,
  isEditable,
  onSave,
  onTeamClick,
  TeamLogo,
  leagueId,
  userId,
  userDisplayName,
  currentWeek
}) => {
  const [starters, setStarters] = useState(Array(5).fill(null));
  const [bench, setBench] = useState(Array(2).fill(null));
  const [captain, setCaptain] = useState(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [showConfirmCut, setShowConfirmCut] = useState(null);
  const [showReplaceModal, setShowReplaceModal] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (lineup) {
      const resolvedStarters = (lineup.starters || []).map(n => n ? findTeamByNormalizedName(n) : null);
      const resolvedBench   = (lineup.bench || []).map(n => n ? findTeamByNormalizedName(n) : null);
      setStarters(resolvedStarters);
      setBench(resolvedBench);
      setCaptain(lineup.captain || null);
    } else {
      setStarters(Array(5).fill(null));
      setBench(Array(2).fill(null));
      setCaptain(null);
    }
    setHasChanges(false);
  }, [lineup, allTeams]);

  const findTeamByNormalizedName = (normalizedName) =>
    Object.values(allTeams).find(team => weeklyLineupUtils.normalizeTeamName(team) === normalizedName);

  const handleCaptainSelect = (teamName) => {
    // Find the actual team object from starters or bench
    const teamObject = [...starters, ...bench]
      .filter(team => team !== null)
      .find(team => (team.school || team.name) === teamName);
      
    if (!teamObject) {
      alert("Team not found in lineup");
      return;
    }

    if (!canBeCaptain(teamObject, starters, bench)) {
      alert("Captain must be selected from your current lineup");
      return;
    }

    const normalizedTeamName = weeklyLineupUtils.normalizeTeamName(teamObject);
    const newCaptain = captain === normalizedTeamName ? null : normalizedTeamName;
    setCaptain(newCaptain);
    setHasChanges(true);
  };

  const saveLineupChanges = async (newStarters, newBench, newCaptain = captain) => {
    try {
      setIsSaving(true);
      
      console.log("saveLineupChanges called with:");
      console.log("newCaptain:", newCaptain);
      console.log("current captain state:", captain);
      
      const validatedCaptain = newCaptain && canBeCaptain(newCaptain, newStarters, newBench) ? newCaptain : null;
      console.log("validatedCaptain after validation:", validatedCaptain);
      
      await onSave(newStarters, newBench, validatedCaptain);
      setStarters(newStarters);
      setBench(newBench);
      setCaptain(validatedCaptain);
      setHasChanges(false);
    } catch (e) {
      console.error("Error saving lineup:", e);
    } finally {
      setIsSaving(false);
    }
  };

  const handleTeamMove = async (team, fromSection, fromIndex, toSection, toIndex = null) => {
    if (!isEditable || isSaving) return;

    const teamName = team.school || team.name;
    const moveValidation = await canMoveTeam(teamName, week);
    
    if (!moveValidation.canMove) {
      alert(`Cannot move ${teamName}: ${moveValidation.message}`);
      return;
    }

    const newStarters = [...starters];
    const newBench = [...bench];

    if (toIndex === null) {
      toIndex = (toSection === 'starters')
        ? newStarters.findIndex(t => t === null)
        : newBench.findIndex(t => t === null);
    }

    if (toIndex === -1) {
      setShowReplaceModal({ movingTeam: team, fromSection, fromIndex, toSection });
      return;
    }

    if (fromSection === 'starters') newStarters[fromIndex] = null; else newBench[fromIndex] = null;

    const displaced = (toSection === 'starters') ? newStarters[toIndex] : newBench[toIndex];
    
    if (displaced) {
      const displacedTeamName = displaced.school || displaced.name;
      const displacedValidation = await canMoveTeam(displacedTeamName, week);
      
      if (!displacedValidation.canMove) {
        alert(`Cannot displace ${displacedTeamName}: ${displacedValidation.message}`);
        return;
      }
    }
    
    if (toSection === 'starters') newStarters[toIndex] = team; else newBench[toIndex] = team;

    if (displaced) {
      const targetArray = (toSection === 'starters') ? newBench : newStarters;
      const emptyIndex = targetArray.findIndex(t => t === null);
      if (emptyIndex !== -1) {
        if (toSection === 'starters') newBench[emptyIndex] = displaced;
        else newStarters[emptyIndex] = displaced;
      } else {
        if (fromSection === 'starters') newStarters[fromIndex] = displaced; else newBench[fromIndex] = displaced;
      }
    }

    await saveLineupChanges(newStarters, newBench);
  };

  const handleTeamCut = async (team, section, index) => {
    const teamName = team.school || team.name;
    const moveValidation = await canMoveTeam(teamName, week);
    
    if (!moveValidation.canMove) {
      alert(`Cannot cut ${teamName}: ${moveValidation.message}`);
      return;
    }
    
    setShowConfirmCut({ team, section, index });
  };

  const confirmCut = async () => {
    if (!showConfirmCut || isSaving) return;

    const { team, section, index } = showConfirmCut;
    const newStarters = [...starters];
    const newBench = [...bench];
    const teamName = team.school || team.name;

    if (section === 'starters') newStarters[index] = null; else newBench[index] = null;

    const newCaptain = captain === teamName ? null : captain;

    try {
      setIsSaving(true);
      await saveLineupChanges(newStarters, newBench, newCaptain);

      const moveHistoryRef = collection(db, "leagues", leagueId, "moveHistory");
      await addDoc(moveHistoryRef, {
        userId,
        teamName: userDisplayName,
        moveType: "drop",
        dropped: team.school || team.name,
        pickedUp: null,
        timestamp: new Date(),
        week: currentWeek || "Preseason",
      });

      const memberRef = doc(db, "leagues", leagueId, "members", userId);
      await updateDoc(memberRef, { freeAgentMoves: increment(1) });
    } catch (e) {
      console.error("Error cutting team and recording move:", e);
    } finally {
      setIsSaving(false);
      setShowConfirmCut(null);
    }
  };

  const handleReplaceTeam = async (targetIndex) => {
    if (!showReplaceModal || isSaving) return;
    const { movingTeam, fromSection, fromIndex, toSection } = showReplaceModal;
    
    const movingTeamName = movingTeam.school || movingTeam.name;
    const movingValidation = await canMoveTeam(movingTeamName, week);
    
    if (!movingValidation.canMove) {
      alert(`Cannot move ${movingTeamName}: ${movingValidation.message}`);
      setShowReplaceModal(null);
      return;
    }
    
    const newStarters = [...starters];
    const newBench = [...bench];
    const replacedTeam = (toSection === 'starters') ? newStarters[targetIndex] : newBench[targetIndex];
    
    if (replacedTeam) {
      const replacedTeamName = replacedTeam.school || replacedTeam.name;
      const replacedValidation = await canMoveTeam(replacedTeamName, week);
      
      if (!replacedValidation.canMove) {
        alert(`Cannot displace ${replacedTeamName}: ${replacedValidation.message}`);
        setShowReplaceModal(null);
        return;
      }
    }

    if (fromSection === 'starters') newStarters[fromIndex] = null; else newBench[fromIndex] = null;
    if (toSection === 'starters') newStarters[targetIndex] = movingTeam; else newBench[targetIndex] = movingTeam;
    if (fromSection === 'starters') newStarters[fromIndex] = replacedTeam || null; else newBench[fromIndex] = replacedTeam || null;

    await saveLineupChanges(newStarters, newBench);
    setShowReplaceModal(null);
  };

  const handleSave = async () => {
    if (hasChanges && isEditable && !isSaving) await saveLineupChanges(starters, bench, captain);
  };

  /* ---------- Enhanced Team Card with Captain Selection ---------- */
  const TeamSlot = ({ team, section, index, size = 42 }) => {
    const [showActions, setShowActions] = useState(false);
    const [lockStatus, setLockStatus] = useState({ locked: false, message: null });
    const [gameDisplayInfo, setGameDisplayInfo] = useState(null);

    useEffect(() => {
      const checkTeamLock = async () => {
        if (!team) {
          setLockStatus({ locked: false, message: null });
          return;
        }
        
        const teamName = team.school || team.name;
        const lockInfo = await isTeamLocked(teamName, week);
        setLockStatus({
          locked: lockInfo.locked,
          message: lockInfo.message,
          reason: lockInfo.reason
        });
      };

      checkTeamLock();
    }, [team, week]);

    useEffect(() => {
      const loadGameDisplayInfo = async () => {
        if (!team) {
          setGameDisplayInfo(null);
          return;
        }
        
        const teamName = team.school || team.name;
        const gameInfo = await getTeamGameInfo(teamName, week);
        const displayInfo = getGameDisplayInfo(gameInfo, teamName);
        
        if (gameInfo) {
          displayInfo.gameSpread = getGameSpreadDisplay(gameInfo, teamName);
        }
        
        setGameDisplayInfo(displayInfo);
      };

      loadGameDisplayInfo();
    }, [team, week]);

    if (!team) {
      return (
        <div className="flex items-center justify-center py-5 border-2 border-dashed border-white/15 rounded-xl min-h-[72px]">
          {isEditable ? (
            <Link
              to={`/${leagueId}/free-agents?returnWeek=${week}&section=${section}&index=${index}`}
              className="flex items-center gap-2 text-white/70 hover:text-white transition-colors duration-200 no-underline"
            >
              <div className="w-7 h-7 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center text-lg text-white transition-colors duration-200">+</div>
              <span className="font-semibold text-sm">Add Team</span>
            </Link>
          ) : (
            <div className="text-white/50 text-sm">Empty Slot</div>
          )}
        </div>
      );
    }

    const opponent = team.currentSeason?.nextOpponent;
    const spread = team.currentSeason?.nextOpponentSpreadDisplay;
    const isHome = team.currentSeason?.nextGameIsHome;
    const record = team.currentSeason?.record || '0-0';
    const baseGamePoints = team.currentSeason?.gamePoints || 0;
    const baseWeeklyPts = (team.currentSeason?.weeklyPoints?.[`week${week}`] || 0);

    const teamName = team.school || team.name;
    const normalizedTeamName = weeklyLineupUtils.normalizeTeamName(team);
    const isCaptain = captain && captain === normalizedTeamName;
    console.log("Captain check:", { captain, normalizedTeamName, isCaptain, teamName });
    const gamePointsCalc = { finalPoints: baseGamePoints, bonus: 0, isCaptain: false };
    const weeklyPointsCalc = calculateCaptainPoints(baseWeeklyPts, isCaptain);
    
    const displaySeasonPoints = baseGamePoints;

    return (
        <div className={`rounded-xl border overflow-hidden ${
          isCaptain 
            ? 'bg-gradient-to-br from-yellow-500/20 to-yellow-600/20 border-yellow-400/50 ring-2 ring-yellow-400/50 shadow-lg shadow-yellow-400/20' 
            : lockStatus.locked 
              ? 'border-red-400/50 bg-red-500/10' 
              : 'bg-white/6 border-white/10'
        }`}>
        <div className="p-3">
          <div className="grid grid-cols-[44px,1fr,auto] gap-3 items-center">
            {/* LEFT: Logo + action toggle */}
            <div className="flex flex-col items-center gap-1">
              <div className="relative">
                <TeamLogo teamName={team.school} size={size} clickable={true} />
                
                {isCaptain && (
                  <div className="absolute -top-2 -right-2 bg-yellow-500 rounded-full p-1">
                    <Crown size={12} className="text-white" />
                  </div>
                )}
                
                {lockStatus.locked && (
                  <div className="absolute -top-1 -left-1 bg-red-500 rounded-full p-1">
                    <Lock size={12} className="text-white" />
                  </div>
                )}
                
                {gameDisplayInfo?.isLive && (
                  <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 rounded-full animate-ping">
                    <div className="absolute inset-0 bg-green-500 rounded-full animate-pulse"></div>
                  </div>
                )}
              </div>
              {isEditable && !lockStatus.locked && (
                <button
                  onClick={() => setShowActions(!showActions)}
                  className="p-1 hover:bg-white/10 rounded-md transition-colors duration-200"
                  title="Team actions"
                  aria-expanded={showActions}
                  disabled={isSaving}
                >
                  {showActions ? <ChevronUp size={16} className="text-white/80" /> : <ChevronDown size={16} className="text-white/80" />}
                </button>
              )}
            </div>

            {/* MIDDLE: Team + game row */}
            <div className="min-w-0">
              <div className={`font-semibold text-[15px] leading-tight truncate ${
                lockStatus.locked ? 'text-red-300' : 'text-white'
              }`}>
                {team.school}
                {isCaptain && (
                  <span className="ml-2 text-xs text-yellow-400 font-bold">CAPTAIN</span>
                )}
                {lockStatus.locked && (
                  <span className="ml-2 text-xs text-red-400">LOCKED</span>
                )}
              </div>
              <div className="text-xs text-white/70 truncate">
                {gameDisplayInfo?.subtext || (opponent ? `${isHome ? 'vs' : '@'} ${opponent}` : 'No next game set')}
              </div>

              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                {gameDisplayInfo && (
                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${gameDisplayInfo.chipClass}`}>
                    {gameDisplayInfo.display}
                  </span>
                )}
                
                <span className="px-2 py-0.5 rounded-full text-[11px] bg-white/10 text-yellow-300/90">
                  {gameDisplayInfo?.gameSpread ? `Spread ${gameDisplayInfo.gameSpread}` : 'Line TBD'}
                </span>
                
                <span className="px-2 py-0.5 rounded-full text-[11px] bg-white/10 text-blue-300/90">
                  {record}
                </span>
              </div>
            </div>

            {/* RIGHT: points column with captain bonus */}
            <div className="text-right leading-tight">
              <div className="font-bold text-sm text-green-400">
                {gamePointsCalc.finalPoints}
              </div>
              <div className="text-[11px] text-green-300/80 -mt-0.5">
                Season Points
              </div>
              <div className={`font-bold text-sm mt-1 ${isCaptain ? 'text-yellow-400' : 'text-orange-400'}`}>
                {weeklyPointsCalc.finalPoints}
                {isCaptain && weeklyPointsCalc.bonus > 0 && (
                  <span className="text-[10px] text-yellow-300 ml-1">+{weeklyPointsCalc.bonus}</span>
                )}
              </div>
              <div className="text-[11px] text-orange-300/80 -mt-0.5">
                Weekly Points{isCaptain ? ' (2x)' : ''}
              </div>
            </div>
          </div>
        </div>

        {/* Actions section with captain option */}
        {isEditable && showActions && !lockStatus.locked && (
          <div className="bg-white/6 border-t border-white/10 p-2.5">
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    handleTeamMove(team, section, index, section === 'starters' ? 'bench' : 'starters');
                    setShowActions(false);
                  }}
                  disabled={isSaving}
                  className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-500 text-white text-xs rounded-lg transition-colors font-medium"
                >
                  {section === 'starters' ? '📋 Move to Bench' : '🚀 Move to Starters'}
                </button>
                <button
                  onClick={() => { handleTeamCut(team, section, index); setShowActions(false); }}
                  disabled={isSaving}
                  className="px-3 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-500 text-white text-xs rounded-lg transition-colors font-medium"
                >
                  🗑️ Cut
                </button>
              </div>
              
              <button
                onClick={() => { handleCaptainSelect(teamName); setShowActions(false); }}
                disabled={isSaving || section === 'bench'}
                className={`w-full px-3 py-2 text-white text-xs rounded-lg transition-colors font-medium ${
                  section === 'bench' 
                    ? 'bg-gray-500 cursor-not-allowed'
                    : isCaptain 
                      ? 'bg-yellow-600 hover:bg-yellow-700' 
                      : 'bg-purple-600 hover:bg-purple-700'
                } disabled:bg-gray-500`}
              >
                {section === 'bench' 
                  ? '🪑 Bench (No Captain)' 
                  : isCaptain 
                    ? '👑 Remove Captain' 
                    : '👑 Make Captain'
                }
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  const ConfirmCutModal = () => {
    const isOpen = !!showConfirmCut;
    useLockBodyScroll(isOpen);
    if (!isOpen) return null;

    const { team } = showConfirmCut;
    const gamePoints = team.currentSeason?.gamePoints || 0;
    const record = team.currentSeason?.record || '0-0';

    return (
      <ModalPortal open={true}>
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-[10000]">
          <div className="absolute inset-0 bg-black/60" />
          <div className="relative h-full w-full flex items-center justify-center p-4" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
            <div className="bg-white rounded-2xl p-6 max-w-md w-full border border-gray-200 shadow-2xl overflow-hidden">
              <div className="text-center">
                <div className="text-4xl mb-4">⚠️</div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">Cut {team.school}?</h3>
                <div className="text-gray-600 mb-4">
                  <div className="bg-gray-100 rounded-lg p-3">
                    <div className="font-medium text-gray-800">{team.school}</div>
                    <div className="text-sm text-gray-600">{team.conference}</div>
                    <div className="text-sm text-gray-600 mt-1">{gamePoints} Season Points • {record}</div>
                    {captain === (team.school || team.name) && (
                      <div className="text-sm text-yellow-600 mt-1 font-bold">⚠️ This is your current captain</div>
                    )}
                  </div>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setShowConfirmCut(null)} className="flex-1 py-3 px-4 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-medium transition-colors duration-200">Cancel</button>
                  <button onClick={confirmCut} disabled={isSaving} className="flex-1 py-3 px-4 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors duration-200">{isSaving ? 'Cutting...' : 'Cut Team'}</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </ModalPortal>
    );
  };

  const ReplaceTeamModal = () => {
    const isOpen = !!showReplaceModal;
    useLockBodyScroll(isOpen);
    if (!isOpen) return null;

    const { movingTeam, toSection } = showReplaceModal;
    const slots = toSection === 'starters' ? starters : bench;

    return (
      <ModalPortal open={true}>
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-[10000]">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowReplaceModal(null)} />
          <div className="absolute left-0 right-0 bottom-0" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
            <div className="bg-white rounded-t-2xl border border-gray-200 shadow-2xl max-h-[80vh] h-[72vh] overflow-hidden">
              <div className="px-5 pt-4 pb-3 border-b border-gray-200">
                <div className="mx-auto h-1.5 w-12 rounded-full bg-gray-300 mb-3" />
                <h3 className="text-lg font-bold text-gray-900 text-center">Swap {movingTeam.school}</h3>
                <p className="text-sm text-gray-600 text-center mt-1">
                  Choose a spot on the {toSection === 'starters' ? 'Starters (5)' : 'Bench (2)'}
                </p>
              </div>

              <div className="overflow-y-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
                {slots.map((slotTeam, idx) => {
                  const opponent = slotTeam?.currentSeason?.nextOpponent;
                  const rawSpread = slotTeam?.currentSeason?.nextOpponentSpreadDisplay || '';
                  const spread =
                    rawSpread && rawSpread.toString().trim().toUpperCase() !== 'TBD'
                      ? rawSpread
                      : null;
                  const isHome = slotTeam?.currentSeason?.nextGameIsHome;
                  const gameTime = formatGameTimeChip(slotTeam?.currentSeason?.nextGameDate);

                  const title = slotTeam
                    ? `${slotTeam.school} (${spread || 'TBD'})`
                    : '';

                  const meta = [
                    opponent ? `${isHome ? 'vs' : '@'} ${opponent}` : null,
                    gameTime
                  ].filter(Boolean).join(' • ');

                  return (
                    <button
                      key={idx}
                      onClick={() => handleReplaceTeam(idx)}
                      disabled={isSaving}
                      className="w-full text-left"
                    >
                      <div className="px-5 py-3.5 border-b border-gray-200 flex items-center gap-3 min-h-[56px]">
                        <div className="flex-1 min-w-0">
                          {slotTeam ? (
                            <>
                              <div className="font-semibold text-gray-900 truncate">{title}</div>
                              <div className="text-xs text-gray-600 truncate">{meta}</div>
                            </>
                          ) : (
                            <div className="text-gray-500">Empty slot</div>
                          )}
                        </div>
                        <div className="shrink-0">
                          <span className="inline-flex items-center justify-center px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium">
                            Swap
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="p-4 border-t border-gray-200">
                <button onClick={() => setShowReplaceModal(null)} className="w-full py-3 rounded-xl bg-gray-600 text-white font-medium">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      </ModalPortal>
    );
  };

  return (
    <div>
      {captain && (
        <div className="bg-yellow-500/20 border border-yellow-400/30 rounded-xl p-3 mb-4">
          <div className="flex items-center gap-3">
            <Crown className="text-yellow-400" size={20} />
            <div>
              <span className="text-yellow-200 font-semibold">
                Captain: {
                  [...starters, ...bench]
                    .filter(team => team !== null)
                    .find(team => weeklyLineupUtils.normalizeTeamName(team) === captain)?.school || captain
                }
              </span>
              <div className="text-yellow-300/80 text-sm">This team will earn double points (positive or negative)</div>
            </div>
          </div>
        </div>
      )}

      {week === currentWeek && (
        <div className="bg-blue-500/20 border border-blue-400/30 rounded-xl p-3 mb-4">
          <div className="flex items-center gap-2 text-blue-200">
            <Lock size={16} />
            <span className="text-sm font-medium">
              Individual teams lock 1 hour before their games start. Locked teams will show a red indicator.
            </span>
          </div>
        </div>
      )}

      <div className="mb-5">
        <h4 className="text-base font-semibold text-white mb-3 flex items-center gap-2">
          🏈 Starters (5)
        </h4>
        <div className="space-y-2.5">
          {starters.map((team, index) => (
            <TeamSlot key={`starter-${index}`} team={team} section="starters" index={index} />
          ))}
        </div>
      </div>

      <div className="mb-5">
        <h4 className="text-base font-semibold text-white mb-3 flex items-center gap-2">
          🪑 Bench (2)
        </h4>
        <div className="space-y-2.5">
          {bench.map((team, index) => (
            <TeamSlot key={`bench-${index}`} team={team} section="bench" index={index} />
          ))}
        </div>
      </div>

      {isEditable && hasChanges && (
        <div className="bg-green-500/20 border border-green-400/30 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-green-200 font-medium">You have unsaved changes</span>
              {captain && (
                <div className="text-green-300/80 text-sm">Captain: {captain} (2x points)</div>
              )}
            </div>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg font-medium transition-colors"
            >
              {isSaving ? 'Saving...' : 'Save Lineup'}
            </button>
          </div>
        </div>
      )}

      <ConfirmCutModal />
      <ReplaceTeamModal />
    </div>
  );
};

export default WeeklyLineupManager;