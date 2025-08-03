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
  const [managerTeams, setManagerTeams] = useState([]);
  const [availableTeams, setAvailableTeams] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchTeams = async () => {
      const teamsSnap = await getDocs(collection(db, "teams"));
      const teams = teamsSnap.docs
        .map(doc => {
          const data = doc.data();
          if (data.classification?.toLowerCase() === "fbs" && data.school) {
            return { id: doc.id, school: data.school };
          }
          return null;
        })
        .filter(Boolean)
        .sort((a, b) => a.school.localeCompare(b.school));

      setAvailableTeams(teams);
    };

    fetchTeams();
  }, []);

  useEffect(() => {
    if (selectedManager && draftData.teams[selectedManager]) {
      setManagerTeams(draftData.teams[selectedManager]);
    } else {
      setManagerTeams([]);
    }
  }, [selectedManager, draftData]);

  const handleManagerSelect = (uid) => {
    setSelectedManager(uid);
    setSearchQuery("");
  };

  const handleAddTeam = (team) => {
    if (managerTeams.length >= 7) {
      alert("This manager already has 7 teams!");
      return;
    }

    const allDraftedTeams = Object.values(draftData.teams).flat();
    if (allDraftedTeams.includes(team.id)) {
      alert("This team has already been drafted by another manager!");
      return;
    }

    if (managerTeams.includes(team.id)) {
      alert("This team is already on this manager's roster!");
      return;
    }

    setManagerTeams([...managerTeams, team.id]);
    setSearchQuery("");
  };

  const handleRemoveTeam = (teamId) => {
    setManagerTeams(managerTeams.filter(id => id !== teamId));
  };

  const handleSaveManager = async () => {
    if (!selectedManager) {
      alert("Please select a manager first");
      return;
    }

    if (managerTeams.length !== 7) {
      alert("Each manager must have exactly 7 teams");
      return;
    }

    setSaving(true);

    try {
      const updatedTeams = {
        ...draftData.teams,
        [selectedManager]: managerTeams
      };

      const updatedCompleted = draftData.managersCompleted.includes(selectedManager)
        ? draftData.managersCompleted
        : [...draftData.managersCompleted, selectedManager];

      const allManagersComplete = updatedCompleted.length === Object.keys(userMap).length;

      const draftRef = doc(db, "leagues", leagueId, "meta", "draft");
      await updateDoc(draftRef, {
        teams: updatedTeams,
        managersCompleted: updatedCompleted,
        draftComplete: allManagersComplete,
        inProgress: !allManagersComplete
      });

      if (allManagersComplete) {
        const memberUpdates = Object.entries(updatedTeams).map(async ([uid, teams]) => {
          const starters = teams.slice(0, 5);
          const bench = teams.slice(5);

          const memberRef = doc(db, "leagues", leagueId, "members", uid);
          await updateDoc(memberRef, {
            "lineup.drafted": teams,
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
        alert(`✅ ${userMap[selectedManager]?.displayName}'s teams saved!`);
      }

      setSelectedManager("");
      setManagerTeams([]);

    } catch (err) {
      console.error("Error saving manager teams:", err);
      alert("Error saving teams. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const filteredTeams = availableTeams.filter(team =>
    team.school.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const allDraftedTeams = Object.values(draftData.teams).flat();
  const availableForDraft = filteredTeams.filter(team =>
    !allDraftedTeams.includes(team.id) &&
    !managerTeams.includes(team.id)
  );

  const completedManagers = draftData.managersCompleted.length;
  const totalManagers = Object.keys(userMap).length;

  return (
    <div>
      <h3>Manual Draft Entry</h3>
      <p>Progress: {completedManagers} of {totalManagers} managers completed</p>

      {/* Manager Selection */}
      <div style={{ marginBottom: "1.5rem" }}>
        <h4>Select Manager:</h4>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "0.5rem" }}>
          {Object.entries(userMap).map(([uid, user]) => (
            <button
              key={uid}
              onClick={() => handleManagerSelect(uid)}
              style={{
                padding: "0.75rem",
                backgroundColor: selectedManager === uid ? "#007bff" : 
                                draftData.managersCompleted.includes(uid) ? "#28a745" : "#f8f9fa",
                color: selectedManager === uid || draftData.managersCompleted.includes(uid) ? "white" : "black",
                border: "1px solid #ddd",
                borderRadius: "4px",
                cursor: "pointer"
              }}
            >
              {user.displayName} ({user.teamName})
              {draftData.managersCompleted.includes(uid) && " ✓"}
            </button>
          ))}
        </div>
      </div>

      {selectedManager && (
        <div>
          <h4>Teams for {userMap[selectedManager]?.displayName}:</h4>

          {/* Current Teams */}
          <div style={{ marginBottom: "1rem" }}>
            <h5>Current Teams ({managerTeams.length}/7):</h5>
            {managerTeams.length === 0 ? (
              <p style={{ color: "#666" }}>No teams selected yet</p>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                {managerTeams.map((teamId, index) => {
                  const teamLabel = availableTeams.find(t => t.id === teamId)?.school || teamId;
                  return (
                    <span
                      key={teamId}
                      style={{
                        padding: "0.25rem 0.5rem",
                        backgroundColor: index < 5 ? "#e3f2fd" : "#fff3e0",
                        border: "1px solid #ddd",
                        borderRadius: "4px",
                        fontSize: "0.9rem"
                      }}
                    >
                      {teamLabel} {index < 5 ? "(S)" : "(B)"}
                      <button
                        onClick={() => handleRemoveTeam(teamId)}
                        style={{
                          marginLeft: "0.5rem",
                          backgroundColor: "transparent",
                          border: "none",
                          color: "red",
                          cursor: "pointer"
                        }}
                      >
                        ×
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
            <p style={{ fontSize: "0.8rem", color: "#666" }}>
              (S) = Starter, (B) = Bench. First 5 teams are starters, last 2 are bench.
            </p>
          </div>

          {/* Team Search and Selection */}
          {managerTeams.length < 7 && (
            <div>
              <h5>Add Team:</h5>
              <input
                type="text"
                placeholder="Search for a team..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ 
                  width: "100%", 
                  padding: "0.5rem", 
                  marginBottom: "1rem",
                  border: "1px solid #ddd",
                  borderRadius: "4px"
                }}
              />
              <div style={{ 
                maxHeight: "200px", 
                overflowY: "auto", 
                border: "1px solid #ddd", 
                borderRadius: "4px",
                marginBottom: "1rem"
              }}>
                {availableForDraft.slice(0, 20).map(team => (
                  <div
                    key={team.id}
                    onClick={() => handleAddTeam(team)}
                    style={{
                      padding: "0.5rem",
                      cursor: "pointer",
                      borderBottom: "1px solid #eee",
                      backgroundColor: "white"
                    }}
                    onMouseEnter={(e) => e.target.style.backgroundColor = "#f0f0f0"}
                    onMouseLeave={(e) => e.target.style.backgroundColor = "white"}
                  >
                    {team.school}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Save Button */}
          <button
            onClick={handleSaveManager}
            disabled={managerTeams.length !== 7 || saving}
            style={{
              padding: "0.75rem 1.5rem",
              backgroundColor: managerTeams.length === 7 ? "#28a745" : "#6c757d",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: managerTeams.length === 7 ? "pointer" : "not-allowed",
              marginTop: "1rem"
            }}
          >
            {saving ? "Saving..." : `Save Teams for ${userMap[selectedManager]?.displayName}`}
          </button>
        </div>
      )}
    </div>
  );
}

export default ManualDraftEntry;
