// WeeklyLineupManager.js - Main component to replace the current lineup section
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { doc, getDoc, setDoc, updateDoc, collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase/firebase';
import { weeklyLineupUtils } from '../utils/weeklyLineupUtils';
import { ChevronLeft, ChevronRight, Lock, Clock, CheckCircle } from 'lucide-react';

const WeeklyLineupManager = ({ 
  leagueId, 
  userId, 
  allTeams, 
  currentWeek, 
  onTeamClick,
  TeamLogo 
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
      
      // Load existing weekly lineups
      const lineupsRef = doc(db, "leagues", leagueId, "weeklyLineups", userId);
      const lineupsSnap = await getDoc(lineupsRef);
      
      if (lineupsSnap.exists()) {
        setWeeklyLineups(lineupsSnap.data());
      } else {
        // Initialize with empty lineups
        const initialLineups = {};
        weeks.forEach(week => {
          initialLineups[`week${week}`] = {
            starters: Array(5).fill(null),
            bench: Array(2).fill(null),
            lockedAt: null
          };
        });
        
        await setDoc(lineupsRef, initialLineups);
        setWeeklyLineups(initialLineups);
      }
      
      // Calculate week statuses
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
    const weekKey = `week${week}`;
    const now = new Date();
    
    try {
      const updatedLineups = {
        ...weeklyLineups,
        [weekKey]: {
          starters: starters.map(team => team ? weeklyLineupUtils.normalizeTeamName(team) : null),
          bench: bench.map(team => team ? weeklyLineupUtils.normalizeTeamName(team) : null),
          lockedAt: weekStatuses[week]?.status === 'editable' ? null : now.toISOString()
        }
      };
      
      const lineupsRef = doc(db, "leagues", leagueId, "weeklyLineups", userId);
      await updateDoc(lineupsRef, { [weekKey]: updatedLineups[weekKey] });
      
      setWeeklyLineups(updatedLineups);
    } catch (error) {
      console.error("Error saving lineup:", error);
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
        />
      </div>
    </div>
  );
};

// WeeklyLineupContent - The actual lineup display/editor
const WeeklyLineupContent = ({ 
  week, 
  lineup, 
  allTeams, 
  isEditable, 
  onSave, 
  onTeamClick, 
  TeamLogo,
  leagueId 
}) => {
  const [starters, setStarters] = useState(Array(5).fill(null));
  const [bench, setBench] = useState(Array(2).fill(null));
  const [hasChanges, setHasChanges] = useState(false);

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

  const handleTeamMove = (team, fromSection, fromIndex, toSection, toIndex = null) => {
    if (!isEditable) return;
    
    const newStarters = [...starters];
    const newBench = [...bench];
    
    if (toIndex === null) {
      // Find empty slot
      if (toSection === 'starters') {
        toIndex = newStarters.findIndex(t => t === null);
        if (toIndex === -1) return; // No empty slots
      } else {
        toIndex = newBench.findIndex(t => t === null);
        if (toIndex === -1) return; // No empty slots
      }
    }
    
    // Remove from original position
    if (fromSection === 'starters') {
      newStarters[fromIndex] = null;
    } else {
      newBench[fromIndex] = null;
    }
    
    // Add to new position (swap if occupied)
    if (toSection === 'starters') {
      const displaced = newStarters[toIndex];
      newStarters[toIndex] = team;
      if (displaced && fromSection === 'starters') {
        newStarters[fromIndex] = displaced;
      } else if (displaced) {
        const emptyBenchIndex = newBench.findIndex(t => t === null);
        if (emptyBenchIndex !== -1) {
          newBench[emptyBenchIndex] = displaced;
        }
      }
    } else {
      const displaced = newBench[toIndex];
      newBench[toIndex] = team;
      if (displaced && fromSection === 'bench') {
        newBench[fromIndex] = displaced;
      } else if (displaced) {
        const emptyStarterIndex = newStarters.findIndex(t => t === null);
        if (emptyStarterIndex !== -1) {
          newStarters[emptyStarterIndex] = displaced;
        }
      }
    }
    
    setStarters(newStarters);
    setBench(newBench);
    setHasChanges(true);
  };

  const handleSave = () => {
    if (hasChanges && isEditable) {
      onSave(starters, bench);
      setHasChanges(false);
    }
  };

  const TeamSlot = ({ team, section, index, size = 42 }) => {
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

    return (
      <div className="bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 p-4">
        <div className="flex gap-3 items-center">
          <TeamLogo teamName={team.school} size={size} clickable={true} />
          <div className="flex-1 min-w-0">
            <h4 className="text-base font-bold text-white truncate">
              {team.school}
            </h4>
            <div className="text-xs text-white/60">{team.conference}</div>
            <div className="flex gap-2 mt-1">
              <span className="text-green-400 font-bold text-xs bg-green-400/20 px-2 py-1 rounded-full">
                {team.currentSeason?.gamePoints || 0} Pts
              </span>
            </div>
          </div>
          
          {isEditable && (
            <div className="flex flex-col gap-1">
              <button
                onClick={() => handleTeamMove(team, section, index, section === 'starters' ? 'bench' : 'starters')}
                className="px-2 py-1 bg-blue-500 hover:bg-blue-600 text-white text-xs rounded transition-colors"
                title={section === 'starters' ? 'Move to bench' : 'Move to starters'}
              >
                {section === 'starters' ? '📋' : '🚀'}
              </button>
              <button
                onClick={() => {
                  if (section === 'starters') {
                    const newStarters = [...starters];
                    newStarters[index] = null;
                    setStarters(newStarters);
                  } else {
                    const newBench = [...bench];
                    newBench[index] = null;
                    setBench(newBench);
                  }
                  setHasChanges(true);
                }}
                className="px-2 py-1 bg-red-500 hover:bg-red-600 text-white text-xs rounded transition-colors"
                title="Remove team"
              >
                ✂️
              </button>
            </div>
          )}
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
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
            >
              Save Lineup
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default WeeklyLineupManager;