// src/components/ManualDraftEntry.js
import React, { useState, useEffect } from "react";
import { supabase } from "../supabase/supabase";

function ManualDraftEntry({ leagueId, userMap, userFirstNames, draftData, onConfirmPick }) {
  const [selectedManager, setSelectedManager] = useState("");
  const [selectedTeam, setSelectedTeam] = useState("");
  const [availableTeams, setAvailableTeams] = useState([]);
  const [teamSearchQuery, setTeamSearchQuery] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [allTeams, setAllTeams] = useState({});

  // Helper function to get proper display name
  const getManagerDisplayName = (userId) => {
    // Try firstName first
    const firstName = userFirstNames?.[userId];
    if (firstName && firstName !== 'Unknown') {
      return firstName;
    }
    
    // Fallback to userMap data
    const memberData = userMap?.[userId];
    if (memberData) {
      return memberData.displayName || memberData.teamName || `Manager ${userId.slice(0, 8)}`;
    }
    
    // Last resort
    return `Manager ${userId.slice(0, 8)}`;
  };

  useEffect(() => {
    const fetchTeams = async () => {
      const { data: teamsData } = await supabase.from("teams").select("*");
      const teams = [];
      const teamDataMap = {};

      (teamsData || []).forEach(data => {
        teamDataMap[data.id] = data;

        if (data.classification?.toLowerCase() === "fbs" && data.school) {
          teams.push({ id: data.id, school: data.school });
        }
      });

      setAllTeams(teamDataMap);
      setAvailableTeams(teams.sort((a, b) => a.school.localeCompare(b.school)));
    };

    fetchTeams();
  }, []);

  // Get teams already picked by any manager
  const getAllPickedTeams = () => {
    const pickedTeams = new Set();
    if (draftData?.selected_teams) {
      Object.values(draftData.selected_teams).forEach(managerTeams => {
        managerTeams.forEach(teamId => pickedTeams.add(teamId));
      });
    }
    return pickedTeams;
  };

  // Get teams for a specific manager
  const getManagerTeams = (managerId) => {
    return draftData?.selected_teams?.[managerId] || [];
  };

  // Check if manager has completed their draft (7 teams)
  const isManagerComplete = (managerId) => {
    const managerTeams = getManagerTeams(managerId);
    return managerTeams.length >= 7;
  };

  // Get filtered teams for search
  const getFilteredTeams = () => {
    if (!teamSearchQuery) return [];
    
    const pickedTeams = getAllPickedTeams();
    
    return availableTeams.filter(team => {
      const matchesSearch = team.school.toLowerCase().includes(teamSearchQuery.toLowerCase());
      const notAlreadyPicked = !pickedTeams.has(team.id);
      
      return matchesSearch && notAlreadyPicked;
    });
  };

  // Handle confirming a single pick
  const handleConfirmSinglePick = async () => {
    if (!selectedManager || !selectedTeam) {
      alert("Please select both a manager and a team.");
      return;
    }

    const managerTeams = getManagerTeams(selectedManager);
    
    // Check if manager already has 7 teams
    if (managerTeams.length >= 7) {
      alert("This manager already has 7 teams!");
      return;
    }

    // Check if team is still available
    const pickedTeams = getAllPickedTeams();
    if (pickedTeams.has(selectedTeam)) {
      alert("This team has already been picked by another manager.");
      return;
    }

    const pickNumber = managerTeams.length + 1;

    setConfirming(true);

    try {
      // Call the parent function to update Firestore
      await onConfirmPick(selectedManager, selectedTeam, pickNumber);
      
      // Reset form
      setSelectedTeam("");
      setTeamSearchQuery("");
      
      // Auto-advance to next manager if current one is complete after this pick
      if (pickNumber >= 7) {
        // Find next incomplete manager
        const incompleteManagers = Object.keys(userMap).filter(uid => 
          !isManagerComplete(uid) && uid !== selectedManager
        );
        if (incompleteManagers.length > 0) {
          setSelectedManager(incompleteManagers[0]);
        } else {
          setSelectedManager("");
        }
      }
      
    } catch (error) {
      console.error("Error confirming pick:", error);
      alert("Failed to confirm pick. Please try again.");
    } finally {
      setConfirming(false);
    }
  };

  // Handle manager selection change
  const handleManagerChange = (managerId) => {
    setSelectedManager(managerId);
    setSelectedTeam("");
    setTeamSearchQuery("");
  };

  const managerTeams = selectedManager ? getManagerTeams(selectedManager) : [];
  const isCurrentManagerComplete = selectedManager ? isManagerComplete(selectedManager) : false;
  const nextPickNumber = managerTeams.length + 1;

  return (
    <div className="space-y-6">
      {/* Instructions Card */}
      <div className="bg-blue-500/20 border border-blue-400/30 rounded-xl p-4">
        <div className="flex items-start space-x-3">
          <div className="text-2xl">💡</div>
          <div>
            <h4 className="text-blue-200 font-semibold mb-2">Instructions</h4>
            <p className="text-blue-200 text-sm leading-relaxed">
              Select a manager, choose their next team, and confirm the pick. 
              The first 5 picks will be starters, the last 2 will be bench players.
            </p>
          </div>
        </div>
      </div>

      {/* Progress Indicator */}
      <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-white font-semibold">Manual Draft Entry</h4>
          <span className="text-white/70 text-sm">
            Progress: {(draftData.managers_completed || []).length} of {Object.keys(userMap).length} managers completed
          </span>
        </div>
        
        {/* Progress Bar */}
        <div className="bg-white/20 rounded-full h-2 w-full">
          <div 
            className="bg-gradient-to-r from-green-500 to-emerald-500 h-2 rounded-full transition-all duration-500 ease-out"
            style={{ 
              width: `${((draftData.managers_completed || []).length / Object.keys(userMap).length) * 100}%` 
            }}
          ></div>
        </div>
      </div>

      {/* Manager Selection */}
      <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 border border-white/20">
        <h4 className="text-white font-semibold text-lg mb-4">Select Manager:</h4>
        
        <div className="grid gap-3">
          {Object.entries(userMap).map(([uid, userData]) => {
            const managerTeamCount = getManagerTeams(uid).length;
            const isCompleted = managerTeamCount >= 7;
            const isSelected = selectedManager === uid;
            const displayName = getManagerDisplayName(uid);
            
            return (
              <button
                key={uid}
                onClick={() => handleManagerChange(uid)}
                disabled={isCompleted}
                className={`
                  p-4 rounded-xl border-2 text-left transition-all duration-300 transform hover:scale-[1.02]
                  ${isSelected 
                    ? 'border-blue-400 bg-blue-500/30 shadow-lg shadow-blue-500/20' 
                    : isCompleted
                    ? 'border-green-400/50 bg-green-500/20 opacity-60 cursor-not-allowed'
                    : 'border-white/30 bg-white/10 hover:border-white/50 hover:bg-white/15'
                  }
                `}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-white font-semibold">
                      {displayName}
                    </div>
                    <div className="text-white/70 text-sm">
                      {userData.teamName} • {managerTeamCount}/7 teams
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    {isCompleted && (
                      <span className="text-green-400 text-xl">✅</span>
                    )}
                    {isSelected && !isCompleted && (
                      <span className="text-blue-400 text-xl">👈</span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Current Manager's Teams Display */}
      {selectedManager && (
        <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 border border-white/20">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-white font-semibold text-lg">
              {getManagerDisplayName(selectedManager)}'s Teams
            </h4>
            <span className="text-white/70 text-sm">
              {managerTeams.length}/7 teams
            </span>
          </div>

          {/* Current Teams List */}
          {managerTeams.length > 0 ? (
            <div className="space-y-2 mb-6">
              {managerTeams.map((teamId, index) => {
                const teamData = allTeams[teamId];
                const teamName = teamData?.school || teamId;
                const isStarter = index < 5;
                
                return (
                  <div
                    key={index}
                    className={`
                      flex items-center justify-between p-3 rounded-lg border
                      ${isStarter 
                        ? 'bg-green-500/20 border-green-400/30' 
                        : 'bg-blue-500/20 border-blue-400/30'
                      }
                    `}
                  >
                    <div className="flex items-center space-x-3">
                      <span className={`
                        w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold
                        ${isStarter ? 'bg-green-500 text-white' : 'bg-blue-500 text-white'}
                      `}>
                        {index + 1}
                      </span>
                      <span className="text-white font-medium">{teamName}</span>
                    </div>
                    <span className={`
                      px-2 py-1 rounded-full text-xs font-medium
                      ${isStarter 
                        ? 'bg-green-500/30 text-green-200' 
                        : 'bg-blue-500/30 text-blue-200'
                      }
                    `}>
                      {isStarter ? 'Starter' : 'Bench'}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-6 text-white/60">
              No teams drafted yet
            </div>
          )}

          {/* Next Pick Section */}
          {!isCurrentManagerComplete && (
            <>
              <div className="bg-amber-500/20 border border-amber-400/30 rounded-lg p-3 mb-4">
                <p className="text-amber-200 text-sm font-medium">
                  📋 Next Pick: #{nextPickNumber} ({nextPickNumber <= 5 ? 'Starter' : 'Bench'})
                </p>
              </div>

              {/* Team Search */}
              <div className="space-y-4">
                <h5 className="text-white/90 font-medium">Select Team for Pick #{nextPickNumber}:</h5>
                
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search for a team..."
                    value={teamSearchQuery}
                    onChange={(e) => setTeamSearchQuery(e.target.value)}
                    className="w-full p-4 bg-white/10 border border-white/30 rounded-xl text-white placeholder-white/50 focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20 focus:outline-none transition-all"
                  />
                </div>

                {/* Filtered Team Results */}
                {teamSearchQuery && (
                  <div className="max-h-48 overflow-y-auto bg-white/5 border border-white/20 rounded-xl">
                    {getFilteredTeams().slice(0, 10).map((team) => {
                      const isSelected = selectedTeam === team.id;
                      
                      return (
                        <button
                          key={team.id}
                          onClick={() => setSelectedTeam(team.id)}
                          className={`
                            w-full p-3 text-left border-b border-white/10 last:border-b-0 transition-all
                            ${isSelected 
                              ? 'bg-blue-500/30 text-blue-200 border-blue-400' 
                              : 'text-white hover:bg-white/10 hover:text-blue-300'
                            }
                          `}
                        >
                          <div className="flex items-center justify-between">
                            <span>{team.school}</span>
                            {isSelected && (
                              <span className="text-blue-400 text-sm">✓ Selected</span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Selected Team Display */}
                {selectedTeam && (
                  <div className="bg-blue-500/20 border border-blue-400/30 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-blue-200 text-sm font-medium">Selected Team:</span>
                        <div className="text-white font-semibold">
                          {allTeams[selectedTeam]?.school || selectedTeam}
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          setSelectedTeam("");
                          setTeamSearchQuery("");
                        }}
                        className="text-red-400 hover:text-red-300 transition-colors p-1"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                )}

                {/* Confirm Pick Button */}
                <button
                  onClick={handleConfirmSinglePick}
                  disabled={!selectedTeam || confirming}
                  className={`
                    w-full p-4 rounded-xl font-semibold transition-all duration-300 transform hover:scale-[1.02]
                    ${selectedTeam && !confirming
                      ? 'bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white shadow-lg hover:shadow-green-500/40'
                      : 'bg-white/20 text-white/50 cursor-not-allowed'
                    }
                  `}
                >
                  {confirming ? (
                    <div className="flex items-center justify-center space-x-2">
                      <div className="animate-spin w-4 h-4 border-2 border-white/30 border-t-white rounded-full"></div>
                      <span>Confirming Pick...</span>
                    </div>
                  ) : selectedTeam ? (
                    `✅ Confirm Pick #${nextPickNumber}: ${allTeams[selectedTeam]?.school}`
                  ) : (
                    "🔍 Search and select a team above"
                  )}
                </button>
              </div>
            </>
          )}

          {/* Manager Complete Message */}
          {isCurrentManagerComplete && (
            <div className="bg-green-500/20 border border-green-400/30 rounded-lg p-4 text-center">
              <div className="text-green-400 text-3xl mb-2">🎉</div>
              <h5 className="text-green-200 font-semibold text-lg mb-1">
                Draft Complete!
              </h5>
              <p className="text-green-200/80 text-sm">
                {getManagerDisplayName(selectedManager)} has all 7 teams
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default ManualDraftEntry;