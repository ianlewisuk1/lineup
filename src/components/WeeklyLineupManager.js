// WeeklyLineupManager.js — compact layout + iOS-safe modals + improved replace sheet + Individual Team Locking
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { doc, getDoc, updateDoc, collection, getDocs, addDoc, increment } from 'firebase/firestore';
import { db } from '../firebase/firebase';
import { weeklyLineupUtils } from '../utils/weeklyLineupUtils';
import { ChevronLeft, ChevronRight, Lock, Clock, CheckCircle, ChevronDown, ChevronUp } from 'lucide-react';

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
          ...gameData
        });
      }
    });

    if (teamGames.length === 0) return null;

    // Sort by date and return first game (for teams with multiple games in Week 1)
    teamGames.sort((a, b) => a.date - b.date);
    return teamGames[0];
  } catch (error) {
    console.error(`Error getting game info for ${teamName}, week ${week}:`, error);
    return null;
  }
};

/**
 * Check if a specific team is locked (game started or completed)
 * @param {string} teamName - The team name to check
 * @param {number} week - The week number
 * @param {Date} currentTime - Current time (defaults to now)
 * @returns {Promise<Object>} Lock status object
 */
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

    // Check if game is completed
    if (gameInfo.gameComplete) {
      return {
        locked: true,
        reason: 'game_completed',
        message: `${teamName} is locked - game completed`,
        gameInfo
      };
    }

    // FIX: Ensure date is a proper Date object
    const gameDate = gameInfo.date instanceof Date ? gameInfo.date : new Date(gameInfo.date);
    
    // Check if date conversion worked
    if (isNaN(gameDate.getTime())) {
      console.error(`Invalid date for ${teamName}:`, gameInfo.date);
      return {
        locked: false,  // FIXED: Don't lock on invalid date
        reason: 'invalid_date',
        message: `${teamName} lock status unavailable - invalid date`,
        gameInfo
      };
    }

    // Check if game has started (1 hour buffer before kickoff)
    const lockTime = new Date(gameDate.getTime() - (60 * 60 * 1000)); // 1 hour before
    if (currentTime >= lockTime) {
      return {
        locked: true,
        reason: gameDate <= currentTime ? 'game_started' : 'lock_time_reached',
        message: `${teamName} is locked - ${gameDate <= currentTime ? 'game started' : 'lineup locked'}`,
        gameInfo,
        lockTime,
        gameDate  // Add this for debugging
      };
    }

    return {
      locked: false,
      reason: null,
      message: null,
      gameInfo,
      lockTime,
      gameDate  // Add this for debugging
    };
  } catch (error) {
    console.error(`Error checking lock status for ${teamName}:`, error);
    // FIXED: Default to unlocked on error instead of locked
    return {
      locked: false,
      reason: 'error',
      message: `${teamName} lock status check failed`,
      gameInfo: null
    };
  }
};

/**
 * Get all teams with multiple games in a specific week (primarily Week 1)
 * @param {number} week - The week number to check
 * @returns {Promise<Array>} Array of team names with multiple games
 */
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

/**
 * Enhanced team data structure with live game data preparation
 * This extends the existing team object with placeholders for live scoring
 * @param {Object} team - The team object to enhance
 * @returns {Object|null} Enhanced team object or null
 */
const enhanceTeamWithLiveData = (team) => {
  if (!team) return null;

  return {
    ...team,
    // Preserve existing data
    currentSeason: {
      ...team.currentSeason,
      // Add live game data structure (initially empty, populated by future live score system)
      liveGame: team.currentSeason?.liveGame || {
        gameStatus: null,        // "scheduled", "in_progress", "final"
        homeScore: null,         // Current home team score
        awayScore: null,         // Current away team score
        quarter: null,           // Current quarter/period
        timeRemaining: null,     // Time remaining in current quarter
        lastUpdated: null,       // When live data was last updated
        possession: null         // Which team has possession (future)
      }
    },
    // Add lock status (will be populated by lock detection functions)
    lockStatus: {
      locked: false,
      reason: null,
      message: null,
      lockTime: null
    }
  };
};

/**
 * Check if user has teams with multiple games in their starting lineup
 * @param {Array} starters - Array of starting lineup teams
 * @param {number} week - Week number to check
 * @returns {Promise<Object>} Information about dual-game teams in starters
 */
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

/* ---------- NEW: Individual Team Locking Functions (Step 1.1c) ---------- */

/**
 * Enhanced lineup status calculation with individual team locking
 * @param {Object} weeklyLineups - User's weekly lineups object
 * @param {number} week - Week number
 * @param {Date} currentTime - Current time (defaults to now)
 * @returns {Promise<Object>} Lineup status with individual team details
 */
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
  
  // Get all teams in the lineup (starters + bench)
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
  
  // Check lock status for each team
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
  
  // Determine overall status
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
    teamStatuses // Full details for each team
  };
};

/**
 * Check if a team can be moved/added to lineup
 * @param {string} teamName - Team name to check
 * @param {number} week - Week number
 * @param {Date} currentTime - Current time (defaults to now)
 * @returns {Promise<Object>} Move validation result
 */
const canMoveTeam = async (teamName, week, currentTime = new Date()) => {
  const lockInfo = await isTeamLocked(teamName, week, currentTime);
  
  return {
    canMove: !lockInfo.locked,
    reason: lockInfo.locked ? lockInfo.reason : 'team_available',
    message: lockInfo.message,
    lockInfo
  };
};

/* ---------- END NEW UTILITIES ---------- */

/* ---------- shared helpers (module scope) ---------- */
const toJSDate = (v) => {
  if (!v) return null;
  if (typeof v?.toDate === 'function') return v.toDate(); // Firestore Timestamp
  if (typeof v === 'number') return new Date(v);          // epoch ms
  const d = new Date(v);                                  // ISO/string
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
  onTeamClick,   // kept for API parity
  TeamLogo,
  userDisplayName
}) => {
  const [selectedWeek, setSelectedWeek] = useState(currentWeek);
  const [weeklyLineups, setWeeklyLineups] = useState({});
  const [weekStatuses, setWeekStatuses] = useState({});
  const [loading, setLoading] = useState(true);
  const [availableWeeks, setAvailableWeeks] = useState([]);

  useEffect(() => {
    initializeWeeklyLineups();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId, userId]);

  // NEW: Updated initializeWeeklyLineups with enhanced data structure
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
        
        // Helper function to create enhanced lineup structure
        const createEnhancedLineup = (existingLineup = null) => {
          const baseLineup = existingLineup || {
            starters: Array(5).fill(null),
            bench: Array(2).fill(null),
            lockedAt: null
          };
          
          // Add new individual team lock tracking if not present
          return {
            starters: baseLineup.starters || Array(5).fill(null),
            bench: baseLineup.bench || Array(2).fill(null),
            
            // NEW: Individual team lock tracking
            lockedTeams: baseLineup.lockedTeams || [],        // Array of locked team names
            teamLockTimes: baseLineup.teamLockTimes || {},    // Team name -> lock time mapping
            
            // Keep for backward compatibility
            lockedAt: baseLineup.lockedAt || null
          };
        };
        
        if (week === currentWeek && currentLineup) {
          // Current week - use member's current lineup with enhanced structure
          lineupData[weekKey] = createEnhancedLineup({
            starters: currentLineup.starters || Array(5).fill(null),
            bench: currentLineup.bench || Array(2).fill(null),
            lockedAt: null
          });
        } else if (existingWeeklyData[weekKey]) {
          // Existing weekly data - enhance with new fields if missing
          lineupData[weekKey] = createEnhancedLineup(existingWeeklyData[weekKey]);
        } else {
          // New week - create fresh enhanced lineup
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
        });

        let status = 'locked';
        let lockTime = null;
        let unlockTime = null;

        if (firstGameTime) {
          lockTime = new Date(firstGameTime.getTime() - (60 * 60 * 1000));
          if (lastGameTime) unlockTime = new Date(lastGameTime.getTime() + (60 * 60 * 1000));

          if (week === currentWeek && now < lockTime) status = 'editable';
          else if (week === currentWeek && now >= lockTime && !allGamesComplete) status = 'locked_playing';
          else if (allGamesComplete && week < currentWeek) status = 'completed';
          else if (week > currentWeek) status = 'future';
        }

        statuses[week] = { status, lockTime, unlockTime, firstGameTime, lastGameTime, allGamesComplete };
      } catch (error) {
        console.error(`Error calculating status for week ${week}:`, error);
        statuses[week] = { status: 'locked' };
      }
    }
    setWeekStatuses(statuses);
  };

  // NEW: Updated saveLineup with enhanced structure support
  const saveLineup = async (week, starters, bench) => {
    try {
      const normalizedStarters = starters.map(team => team ? weeklyLineupUtils.normalizeTeamName(team) : null);
      const normalizedBench = bench.map(team => team ? weeklyLineupUtils.normalizeTeamName(team) : null);

      if (week === currentWeek) {
        const memberRef = doc(db, "leagues", leagueId, "members", userId);
        await updateDoc(memberRef, { lineup: { starters: normalizedStarters, bench: normalizedBench } });
      } else {
        console.warn(`Attempted to save non-current week ${week}. Current week is ${currentWeek}`);
      }

      const weekKey = `week${week}`;
      
      // Create enhanced lineup structure for the update
      const updatedLineup = {
        starters: normalizedStarters,
        bench: normalizedBench,
        lockedTeams: weeklyLineups[weekKey]?.lockedTeams || [],
        teamLockTimes: weeklyLineups[weekKey]?.teamLockTimes || {},
        lockedAt: null
      };
      
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
      case 'locked_playing': return <Lock className="text-yellow-400" size={16} />;
      case 'completed':      return <CheckCircle className="text-blue-400" size={16} />;
      case 'future':         return <Lock className="text-gray-400" size={16} />;
      default:               return <Lock className="text-gray-400" size={16} />;
    }
  };

  // NEW: Enhanced status message for individual team locking
  const getStatusMessage = (week) => {
    const status = weekStatuses[week];
    if (!status) return "Loading...";
    
    switch (status.status) {
      case 'editable':       
        return `Teams lock 1 hour before their games start`;
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
          isEditable={true}  // FIXED: Always allow editing, individual teams will enforce locks
          onSave={(starters, bench) => saveLineup(selectedWeek, starters, bench)}
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
    } else {
      setStarters(Array(5).fill(null));
      setBench(Array(2).fill(null));
    }
    setHasChanges(false);
  }, [lineup, allTeams]);

  const findTeamByNormalizedName = (normalizedName) =>
    Object.values(allTeams).find(team => weeklyLineupUtils.normalizeTeamName(team) === normalizedName);

  const saveLineupChanges = async (newStarters, newBench) => {
    try {
      setIsSaving(true);
      await onSave(newStarters, newBench);
      setStarters(newStarters);
      setBench(newBench);
      setHasChanges(false);
    } catch (e) {
      console.error("Error saving lineup:", e);
    } finally {
      setIsSaving(false);
    }
  };

  // NEW: Enhanced handleTeamMove with individual team lock validation
  const handleTeamMove = async (team, fromSection, fromIndex, toSection, toIndex = null) => {
    if (!isEditable || isSaving) return;

    // NEW: Check if team can be moved (individual team locking)
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
    
    // NEW: Check if displaced team is locked
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

  // NEW: Enhanced handleTeamCut with individual team lock validation
  const handleTeamCut = async (team, section, index) => {
    // NEW: Check if team can be cut (individual team locking)
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

    if (section === 'starters') newStarters[index] = null; else newBench[index] = null;

    try {
      setIsSaving(true);
      await saveLineupChanges(newStarters, newBench);

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

  // NEW: Enhanced handleReplaceTeam with individual team lock validation
  const handleReplaceTeam = async (targetIndex) => {
    if (!showReplaceModal || isSaving) return;
    const { movingTeam, fromSection, fromIndex, toSection } = showReplaceModal;
    
    // NEW: Validate both teams can be moved
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
    if (hasChanges && isEditable && !isSaving) await saveLineupChanges(starters, bench);
  };

  /* ---------- Compact Team Card with Individual Lock Detection ---------- */
  const TeamSlot = ({ team, section, index, size = 42 }) => {
    const [showActions, setShowActions] = useState(false);
    const [lockStatus, setLockStatus] = useState({ locked: false, message: null });

    // NEW: Check individual team lock status
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

    const gameTime = formatGameTimeChip(team.currentSeason?.nextGameDate);
    const opponent = team.currentSeason?.nextOpponent;
    const spread = team.currentSeason?.nextOpponentSpreadDisplay;
    const isHome = team.currentSeason?.nextGameIsHome;
    const record = team.currentSeason?.record || '0-0';
    const gamePoints = team.currentSeason?.gamePoints || 0;
    const weeklyPts = (team.currentSeason?.weeklyPoints?.[`week${week}`] || 0);

    return (
      <div className={`bg-white/6 rounded-xl border overflow-hidden ${
        lockStatus.locked ? 'border-red-400/50 bg-red-500/10' : 'border-white/10'
      }`}>
        <div className="p-3">
          <div className="grid grid-cols-[44px,1fr,auto] gap-3 items-center">
            {/* LEFT: Logo + quick action toggle */}
            <div className="flex flex-col items-center gap-1">
              <div className="relative">
                <TeamLogo teamName={team.school} size={size} clickable={true} />
                {/* NEW: Lock indicator overlay */}
                {lockStatus.locked && (
                  <div className="absolute -top-1 -right-1 bg-red-500 rounded-full p-1">
                    <Lock size={12} className="text-white" />
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

            {/* MIDDLE: Team + game row (compact) */}
            <div className="min-w-0">
              <div className={`font-semibold text-[15px] leading-tight truncate ${
                lockStatus.locked ? 'text-red-300' : 'text-white'
              }`}>
                {team.school}
                {lockStatus.locked && (
                  <span className="ml-2 text-xs text-red-400">LOCKED</span>
                )}
              </div>
              <div className="text-xs text-white/70 truncate">
                {opponent ? `${isHome ? 'vs' : '@'} ${opponent}` : 'No next game set'}
              </div>

              {/* chips row */}
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                {gameTime && (
                  <span className={`px-2 py-0.5 rounded-full text-[11px] ${
                    lockStatus.locked ? 'bg-red-500/20 text-red-300' : 'bg-white/10 text-white/80'
                  }`}>
                    {gameTime}
                  </span>
                )}
                <span className="px-2 py-0.5 rounded-full text-[11px] bg-white/10 text-yellow-300/90">
                  {spread ? `Spread ${spread}` : 'Line TBD'}
                </span>
                <span className="px-2 py-0.5 rounded-full text-[11px] bg-white/10 text-blue-300/90">
                  {record}
                </span>
              </div>
            </div>

            {/* RIGHT: points column */}
            <div className="text-right leading-tight">
              <div className="text-green-400 font-bold text-sm">{gamePoints}</div>
              <div className="text-[11px] text-green-300/80 -mt-0.5">Season Points</div>
              <div className="text-orange-400 font-bold text-sm mt-1">{weeklyPts}</div>
              <div className="text-[11px] text-orange-300/80 -mt-0.5">Weekly Points</div>
            </div>
          </div>
        </div>

        {/* Actions section - only show if team is not locked */}
        {isEditable && showActions && !lockStatus.locked && (
          <div className="bg-white/6 border-t border-white/10 p-2.5">
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
          </div>
        )}
      </div>
    );
  };

  /* ------ Modals (portals) ------ */
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
              {/* Header */}
              <div className="px-5 pt-4 pb-3 border-b border-gray-200">
                <div className="mx-auto h-1.5 w-12 rounded-full bg-gray-300 mb-3" />
                <h3 className="text-lg font-bold text-gray-900 text-center">Swap {movingTeam.school}</h3>
                <p className="text-sm text-gray-600 text-center mt-1">
                  Choose a spot on the {toSection === 'starters' ? 'Starters (5)' : 'Bench (2)'}
                </p>
              </div>

              {/* Scrollable content */}
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

                  // Build clean metadata line (no record)
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

              {/* Footer */}
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
      {/* UPDATED: More informative warning message */}
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

      {/* Starters */}
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

      {/* Bench */}
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

      {/* Save Button */}
      {isEditable && hasChanges && (
        <div className="bg-green-500/20 border border-green-400/30 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <span className="text-green-200 font-medium">You have unsaved changes</span>
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

      {/* Modals (Portals) */}
      <ConfirmCutModal />
      <ReplaceTeamModal />
    </div>
  );
};

export default WeeklyLineupManager;