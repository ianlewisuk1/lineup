// WeeklyLineupManager.js - Updated with information-rich team cards and enhanced functionality
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { doc, getDoc, setDoc, updateDoc, collection, getDocs, addDoc, increment } from 'firebase/firestore';
import { db } from '../firebase/firebase';
import { weeklyLineupUtils } from '../utils/weeklyLineupUtils';
import { ChevronLeft, ChevronRight, Lock, Clock, CheckCircle, Settings, ChevronDown, ChevronUp } from 'lucide-react';

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

  // Initialize weekly lineup system
  useEffect(() => {
    initializeWeeklyLineups();
  }, [leagueId, userId]);

  const initializeWeeklyLineups = async () => {
    try {
      // Get season configuration
      const seasonRef = doc(db, "config", "season");
      const seasonSnap = await getDoc(seasonRef);
      const seasonData = seasonSnap.data();
      
      // Get available weeks (1-14 for regular season)
      const weeks = Array.from({ length: 14 }, (_, i) => i + 1);
      setAvailableWeeks(weeks);
      
      // Load data from different sources based on week status
      const lineupData = {};
      
      // 1. Load historical weeks from weeklyLineups collection
      const weeklyLineupsRef = doc(db, "leagues", leagueId, "weeklyLineups", userId);
      const weeklyLineupsSnap = await getDoc(weeklyLineupsRef);
      const existingWeeklyData = weeklyLineupsSnap.exists() ? weeklyLineupsSnap.data() : {};
      
      // 2. Load current week from member.lineup
      const memberRef = doc(db, "leagues", leagueId, "members", userId);
      const memberSnap = await getDoc(memberRef);
      const memberData = memberSnap.data();
      const currentLineup = memberData?.lineup;
      
      // 3. Initialize lineup data for each week
      weeks.forEach(week => {
        const weekKey = `week${week}`;
        
        if (week === currentWeek && currentLineup) {
          // Current week: use member.lineup
          lineupData[weekKey] = {
            starters: currentLineup.starters || Array(5).fill(null),
            bench: currentLineup.bench || Array(2).fill(null),
            lockedAt: null // Current week is never locked in this data
          };
        } else if (existingWeeklyData[weekKey]) {
          // Historical week: use weeklyLineups collection
          lineupData[weekKey] = existingWeeklyData[weekKey];
        } else {
          // Future/empty week: initialize empty
          lineupData[weekKey] = {
            starters: Array(5).fill(null),
            bench: Array(2).fill(null),
            lockedAt: null
          };
        }
      });
      
      setWeeklyLineups(lineupData);
      
      // Calculate week statuses
      await calculateWeekStatuses(weeks);
      
      setLoading(false);
      console.log(`✅ Loaded lineups: current week ${currentWeek} from member.lineup, others from weeklyLineups collection`);
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
        console.log(`🔍 DEBUG: Processing week ${week}`);
        // Get games for this week
        const gamesSnap = await getDocs(
          collection(db, "schedule", "2025", "weeks", week.toString(), "games")
        );

        console.log(`📊 DEBUG: Found ${gamesSnap.size} games for week ${week}`);
        
        let firstGameTime = null;
        let lastGameTime = null;
        let allGamesComplete = true;
        
        gamesSnap.forEach(gameDoc => {
          const gameData = gameDoc.data();

          console.log(`🏈 DEBUG Game:`, gameData.homeTeam, 'vs', gameData.awayTeam, 'Date:', gameData.date);

          if (gameData.date) {
            const gameTime = new Date(gameData.date);
            if (!firstGameTime || gameTime < firstGameTime) {
              firstGameTime = gameTime;
            }
            if (!lastGameTime || gameTime > lastGameTime) {
              lastGameTime = gameTime;
            }
          }
          
          if (!gameData.gameComplete) {
            allGamesComplete = false;
          }
        });
        
        // Determine status
        let status = 'locked';
        let lockTime = null;
        let unlockTime = null;
        
        if (firstGameTime) {
          lockTime = new Date(firstGameTime.getTime() - (60 * 60 * 1000)); // 1 hour before first game
          
          console.log(`🚨 DEBUG Week ${week} - First game:`, firstGameTime.toString());
          console.log(`🔒 DEBUG Week ${week} - Lock time:`, lockTime.toString());

          if (lastGameTime) {
            unlockTime = new Date(lastGameTime.getTime() + (60 * 60 * 1000)); // 1 hour after last game
          }
          
          if (week === currentWeek && now < lockTime) {
            status = 'editable';
          } else if (week === currentWeek && now >= lockTime && !allGamesComplete) {
            status = 'locked_playing';
          } else if (allGamesComplete && week < currentWeek) {
            status = 'completed';
          } else if (week > currentWeek) {
            status = 'future';
          }
        }
        
        statuses[week] = {
          status,
          lockTime,
          unlockTime,
          firstGameTime,
          lastGameTime,
          allGamesComplete
        };
        
      } catch (error) {
        console.error(`Error calculating status for week ${week}:`, error);
        statuses[week] = { status: 'locked' };
      }
    }
    
    setWeekStatuses(statuses);
  };

  const saveLineup = async (week, starters, bench) => {
    try {
      const normalizedStarters = starters.map(team => team ? weeklyLineupUtils.normalizeTeamName(team) : null);
      const normalizedBench = bench.map(team => team ? weeklyLineupUtils.normalizeTeamName(team) : null);
      
      // For current week, save to member.lineup (existing system)
      if (week === currentWeek) {
        const memberRef = doc(db, "leagues", leagueId, "members", userId);
        await updateDoc(memberRef, {
          lineup: {
            starters: normalizedStarters,
            bench: normalizedBench
          }
        });
        console.log(`✅ Saved week ${week} to member.lineup`);
      } else {
        // For future weeks, this shouldn't happen in current design
        // but if it does, could save to weekly collection
        console.warn(`Attempted to save non-current week ${week}. Current week is ${currentWeek}`);
      }
      
      // Update local state to reflect the change
      const weekKey = `week${week}`;
      setWeeklyLineups(prev => ({
        ...prev,
        [weekKey]: {
          starters: normalizedStarters,
          bench: normalizedBench,
          lockedAt: null
        }
      }));
      
    } catch (error) {
      console.error("Error saving lineup:", error);
      throw error;
    }
  };

  const getWeekStatusIcon = (week) => {
    const status = weekStatuses[week]?.status;
    
    switch (status) {
      case 'editable':
        return <Clock className="text-green-400" size={16} />;
      case 'locked_playing':
        return <Lock className="text-yellow-400" size={16} />;
      case 'completed':
        return <CheckCircle className="text-blue-400" size={16} />;
      case 'future':
        return <Lock className="text-gray-400" size={16} />;
      default:
        return <Lock className="text-gray-400" size={16} />;
    }
  };

  const getStatusMessage = (week) => {
    const status = weekStatuses[week];
    if (!status) return "Loading...";
    
    switch (status.status) {
      case 'editable':
        return `Lineup locks ${status.lockTime ? formatDateTime(status.lockTime) : 'soon'}`;
      case 'locked_playing':
        return "Games in progress - lineup locked";
      case 'completed':
        return "Week completed";
      case 'future':
        return "Future week - locked";
      default:
        return "Locked";
    }
  };

  const formatDateTime = (date) => {
    return new Date(date).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short'
    });
  };

  if (loading) {
    return (
      <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20">
        <div className="text-center">
          <div className="text-2xl mb-2 animate-spin">🏈</div>
          <p className="text-white/80">Loading weekly lineups...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white/10 backdrop-blur-lg rounded-2xl border border-white/20 overflow-hidden">
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
              <h3 className="text-xl font-bold text-white">
                Week {selectedWeek}
              </h3>
              {selectedWeek === currentWeek && (
                <span className="bg-blue-500 text-white text-xs px-2 py-1 rounded-full font-medium">
                  Current
                </span>
              )}
            </div>
            <p className="text-sm text-white/60">
              {getStatusMessage(selectedWeek)}
            </p>
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
      <div className="p-6">
        <WeeklyLineupContent
          week={selectedWeek}
          lineup={weeklyLineups[`week${selectedWeek}`]}
          allTeams={allTeams}
          isEditable={weekStatuses[selectedWeek]?.status === 'editable'}
          onSave={(starters, bench) => saveLineup(selectedWeek, starters, bench)}
          onTeamClick={onTeamClick}
          TeamLogo={TeamLogo}
          leagueId={leagueId}
          userId={userId}                 // ✅
          userDisplayName={userDisplayName} // ✅
          currentWeek={currentWeek}       // ✅
        />
      </div>
    </div>
  );
};

// WeeklyLineupContent - The actual lineup display/editor with rich team information
const WeeklyLineupContent = ({ 
  week,
  lineup,
  allTeams,
  isEditable,
  onSave,
  onTeamClick,
  TeamLogo,
  leagueId,
  userId,           // ✅
  userDisplayName,  // ✅
  currentWeek      // ✅
}) => {
  const [starters, setStarters] = useState(Array(5).fill(null));
  const [bench, setBench] = useState(Array(2).fill(null));
  const [hasChanges, setHasChanges] = useState(false);
  const [showConfirmCut, setShowConfirmCut] = useState(null);
  const [showReplaceModal, setShowReplaceModal] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (lineup) {
      // Resolve team names to team objects
      const resolvedStarters = (lineup.starters || []).map(teamName => 
        teamName ? findTeamByNormalizedName(teamName) : null
      );
      const resolvedBench = (lineup.bench || []).map(teamName => 
        teamName ? findTeamByNormalizedName(teamName) : null
      );
      
      setStarters(resolvedStarters);
      setBench(resolvedBench);
    } else {
      setStarters(Array(5).fill(null));
      setBench(Array(2).fill(null));
    }
    setHasChanges(false);
  }, [lineup, allTeams]);

  const findTeamByNormalizedName = (normalizedName) => {
    return Object.values(allTeams).find(team => {
      const teamNormalized = weeklyLineupUtils.normalizeTeamName(team);
      return teamNormalized === normalizedName;
    });
  };

  const handleTeamMove = async (team, fromSection, fromIndex, toSection, toIndex = null) => {
    if (!isEditable || isSaving) return;
    
    const newStarters = [...starters];
    const newBench = [...bench];
    
    // If no specific index, find empty slot
    if (toIndex === null) {
      if (toSection === 'starters') {
        toIndex = newStarters.findIndex(t => t === null);
      } else {
        toIndex = newBench.findIndex(t => t === null);
      }
    }
    
    // If no empty slot, show replacement modal
    if (toIndex === -1) {
      setShowReplaceModal({
        movingTeam: team,
        fromSection,
        fromIndex,
        toSection,
        targetTeams: toSection === 'starters' ? newStarters.filter(t => t !== null) : newBench.filter(t => t !== null)
      });
      return;
    }
    
    // Remove from original position
    if (fromSection === 'starters') {
      newStarters[fromIndex] = null;
    } else {
      newBench[fromIndex] = null;
    }
    
    // Handle displacement if slot is occupied
    const displaced = (toSection === 'starters') ? newStarters[toIndex] : newBench[toIndex];
    
    // Add to new position
    if (toSection === 'starters') {
      newStarters[toIndex] = team;
    } else {
      newBench[toIndex] = team;
    }
    
    // Handle displaced team
    if (displaced) {
      const targetSection = (toSection === 'starters') ? 'bench' : 'starters';
      const targetArray = (toSection === 'starters') ? newBench : newStarters;
      const emptyIndex = targetArray.findIndex(t => t === null);
      
      if (emptyIndex !== -1) {
        if (targetSection === 'starters') {
          newStarters[emptyIndex] = displaced;
        } else {
          newBench[emptyIndex] = displaced;
        }
      } else {
        // Both sections full - put displaced back in original position
        if (fromSection === 'starters') {
          newStarters[fromIndex] = displaced;
        } else {
          newBench[fromIndex] = displaced;
        }
      }
    }
    
    // Save immediately
    await saveLineupChanges(newStarters, newBench);
  };

  const handleTeamCut = (team, section, index) => {
    setShowConfirmCut({ team, section, index });
  };

  const confirmCut = async () => {
    if (!showConfirmCut || isSaving) return;

    const { team, section, index } = showConfirmCut;
    const newStarters = [...starters];
    const newBench = [...bench];

    if (section === 'starters') newStarters[index] = null;
    else newBench[index] = null;

    try {
      setIsSaving(true);

      // Save lineup first
      await saveLineupChanges(newStarters, newBench);

      // Record move
      const moveHistoryRef = collection(db, "leagues", leagueId, "moveHistory");
      await addDoc(moveHistoryRef, {
        userId,
        teamName: userDisplayName,   // NOTE: this is the user's display name
        moveType: "drop",
        dropped: team.school || team.name,
        pickedUp: null,
        timestamp: new Date(),
        week: currentWeek || "Preseason",
      });

      // Increment FA move count
      const memberRef = doc(db, "leagues", leagueId, "members", userId);
      await updateDoc(memberRef, { freeAgentMoves: increment(1) });

      console.log(`✅ Team ${team.school || team.name} cut successfully and move recorded`);
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
    const newStarters = [...starters];
    const newBench = [...bench];
    
    // Get the team being replaced
    const replacedTeam = (toSection === 'starters') ? newStarters[targetIndex] : newBench[targetIndex];
    
    // Remove moving team from original position
    if (fromSection === 'starters') {
      newStarters[fromIndex] = null;
    } else {
      newBench[fromIndex] = null;
    }
    
    // Place moving team in target position
    if (toSection === 'starters') {
      newStarters[targetIndex] = movingTeam;
    } else {
      newBench[targetIndex] = movingTeam;
    }
    
    // Try to place replaced team in original position
    if (fromSection === 'starters') {
      newStarters[fromIndex] = replacedTeam;
    } else {
      newBench[fromIndex] = replacedTeam;
    }
    
    await saveLineupChanges(newStarters, newBench);
    setShowReplaceModal(null);
  };

  const saveLineupChanges = async (newStarters, newBench) => {
    try {
      setIsSaving(true);
      await onSave(newStarters, newBench);
      setStarters(newStarters);
      setBench(newBench);
      setHasChanges(false);
    } catch (error) {
      console.error("Error saving lineup:", error);
      // Revert changes on error - you might want to show an error message to user here
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = async () => {
    if (hasChanges && isEditable && !isSaving) {
      await saveLineupChanges(starters, bench);
    }
  };

  const TeamSlot = ({ team, section, index, size = 42 }) => {
    const [showActions, setShowActions] = useState(false);

    if (!team) {
      return (
        <div className="flex items-center justify-center py-6 border-2 border-dashed border-gray-400/50 rounded-xl min-h-[80px]">
          {isEditable ? (
            <Link
              to={`/${leagueId}/free-agents?returnWeek=${week}&section=${section}&index=${index}`}
              className="flex flex-col items-center gap-2 text-gray-400 hover:text-gray-300 transition-colors duration-200 no-underline"
            >
              <div className="w-8 h-8 bg-gray-600 hover:bg-gray-700 rounded-full flex items-center justify-center text-lg text-white transition-colors duration-200">
                +
              </div>
              <span className="font-semibold text-sm">Add Team</span>
            </Link>
          ) : (
            <div className="text-gray-500 text-sm">Empty Slot</div>
          )}
        </div>
      );
    }

    // Format game date/time
    const formatGameTime = (dateString) => {
      if (!dateString) return null;
      
      try {
        const date = new Date(dateString);
        const now = new Date();
        const isToday = date.toDateString() === now.toDateString();
        const isTomorrow = date.toDateString() === new Date(now.getTime() + 24 * 60 * 60 * 1000).toDateString();
        
        if (isToday) {
          return `Today ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
        } else if (isTomorrow) {
          return `Tomorrow ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
        } else {
          return date.toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric',
            hour: 'numeric', 
            minute: '2-digit' 
          });
        }
      } catch (e) {
        return dateString.slice(0, 10); // Fallback to date only
      }
    };

    const gameTime = formatGameTime(team.currentSeason?.nextGameDate);
    const opponent = team.currentSeason?.nextOpponent;
    const spread = team.currentSeason?.nextOpponentSpreadDisplay;
    const isHome = team.currentSeason?.nextGameIsHome;
    const record = team.currentSeason?.record || '0-0';
    const gamePoints = team.currentSeason?.gamePoints || 0;

    return (
      <div className="bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 overflow-hidden">
        {/* Main Team Info */}
        <div className="p-4">
          <div className="flex gap-3 items-start">
            {/* LEFT: Logo + Chevron (stacked) */}
            <div
              className="flex flex-col items-center gap-2"
              style={{ width: size, minWidth: size }} // keep column width aligned with logo
            >
              <TeamLogo teamName={team.school} size={size} clickable={true} />

              {isEditable && (
                <button
                  onClick={() => setShowActions(!showActions)}
                  className="p-2 hover:bg-white/10 rounded-lg transition-colors duration-200"
                  title="Team actions"
                  aria-expanded={showActions}
                  disabled={isSaving}
                >
                  {showActions ? (
                    <ChevronUp size={16} className="text-white/80" />
                  ) : (
                    <ChevronDown size={16} className="text-white/80" />
                  )}
                </button>
              )}
            </div>

            {/* MIDDLE: Team text + game info */}
            <div className="flex-1 min-w-0">
              <h4 className="text-base font-bold text-white truncate">
                {team.school}
              </h4>
              <div className="text-xs text-white/60 mb-3">{team.conference}</div>

              {/* Game info */}
              <div className="flex items-center gap-3">
                {opponent && (
                  <div className="bg-white/10 rounded-lg p-2 text-xs flex-1">
                    <div className="text-white">
                      {isHome ? 'vs' : '@'} {opponent}
                    </div>
                    {gameTime && <div className="text-white/70">{gameTime}</div>}
                    <div className="text-yellow-400 font-medium">
                      {spread ? `Spread: ${spread}` : 'Line not yet available'}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* RIGHT: Points */}
            <div className="text-right">
              <div className="text-green-400 font-bold text-sm mb-1">
                {gamePoints} Season
              </div>
              <div className="text-orange-400 font-bold text-sm mb-1">
                {(team.currentSeason?.weeklyPoints?.[`week${week}`] || 0)} Week
              </div>
              <div className="text-blue-400 font-bold text-sm">{record}</div>
            </div>
          </div>
        </div>
        
        {/* Expandable Actions Section */}
        {isEditable && showActions && (
          <div className="bg-white/5 border-t border-white/10 p-3">
            <div className="flex gap-2">
              <button
                onClick={() => {
                  handleTeamMove(team, section, index, section === 'starters' ? 'bench' : 'starters');
                  setShowActions(false);
                }}
                disabled={isSaving}
                className="flex-1 px-3 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-500 text-white text-xs rounded-lg transition-colors font-medium"
              >
                {isSaving ? '...' : (section === 'starters' ? '📋 To Bench' : '🚀 To Starters')}
              </button>
              <button
                onClick={() => {
                  handleTeamCut(team, section, index);
                  setShowActions(false);
                }}
                disabled={isSaving}
                className="px-3 py-2 bg-red-500 hover:bg-red-600 disabled:bg-gray-500 text-white text-xs rounded-lg transition-colors font-medium"
              >
                🗑️ Cut
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  // Confirmation Modal for Cutting Teams
  const ConfirmCutModal = () => {
    if (!showConfirmCut) return null;

    const { team } = showConfirmCut;
    const gamePoints = team.currentSeason?.gamePoints || 0;
    const record = team.currentSeason?.record || '0-0';

    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-white/95 backdrop-blur-lg rounded-2xl p-6 max-w-md w-full border border-white/20 shadow-2xl">
          <div className="text-center">
            <div className="text-4xl mb-4">⚠️</div>
            <h3 className="text-xl font-bold text-gray-900 mb-4">
              Cut {team.school}?
            </h3>
            <div className="text-gray-600 mb-4">
              <p>Are you sure you want to remove this team from your lineup?</p>
              <div className="bg-gray-100 rounded-lg p-3 mt-3">
                <div className="font-medium text-gray-800">{team.school}</div>
                <div className="text-sm text-gray-600">{team.conference}</div>
                <div className="text-sm text-gray-600 mt-1">
                  {gamePoints} Season Points • {record}
                </div>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirmCut(null)}
                className="flex-1 py-3 px-4 bg-gray-500 hover:bg-gray-600 text-white rounded-lg font-medium transition-colors duration-200"
              >
                Cancel
              </button>
              <button
                onClick={confirmCut}
                disabled={isSaving}
                className="flex-1 py-3 px-4 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors duration-200"
              >
                {isSaving ? 'Cutting...' : 'Cut Team'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Team Replacement Modal
  const ReplaceTeamModal = () => {
    if (!showReplaceModal) return null;

    const { movingTeam, toSection, targetTeams } = showReplaceModal;

    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-white/95 backdrop-blur-lg rounded-2xl p-6 max-w-lg w-full border border-white/20 shadow-2xl">
          <div>
            <h3 className="text-xl font-bold text-gray-900 mb-2 text-center">
              Choose Team to Replace
            </h3>
            <p className="text-gray-600 mb-6 text-center">
              {toSection === 'starters' ? 'Starters' : 'Bench'} is full. Which team should <span className="font-semibold text-gray-800">{movingTeam.school}</span> replace?
            </p>
            
            <div className="space-y-3 mb-6">
              {targetTeams.map((targetTeam, index) => {
                const actualIndex = (toSection === 'starters' ? starters : bench).findIndex(t => t?.school === targetTeam.school);
                const gamePoints = targetTeam.currentSeason?.gamePoints || 0;
                const record = targetTeam.currentSeason?.record || '0-0';
                const opponent = targetTeam.currentSeason?.nextOpponent;
                const spread = targetTeam.currentSeason?.nextOpponentSpreadDisplay;
                const isHome = targetTeam.currentSeason?.nextGameIsHome;
                
                return (
                  <button
                    key={targetTeam.school}
                    onClick={() => handleReplaceTeam(actualIndex)}
                    disabled={isSaving}
                    className="w-full p-4 bg-gray-50 hover:bg-gray-100 disabled:bg-gray-30 rounded-xl text-left transition-all duration-200 border border-gray-200 hover:border-gray-300 hover:shadow-md"
                  >
                    <div className="flex justify-between items-start">
                      {/* Left: Team Info */}
                      <div className="flex-1">
                        <div className="font-bold text-gray-900 text-lg mb-1">{targetTeam.school}</div>
                        <div className="text-sm text-gray-600 mb-2">{targetTeam.conference}</div>
                        
                        {/* Next Game Info */}
                        {opponent && (
                          <div className="bg-white rounded-lg p-2 text-xs border border-gray-200">
                            <div className="text-gray-700 font-medium">
                              {isHome ? 'vs' : '@'} {opponent}
                            </div>
                            {spread && (
                              <div className="text-orange-600 font-bold">
                                {spread}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      
                      {/* Right: Stats */}
                      <div className="text-right ml-4">
                        <div className="text-green-600 font-bold text-sm">
                          {gamePoints} pts
                        </div>
                        <div className="text-blue-600 font-semibold text-sm">
                          {record}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            
            <button
              onClick={() => setShowReplaceModal(null)}
              className="w-full py-3 px-4 bg-gray-600 hover:bg-gray-700 text-white rounded-xl font-medium transition-colors duration-200"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div>
      {!isEditable && (
        <div className="bg-yellow-500/20 border border-yellow-400/30 rounded-xl p-3 mb-4">
          <div className="flex items-center gap-2 text-yellow-200">
            <Lock size={16} />
            <span className="text-sm font-medium">
              This week's lineup is locked and cannot be edited
            </span>
          </div>
        </div>
      )}

      {/* Starters */}
      <div className="mb-6">
        <h4 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          🏈 Starters (5)
        </h4>
        <div className="space-y-3">
          {starters.map((team, index) => (
            <TeamSlot 
              key={`starter-${index}`}
              team={team} 
              section="starters" 
              index={index} 
            />
          ))}
        </div>
      </div>

      {/* Bench */}
      <div className="mb-6">
        <h4 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          🪑 Bench (2)
        </h4>
        <div className="space-y-3">
          {bench.map((team, index) => (
            <TeamSlot 
              key={`bench-${index}`}
              team={team} 
              section="bench" 
              index={index} 
            />
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

      {/* Modals */}
      <ConfirmCutModal />
      <ReplaceTeamModal />
    </div>
  );
};

export default WeeklyLineupManager;