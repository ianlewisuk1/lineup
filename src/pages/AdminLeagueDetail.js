// AdminLeagueDetail.js
import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  doc,
  getDoc,
  collection,
  getDocs,
  updateDoc,
  deleteDoc,
  arrayRemove,
  arrayUnion,
  setDoc,
  serverTimestamp
} from "firebase/firestore";
import { db } from "../firebase/firebase";

function AdminLeagueDetail() {
  const { leagueId } = useParams();
  const [league, setLeague] = useState(null);
  const [members, setMembers] = useState([]);
  const [draftMeta, setDraftMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshFlag, setRefreshFlag] = useState(false);
  const [currentWeek, setCurrentWeek] = useState("Preseason");
  const [newWeekValue, setNewWeekValue] = useState("");

  useEffect(() => {
    const fetchLeagueAndMembers = async () => {
      try {
        const leagueDoc = await getDoc(doc(db, "leagues", leagueId));
        if (!leagueDoc.exists()) {
          setLeague(null);
          return;
        }

        const leagueData = { id: leagueDoc.id, ...leagueDoc.data() };
        setLeague(leagueData);

        const membersSnap = await getDocs(collection(db, "leagues", leagueId, "members"));
        const membersList = membersSnap.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setMembers(membersList);

        const draftDoc = await getDoc(doc(db, "leagues", leagueId, "meta", "draft"));
        if (draftDoc.exists()) {
          setDraftMeta(draftDoc.data());
        } else {
          setDraftMeta(null);
        }

        // Fetch current week from global config
        const configDoc = await getDoc(doc(db, "config", "season"));
        if (configDoc.exists()) {
          const globalCurrentWeek = configDoc.data().currentWeek || "Preseason";
          setCurrentWeek(globalCurrentWeek);
          setNewWeekValue(globalCurrentWeek);
        }

      } catch (err) {
        console.error("Error fetching league detail:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchLeagueAndMembers();
  }, [leagueId, refreshFlag]);

  const refresh = () => setRefreshFlag(f => !f);

  const handleUpdateCurrentWeek = async () => {
    if (!newWeekValue.trim()) {
      alert("Please enter a week value.");
      return;
    }

    if (!window.confirm(`Update global current week to "${newWeekValue}"? This will affect ALL leagues.`)) {
      return;
    }

    try {
      // Update global config
      await updateDoc(doc(db, "config", "season"), {
        currentWeek: newWeekValue.trim(),
        lastUpdated: new Date()
      });

      setCurrentWeek(newWeekValue.trim());
      alert(`✅ Current week updated to "${newWeekValue.trim()}"`);
    } catch (err) {
      console.error("Error updating current week:", err);
      alert("Failed to update current week: " + err.message);
    }
  };

  const weekOptions = [
    "Preseason",
    "Week 1", "Week 2", "Week 3", "Week 4", "Week 5", "Week 6",
    "Week 7", "Week 8", "Week 9", "Week 10", "Week 11", "Week 12",
    "Week 13", "Week 14", "Week 15", "Week 16", "Week 17",
    "Conference Championships",
    "CFP Playoffs",
    "National Championship",
    "Offseason"
  ];

  // Helper function to get current picker using snake draft logic (matches DraftRoom.js)
  const getCurrentPicker = (draftOrder, currentPickIndex) => {
    if (!draftOrder || draftOrder.length === 0) return null;
    
    const totalManagers = draftOrder.length;
    const currentRound = Math.floor(currentPickIndex / totalManagers);
    const positionInRound = currentPickIndex % totalManagers;
    
    // For even rounds (0, 2, 4, 6): use normal order
    // For odd rounds (1, 3, 5): use reverse order
    if (currentRound % 2 === 0) {
      return draftOrder[positionInRound];
    } else {
      return draftOrder[totalManagers - 1 - positionInRound];
    }
  };

  const handleKick = async (userId) => {
    if (!window.confirm("Kick this user from the league? This cannot be undone.")) return;
    try {
      await deleteDoc(doc(db, "leagues", leagueId, "members", userId));
      await updateDoc(doc(db, "leagues", leagueId), {
        members: arrayRemove(userId)
      });
      refresh();
    } catch (err) {
      console.error("Error kicking user:", err);
    }
  };

  const handlePromote = async (userId) => {
    if (!window.confirm("Promote this user to league admin?")) return;
    try {
      await updateDoc(doc(db, "leagues", leagueId), {
        admin: userId
      });
      refresh();
    } catch (err) {
      console.error("Error promoting user:", err);
    }
  };

  const handleSimulateDraft = async () => {
    try {
      const teamsSnap = await getDocs(collection(db, "teams"));
      const allTeams = teamsSnap.docs
        .map(doc => doc.data())
        .filter(team => team.classification?.toLowerCase() === "fbs" && typeof team.school === "string")

      const shuffledTeams = allTeams.map(t => t.school).sort(() => 0.5 - Math.random());

      const draftOrder = members.map(m => m.id);
      const selectedTeams = {};
      const memberUpdates = [];

      draftOrder.forEach((uid, idx) => {
        const picks = shuffledTeams.slice(idx * 7, idx * 7 + 7);
        selectedTeams[uid] = picks;

        const memberRef = doc(db, "leagues", leagueId, "members", uid);
        memberUpdates.push(
          setDoc(memberRef, {
            lineup: {
              drafted: picks,
              starters: picks.slice(0, 5),
              bench: picks.slice(5)
            },
            freeAgentMoves: 0,  // Initialize free agent moves
            points: 0,         // Initialize points
            weeklyPoints: 0,   // Initialize weekly points
            smackTalk: ""      // Initialize smack talk
          }, { merge: true })
        );
      });

      await setDoc(doc(db, "leagues", leagueId, "meta", "draft"), {
        draftOrder,
        currentPickIndex: draftOrder.length * 7,
        availableTeams: [],
        selectedTeams,
        draftComplete: true
      });

      await updateDoc(doc(db, "leagues", leagueId), {
        draftComplete: true
      });

      await Promise.all(memberUpdates);
      alert("✅ Draft simulated.");
      refresh();
    } catch (err) {
      console.error("Error simulating draft:", err);
      alert("Error: " + err.message);
    }
  };

  const handleSimulateAllButFinalPick = async () => {
    if (!window.confirm("This will simulate the entire draft except for the final pick using snake draft order and smart team selection. Continue?")) return;

    try {
      // Get all FBS teams with their rankings
      const teamsSnap = await getDocs(collection(db, "teams"));
      const allTeams = teamsSnap.docs
        .map(doc => doc.data())
        .filter(team => team.classification?.toLowerCase() === "fbs" && typeof team.school === "string");

      if (allTeams.length === 0) {
        alert("⚠️ No valid FBS teams found. Check your /teams collection in Firestore.");
        return;
      }

      // Create team rankings map (matches DraftRoom.js logic)
      const teamRankings = {};
      allTeams.forEach(team => {
        if (team.school && team.philMetricDraftRank !== undefined) {
          teamRankings[team.school] = team.philMetricDraftRank;
        }
      });

      const teamNames = allTeams.map(team => team.school);
      const draftOrder = members.map(m => m.id);
      const totalPicks = draftOrder.length * 7;
      const finalPickIndex = totalPicks - 1; // Stop before the final pick

      let availableTeams = [...teamNames];
      const selectedTeams = {};
      
      // Initialize empty arrays for each manager
      draftOrder.forEach(uid => {
        selectedTeams[uid] = [];
      });

      // Simulate picks using snake draft order and smart selection
      for (let pickIndex = 0; pickIndex < finalPickIndex; pickIndex++) {
        const currentUid = getCurrentPicker(draftOrder, pickIndex);
        
        if (!currentUid || availableTeams.length === 0) {
          console.error(`Simulation failed at pick ${pickIndex}: no current UID or no available teams`);
          break;
        }

        // Smart team selection (matches DraftRoom.js auto-pick logic)
        const availableTeamsWithRanks = availableTeams
          .map(teamName => ({
            name: teamName,
            rank: teamRankings[teamName] || 999 // Default high rank if not found
          }))
          .sort((a, b) => a.rank - b.rank); // Sort ascending (lower rank = better)

        // Pick the best available team
        const bestTeam = availableTeamsWithRanks[0];
        const pickedTeam = bestTeam.name;

        // Add to selected teams
        selectedTeams[currentUid].push(pickedTeam);
        
        // Remove from available teams
        availableTeams = availableTeams.filter(t => t !== pickedTeam);

        console.log(`Pick ${pickIndex + 1}: ${pickedTeam} (rank: ${bestTeam.rank}) → ${members.find(m => m.id === currentUid)?.displayName}`);
      }

      // Update member lineups for completed picks
      const memberUpdates = [];
      Object.entries(selectedTeams).forEach(([uid, teams]) => {
        if (teams.length > 0) {
          const memberRef = doc(db, "leagues", leagueId, "members", uid);
          memberUpdates.push(
            updateDoc(memberRef, {
              "lineup.drafted": teams,
              freeAgentMoves: 0,  // Initialize free agent moves
              smackTalk: ""       // Initialize smack talk
              // Don't set starters/bench yet since draft isn't complete
            })
          );
        }
      });

      // Create draft metadata (matches DraftRoom.js format)
      await setDoc(doc(db, "leagues", leagueId, "meta", "draft"), {
        draftOrder,
        currentPickIndex: finalPickIndex, // One pick before completion
        availableTeams,
        selectedTeams,
        draftComplete: false,
        currentPickStartTime: serverTimestamp() // Set timer for final pick
      });

      // Update all member lineups
      await Promise.all(memberUpdates);

      const finalPicker = getCurrentPicker(draftOrder, finalPickIndex);
      const finalPickerName = members.find(m => m.id === finalPicker)?.displayName || "Unknown";
      
      alert(`✅ Draft simulated up to final pick!\n\nFinal pick belongs to: ${finalPickerName}\nRemaining teams: ${availableTeams.length}`);
      refresh();

    } catch (err) {
      console.error("Error simulating draft:", err);
      alert("Error: " + err.message);
    }
  };

  const handleResetDraft = async () => {
    if (!window.confirm("This will delete all draft data and clear every lineup. Continue?")) return;

    try {
      await deleteDoc(doc(db, "leagues", leagueId, "meta", "draft"));

      await updateDoc(doc(db, "leagues", leagueId), {
        draftComplete: false
      });

      const membersSnap = await getDocs(collection(db, "leagues", leagueId, "members"));
      const clears = membersSnap.docs.map(docSnap =>
        updateDoc(docSnap.ref, {
          "lineup.drafted": [],
          "lineup.starters": [],
          "lineup.bench": [],
          freeAgentMoves: 0,  // Reset free agent moves
          points: 0,         // Reset points
          weeklyPoints: 0,   // Reset weekly points
          smackTalk: ""      // Reset smack talk
        })
      );

      await Promise.all(clears);

      alert("✅ Draft reset successfully.");
      refresh();
    } catch (err) {
      console.error("Error resetting draft:", err);
      alert("Failed to reset draft: " + err.message);
    }
  };

  const handleSeedRemainingUsers = async () => {
    if (!league) return;

    const needed = league.maxManagers - members.length;
    if (needed <= 0) {
      alert("League is already full.");
      return;
    }

    try {
      const usersSnap = await getDocs(collection(db, "users"));
      const currentIds = new Set(members.map(m => m.id));
      const available = usersSnap.docs.filter(doc => !currentIds.has(doc.id));

      if (available.length < needed) {
        alert("Not enough users to fill the league.");
        return;
      }

      const selected = available.sort(() => 0.5 - Math.random()).slice(0, needed);

      const batchAdds = selected.map(async (docSnap) => {
        const data = docSnap.data();
        const uidSuffix = docSnap.id.slice(-4);

        const displayName =
          data.displayName?.trim() ||
          (data.email?.split("@")[0]?.replace(/\W/g, "") || `User${uidSuffix}`);

        const teamName =
          data.teamName?.trim() ||
          `Team ${uidSuffix}`;

        const memberRef = doc(db, "leagues", leagueId, "members", docSnap.id);
        await setDoc(memberRef, {
          displayName,
          email: data.email || "",
          teamName,
          lineup: {
            drafted: [],
            starters: [],
            bench: []
          },
          freeAgentMoves: 0,   // Initialize free agent moves
          points: 0,          // Initialize points
          weeklyPoints: 0,    // Initialize weekly points
          smackTalk: "",      // Initialize smack talk
          joinedAt: new Date()
        });

        await updateDoc(doc(db, "leagues", leagueId), {
          members: arrayUnion(docSnap.id)
        });
      });

      await Promise.all(batchAdds);
      alert(`Added ${needed} user(s) to the league.`);
      refresh();

    } catch (err) {
      console.error("Error seeding users:", err);
      alert("Failed to add users: " + err.message);
    }
  };

  const formatList = (arr) => {
    if (!Array.isArray(arr) || arr.length === 0) return "-";
    return arr.join(", ");
  };

  const draftStatus = () => {
    if (!draftMeta) return <span style={{ color: "gray" }}>Not started</span>;
    if (draftMeta.draftComplete) return <span style={{ color: "green" }}>✅ Complete</span>;
    return <span style={{ color: "orange" }}>🕐 In Progress</span>;
  };

  const formatDraftType = () => {
    if (league.draftType === "live") {
      return `Live Draft`;
    } else if (league.draftType === "manual") {
      return `Manual Draft`;
    }
    return league.draftType || "Unknown";
  };

  const formatDraftOrderType = () => {
    if (league.draftOrderType === "random") {
      return "Random Order";
    } else if (league.draftOrderType === "admin") {
      return "Commissioner Sets Order";
    }
    return league.draftOrderType || "Not Set";
  };

  const formatDraftDateTime = () => {
    if (!league.draftDate) return "-";
    
    try {
      const date = league.draftDate.toDate ? league.draftDate.toDate() : new Date(league.draftDate);
      return date.toLocaleString("en-US", {
        timeZone: "America/New_York",
        weekday: "short",
        year: "numeric",
        month: "short", 
        day: "numeric",
        hour: "numeric", 
        minute: "2-digit",
        timeZoneName: "short"
      });
    } catch (error) {
      console.warn("Error formatting draft date:", error);
      return "Invalid Date";
    }
  };

  if (loading) return <p>Loading league data...</p>;
  if (!league) return <p>League not found.</p>;

  return (
    <div style={{ padding: "2rem" }}>
      <h2>Admin View: {league.name}</h2>
      
      {/* Current Week Management Section */}
      <div style={{ 
        backgroundColor: "#f0f8ff", 
        border: "1px solid #0ea5e9", 
        borderRadius: "8px", 
        padding: "1rem", 
        marginBottom: "2rem" 
      }}>
        <h3 style={{ margin: "0 0 1rem 0", color: "#0c4a6e" }}>Season Management</h3>
        <p><strong>Current Week (Global):</strong> <span style={{ color: "#1e40af", fontSize: "1.1em" }}>{currentWeek}</span></p>
        
        <div style={{ marginTop: "1rem", display: "flex", gap: "1rem", alignItems: "center", flexWrap: "wrap" }}>
          <select
            value={newWeekValue}
            onChange={(e) => setNewWeekValue(e.target.value)}
            style={{ padding: "0.5rem", borderRadius: "4px", border: "1px solid #ccc" }}
          >
            {weekOptions.map(week => (
              <option key={week} value={week}>{week}</option>
            ))}
          </select>
          
          <button 
            onClick={handleUpdateCurrentWeek}
            style={{
              backgroundColor: "#1e40af",
              color: "white",
              border: "none",
              padding: "0.5rem 1rem",
              borderRadius: "4px",
              cursor: "pointer"
            }}
          >
            Update Global Week
          </button>
        </div>
        
        <p style={{ fontSize: "0.9em", color: "#64748b", marginTop: "0.5rem", marginBottom: 0 }}>
          ⚠️ This updates the current week for ALL leagues globally.
        </p>
      </div>

      {/* League Info */}
      <p><strong>League ID:</strong> {league.id}</p>
      <p><strong>Admin UID:</strong> {league.admin}</p>
      <p><strong>Created By:</strong> {league.createdBy}</p>
      <p><strong>Scoring Type:</strong> {league.scoringType}</p>
      <p><strong>Max Managers:</strong> {league.maxManagers}</p>
      <p><strong>Members:</strong> {league.members?.length || 0}</p>
      <p><strong>Draft Status:</strong> {draftStatus()}</p>
      <p><strong>Draft Type:</strong> {formatDraftType()}</p>
      <p><strong>Draft Order:</strong> {formatDraftOrderType()}</p>
      {league.draftType === "live" && (
        <>
          <p><strong>Draft Date:</strong> {formatDraftDateTime()}</p>
          <p><strong>Time Per Pick:</strong> {league.timePerPick ? `${league.timePerPick} minute${league.timePerPick !== 1 ? 's' : ''}` : "-"}</p>
        </>
      )}
      <p><strong>League Current Week:</strong> {league.currentWeek || "Not Set"}</p>
      <p><strong>Created At:</strong> {league.createdAt?.toDate().toLocaleString()}</p>

      <div style={{ marginTop: "1rem" }}>
        <button onClick={handleSeedRemainingUsers}>
          Seed Remaining Users
        </button>

        <button onClick={handleSimulateDraft} style={{ marginLeft: "1rem" }}>
          Simulate Full Draft
        </button>

        <button 
          onClick={handleSimulateAllButFinalPick} 
          style={{ 
            marginLeft: "1rem", 
            backgroundColor: "#1976d2", 
            color: "white", 
            border: "none", 
            padding: "8px 12px", 
            borderRadius: "4px" 
          }}
        >
          🎯 Simulate All But Final Pick
        </button>

        <button onClick={handleResetDraft} style={{ marginLeft: "1rem", color: "red" }}>
          🗑️ Reset Draft
        </button>
      </div>

      <h3 style={{ marginTop: "2rem" }}>League Members</h3>
      {members.length === 0 ? (
        <p>No members in this league.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "1rem", fontSize: "0.9rem" }}>
          <thead>
            <tr style={{ backgroundColor: "#f5f5f5" }}>
              <th style={th}>UID</th>
              <th style={th}>Display Name</th>
              <th style={th}>Team Name</th>
              <th style={th}>Email</th>
              <th style={th}>Starters</th>
              <th style={th}>Bench</th>
              <th style={th}>Drafted</th>
              <th style={th}>FA Moves</th>
              <th style={th}>Joined</th>
              <th style={th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m, idx) => (
              <tr key={m.id} style={{ backgroundColor: idx % 2 === 0 ? "#fafafa" : "white" }}>
                <td style={td}>{m.id}</td>
                <td style={td}>{m.displayName}</td>
                <td style={td}>{m.teamName}</td>
                <td style={td}>{m.email}</td>
                <td style={td}>{formatList(m.lineup?.starters)}</td>
                <td style={td}>{formatList(m.lineup?.bench)}</td>
                <td style={td}>{formatList(m.lineup?.drafted)}</td>
                <td style={td}>{m.freeAgentMoves || 0}</td>
                <td style={td}>
                  {m.joinedAt?.toDate().toLocaleString() || "-"}
                </td>
                <td style={td}>
                  {m.id !== league.admin ? (
                    <>
                      <button onClick={() => handleKick(m.id)} style={{ marginRight: "0.5rem", color: "red" }}>
                        Kick
                      </button>
                      <button onClick={() => handlePromote(m.id)}>
                        Promote
                      </button>
                    </>
                  ) : (
                    <em>Admin</em>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

const th = {
  padding: "8px",
  borderBottom: "1px solid #ccc",
  textAlign: "left"
};

const td = {
  padding: "8px",
  borderBottom: "1px solid #eee",
  verticalAlign: "top",
  fontFamily: "monospace"
};

export default AdminLeagueDetail;