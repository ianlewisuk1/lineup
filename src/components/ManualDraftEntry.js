// src/components/ManualDraftEntry.js
import React, { useState, useEffect } from "react";
import { db } from "../firebase/firebase";
import {
  doc,
  updateDoc,
  collection,
  getDocs
} from "firebase/firestore";

function ManualDraftEntry({ leagueId, userMap, draftData }) {
  const [selectedManager, setSelectedManager] = useState("");
  const [managerTeams, setManagerTeams] = useState({});
  const [availableTeams, setAvailableTeams] = useState([]);
  const [teamSearchQuery, setTeamSearchQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [allTeams, setAllTeams] = useState({});

  useEffect(() => {
    const fetchTeams = async () => {
      const teamsSnap = await getDocs(collection(db, "teams"));
      const teams = [];
      const teamDataMap = {};

      teamsSnap.docs.forEach(doc => {
        const data = doc.data();
        teamDataMap[doc.id] = data;
        
        if (data.classification?.toLowerCase() === "fbs" && data.school) {
          teams.push({ id: doc.id, school: data.school });
        }
      });

      setAllTeams(teamDataMap);
      setAvailableTeams(teams.sort((a, b) => a.school.localeCompare(b.school)));
    };

    fetchTeams();
  }, []);

  useEffect(() => {
    // Initialize manager teams from draft data
    const initialTeams = {};
    Object.entries(draftData.teams || {}).forEach(([uid, teams]) => {
      initialTeams[uid] = teams || [];
    });
    setManagerTeams(initialTeams);
  }, [draftData]);

  const addTeamToManager = (uid, teamId) => {
    const currentTeams = managerTeams[uid] || [];
    
    if (currentTeams.length >= 7) {
      alert("This manager already has 7 teams!");
      return;
    }

    if (isTeamAlreadyDrafted(teamId)) {
      alert("This team has already been drafted by another manager!");
      return;
    }

    if (currentTeams.includes(teamId)) {
      alert("This team is already on this manager's roster!");
      return;
    }

    setManagerTeams(prev => ({
      ...prev,
      [uid]: [...currentTeams, teamId]
    }));
    setTeamSearchQuery("");
  };

  const removeTeamFromManager = (uid, teamIndex) => {
    const currentTeams = managerTeams[uid] || [];
    const newTeams = currentTeams.filter((_, index) => index !== teamIndex);
    
    setManagerTeams(prev => ({
      ...prev,
      [uid]: newTeams
    }));
  };

  const isTeamAlreadyDrafted = (teamId) => {
    return Object.values(managerTeams).flat().includes(teamId);
  };

  const getFilteredTeams = () => {
    if (!teamSearchQuery) return [];
    
    return availableTeams.filter(team => {
      const matchesSearch = team.school.toLowerCase().includes(teamSearchQuery.toLowerCase());
      const notAlreadyDrafted = !isTeamAlreadyDrafted(team.id);
      const notOnCurrentManager = !(managerTeams[selectedManager] || []).includes(team.id);
      
      return matchesSearch && notAlreadyDrafted && notOnCurrentManager;
    });
  };

  const saveManagerTeams = async (uid) => {
    if (!uid) {
      alert("Please select a manager first");
      return;
    }

    const teams = managerTeams[uid] || [];
    if (teams.length !== 7) {
      alert("Each manager must have exactly 7 teams");
      return;
    }

    setSaving(true);

    try {
      const updatedTeams = {
        ...draftData.teams,
        [uid]: teams
      };

      const updatedCompleted = draftData.managersCompleted?.includes(uid)
        ? draftData.managersCompleted
        : [...(draftData.managersCompleted || []), uid];

      const allManagersComplete = updatedCompleted.length === Object.keys(userMap).length;

      const draftRef = doc(db, "leagues", leagueId, "meta", "draft");
      await updateDoc(draftRef, {
        teams: updatedTeams,
        managersCompleted: updatedCompleted,
        draftComplete: allManagersComplete,
        inProgress: !allManagersComplete
      });

      if (allManagersComplete) {
        const memberUpdates = Object.entries(updatedTeams).map(async ([managerId, teamsList]) => {
          const starters = teamsList.slice(0, 5);
          const bench = teamsList.slice(5);

          const memberRef = doc(db, "leagues", leagueId, "members", managerId);
          await updateDoc(memberRef, {
            "lineup.drafted": teamsList,
            "lineup.starters": starters,
            "lineup.bench": bench
          });
        });

        await Promise.all(memberUpdates);

        await updateDoc(doc(db, "leagues", leagueId), {
          draftComplete: true
        });

        alert("✅ Draft completed! All lineups have been updated.");
      } else {
        alert(`✅ ${userMap[uid]?.displayName}'s teams saved!`);
      }

      setSelectedManager("");

    } catch (err) {
      console.error("Error saving manager teams:", err);
      alert("Error saving teams. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Instructions Card */}
      <div className="bg-blue-500/20 border border-blue-400/30 rounded-xl p-4">
        <div className="flex items-start space-x-3">
          <div className="text-2xl">💡</div>
          <div>
            <h4 className="text-blue-200 font-semibold mb-2">Instructions</h4>
            <p className="text-blue-200 text-sm leading-relaxed">
              Select each manager below and enter their 7 drafted teams in order. 
              The first 5 will be starters, the last 2 will be bench players.
            </p>
          </div>
        </div>
      </div>

      {/* Progress Indicator */}
      <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-white font-semibold">Manual Draft Entry</h4>
          <span className="text-white/70 text-sm">
            Progress: {(draftData.managersCompleted || []).length} of {Object.keys(userMap).length} managers completed
          </span>
        </div>
        
        {/* Progress Bar */}
        <div className="bg-white/20 rounded-full h-2 w-full">
          <div 
            className="bg-gradient-to-r from-green-500 to-emerald-500 h-2 rounded-full transition-all duration-500 ease-out"
            style={{ 
              width: `${((draftData.managersCompleted || []).length / Object.keys(userMap).length) * 100}%` 
            }}
          ></div>
        </div>
      </div>

      {/* Manager Selection */}
      <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 border border-white/20">
        <h4 className="text-white font-semibold text-lg mb-4">Select Manager:</h4>
        
        <div className="grid gap-3">
          {Object.entries(userMap).map(([uid, userData]) => {
            const isCompleted = (draftData.managersCompleted || []).includes(uid);
            const isSelected = selectedManager === uid;
            
            return (
              <button
                key={uid}
                onClick={() => setSelectedManager(uid)}
                className={`
                  p-4 rounded-xl border-2 text-left transition-all duration-300 transform hover:scale-[1.02]
                  ${isSelected 
                    ? 'border-blue-400 bg-blue-500/30 shadow-lg shadow-blue-500/20' 
                    : isCompleted
                    ? 'border-green-400/50 bg-green-500/20'
                    : 'border-white/30 bg-white/10 hover:border-white/50 hover:bg-white/15'
                  }
                `}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-white font-semibold">
                      {userData.displayName}
                    </div>
                    <div className="text-white/70 text-sm">
                      {userData.teamName}
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    {isCompleted && (
                      <span className="text-green-400 text-xl">✅</span>
                    )}
                    {isSelected && (
                      <span className="text-blue-400 text-xl">👈</span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Team Entry Section - Only show when manager is selected */}
      {selectedManager && (
        <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 border border-white/20">
          <div className="flex items-center justify-between mb-6">
            <h4 className="text-white font-semibold text-lg">
              Teams for {userMap[selectedManager]?.displayName}:
            </h4>
            <div className="text-white/70 text-sm">
              Current Teams ({(managerTeams[selectedManager] || []).length}/7):
            </div>
          </div>

          {/* Team Reminder */}
          <div className="bg-amber-500/20 border border-amber-400/30 rounded-lg p-3 mb-4">
            <p className="text-amber-200 text-sm">
              💡 <strong>Reminder:</strong> First 5 teams are starters, last 2 are bench.
            </p>
          </div>

          {/* Current Teams Display */}
          {(managerTeams[selectedManager] || []).length > 0 && (
            <div className="mb-6">
              <h5 className="text-white/90 font-medium mb-3">Current Teams:</h5>
              <div className="space-y-2">
                {(managerTeams[selectedManager] || []).map((teamId, index) => {
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
                      <div className="flex items-center justify-between w-full">
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
                      <button
                        onClick={() => removeTeamFromManager(selectedManager, index)}
                        className="text-red-400 hover:text-red-300 transition-colors p-1"
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Add Team Section */}
          <div className="space-y-4">
            <h5 className="text-white/90 font-medium">Add Team:</h5>
            
            {/* Team Search/Select */}
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
                  const isAlreadyDrafted = isTeamAlreadyDrafted(team.id);
                  
                  return (
                    <button
                      key={team.id}
                      onClick={() => !isAlreadyDrafted && addTeamToManager(selectedManager, team.id)}
                      disabled={isAlreadyDrafted}
                      className={`
                        w-full p-3 text-left border-b border-white/10 last:border-b-0 transition-all
                        ${isAlreadyDrafted 
                          ? 'text-white/40 cursor-not-allowed' 
                          : 'text-white hover:bg-white/10 hover:text-blue-300'
                        }
                      `}
                    >
                      <div className="flex items-center justify-between">
                        <span>{team.school}</span>
                        {isAlreadyDrafted && (
                          <span className="text-red-400 text-sm">Already drafted</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Save Button */}
            <button
              onClick={() => saveManagerTeams(selectedManager)}
              disabled={(managerTeams[selectedManager] || []).length !== 7 || saving}
              className={`
                w-full p-4 rounded-xl font-semibold transition-all duration-300 transform hover:scale-[1.02]
                ${(managerTeams[selectedManager] || []).length === 7 && !saving
                  ? 'bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white shadow-lg hover:shadow-green-500/40'
                  : 'bg-white/20 text-white/50 cursor-not-allowed'
                }
              `}
            >
              {saving ? (
                <div className="flex items-center justify-center space-x-2">
                  <div className="animate-spin w-4 h-4 border-2 border-white/30 border-t-white rounded-full"></div>
                  <span>Saving...</span>
                </div>
              ) : (managerTeams[selectedManager] || []).length === 7 ? (
                `💾 Save Teams for ${userMap[selectedManager]?.displayName}` 
              ) : (
                `Need ${7 - (managerTeams[selectedManager] || []).length} more teams`
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default ManualDraftEntry;