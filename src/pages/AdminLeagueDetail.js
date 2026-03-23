// AdminLeagueDetail.js
import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../supabase/supabase";

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
        const { data: leagueData } = await supabase.from("leagues").select("*").eq("id", leagueId).single();
        if (!leagueData) {
          setLeague(null);
          return;
        }

        setLeague(leagueData);

        const { data: membersData } = await supabase.from("league_members").select("*").eq("league_id", leagueId);
        const membersList = (membersData || []).map(m => ({
          id: m.user_id,
          ...m
        }));
        setMembers(membersList);

        const { data: draftData } = await supabase.from("drafts").select("*").eq("league_id", leagueId).single();
        if (draftData) {
          setDraftMeta(draftData);
        } else {
          setDraftMeta(null);
        }

        // Fetch current week from global config
        const { data: configData } = await supabase.from("config").select("*").eq("key", "season").single();
        if (configData) {
          const globalCurrentWeek = configData.value?.currentWeek || "Preseason";
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
      // Fetch existing config value first to merge
      const { data: configData } = await supabase.from("config").select("*").eq("key", "season").single();
      const existingValue = configData?.value || {};
      await supabase.from("config").update({
        value: { ...existingValue, currentWeek: newWeekValue.trim(), lastUpdated: new Date().toISOString() }
      }).eq("key", "season");

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
      await supabase.from("league_members").delete().eq("league_id", leagueId).eq("user_id", userId);
      refresh();
    } catch (err) {
      console.error("Error kicking user:", err);
    }
  };

  const handlePromote = async (userId) => {
    if (!window.confirm("Promote this user to league admin?")) return;
    try {
      await supabase.from("leagues").update({ admin_id: userId }).eq("id", leagueId);
      refresh();
    } catch (err) {
      console.error("Error promoting user:", err);
    }
  };

  const handleSimulateDraft = async () => {
    if (!window.confirm("This will simulate a complete draft using the same logic as live drafts. Continue?")) return;

    try {
      // ✅ MATCH DRAFTROOM: Get teams the exact same way
      const { data: teamsData } = await supabase.from("teams").select("*");
      const teamDocs = (teamsData || []).filter(t => {
        return t.school &&
              typeof t.school === "string" &&
              t.classification?.toLowerCase() === "fbs";
      });
      const teamNames = teamDocs.map(t => t.id); // ✅ Use document ID (matches DraftRoom)

      if (teamNames.length === 0) {
        alert("⚠️ No valid FBS teams found. Check your teams table.");
        return;
      }

      // ✅ MATCH DRAFTROOM: Build team rankings map
      const allTeamsData = {};
      teamDocs.forEach(t => {
        allTeamsData[t.id] = t;
      });

      const draftOrder = members.map(m => m.id);
      const totalPicks = draftOrder.length * 7;

      let availableTeams = [...teamNames];
      const selectedTeams = {};

      // Initialize empty arrays for each manager
      draftOrder.forEach(uid => {
        selectedTeams[uid] = [];
      });

      // ✅ MATCH DRAFTROOM: Simulate all picks using exact same logic
      for (let pickIndex = 0; pickIndex < totalPicks; pickIndex++) {
        const currentUid = getCurrentPicker(draftOrder, pickIndex);

        if (!currentUid || availableTeams.length === 0) {
          console.error(`Simulation failed at pick ${pickIndex}: no current UID or no available teams`);
          break;
        }

        // ✅ MATCH DRAFTROOM: Use exact same team selection logic as handleAutoPick
        const teamRankings = {};

        availableTeams.forEach(teamId => {
          const teamData = allTeamsData[teamId];
          if (teamData && teamData.philMetricDraftRank !== undefined) {
            teamRankings[teamId] = teamData.philMetricDraftRank;
          }
        });

        const availableTeamsWithRanks = availableTeams
          .map(teamId => ({
            id: teamId,
            rank: teamRankings[teamId] || 999
          }))
          .sort((a, b) => a.rank - b.rank);

        const bestTeam = availableTeamsWithRanks[0];
        const pickedTeam = bestTeam.id; // ✅ Use document ID

        // Add to selected teams
        selectedTeams[currentUid].push(pickedTeam);

        // Remove from available teams
        availableTeams = availableTeams.filter(t => t !== pickedTeam);
      }

      // ✅ MATCH DRAFTROOM: Create draft metadata in exact same format
      await supabase.from("drafts").upsert({
        league_id: leagueId,
        draft_order: draftOrder,
        current_pick_index: totalPicks,
        selected_teams: selectedTeams,
        draft_complete: true
      });

      // ✅ MATCH DRAFTROOM: Update league status
      await supabase.from("leagues").update({ draft_complete: true }).eq("id", leagueId);

      // ✅ MATCH DRAFTROOM: Update member lineups exactly like completeDraft function
      const memberUpdates = Object.entries(selectedTeams).map(async ([uid, teams]) => {
        const starters = teams.slice(0, 5);
        const bench = teams.slice(5);

        await supabase.from("league_members").update({
          starters,
          bench,
          free_agent_moves: 0,
          points: 0,
          weekly_points: 0
        }).eq("league_id", leagueId).eq("user_id", uid);
      });

      await Promise.all(memberUpdates);

      alert("✅ Draft simulated using live draft logic!");
      refresh();

    } catch (err) {
      console.error("Error simulating draft:", err);
      alert("Error: " + err.message);
    }
  };

  const handleSimulateAllButFinalPick = async () => {
    if (!window.confirm("This will simulate the entire draft except for the final pick using exact live draft logic. Continue?")) return;

    try {
      // ✅ MATCH DRAFTROOM: Get teams the exact same way
      const { data: teamsData } = await supabase.from("teams").select("*");
      const teamDocs = (teamsData || []).filter(t => {
        return t.school &&
              typeof t.school === "string" &&
              t.classification?.toLowerCase() === "fbs";
      });
      const teamNames = teamDocs.map(t => t.id); // ✅ Use document ID (matches DraftRoom)

      if (teamNames.length === 0) {
        alert("⚠️ No valid FBS teams found. Check your teams table.");
        return;
      }

      // ✅ MATCH DRAFTROOM: Build team data map
      const allTeamsData = {};
      teamDocs.forEach(t => {
        allTeamsData[t.id] = t;
      });

      const draftOrder = members.map(m => m.id);
      const totalPicks = draftOrder.length * 7;
      const finalPickIndex = totalPicks - 1; // Stop before the final pick

      let availableTeams = [...teamNames];
      const selectedTeams = {};

      // Initialize empty arrays for each manager
      draftOrder.forEach(uid => {
        selectedTeams[uid] = [];
      });

      // ✅ MATCH DRAFTROOM: Simulate picks using exact same logic
      for (let pickIndex = 0; pickIndex < finalPickIndex; pickIndex++) {
        const currentUid = getCurrentPicker(draftOrder, pickIndex);

        if (!currentUid || availableTeams.length === 0) {
          console.error(`Simulation failed at pick ${pickIndex}: no current UID or no available teams`);
          break;
        }

        // ✅ MATCH DRAFTROOM: Use exact same team selection logic as handleAutoPick
        const teamRankings = {};

        availableTeams.forEach(teamId => {
          const teamData = allTeamsData[teamId];
          if (teamData && teamData.philMetricDraftRank !== undefined) {
            teamRankings[teamId] = teamData.philMetricDraftRank;
          }
        });

        const availableTeamsWithRanks = availableTeams
          .map(teamId => ({
            id: teamId,
            rank: teamRankings[teamId] || 999
          }))
          .sort((a, b) => a.rank - b.rank);

        const bestTeam = availableTeamsWithRanks[0];
        const pickedTeam = bestTeam.id; // ✅ Use document ID

        // Add to selected teams
        selectedTeams[currentUid].push(pickedTeam);

        // Remove from available teams
        availableTeams = availableTeams.filter(t => t !== pickedTeam);
      }

      // ✅ MATCH DRAFTROOM: Create draft metadata in exact same format as live draft
      await supabase.from("drafts").upsert({
        league_id: leagueId,
        draft_order: draftOrder,
        current_pick_index: finalPickIndex, // One pick before completion
        selected_teams: selectedTeams,
        draft_complete: false,
        draft_start_time: new Date().toISOString() // ✅ Set timer for final pick
      });

      // ✅ MATCH DRAFTROOM: Update member lineups with current picks (but don't set starters/bench yet)
      const memberUpdates = Object.entries(selectedTeams).map(async ([uid, teams]) => {
        if (teams.length > 0) {
          await supabase.from("league_members").update({
            free_agent_moves: 0
          }).eq("league_id", leagueId).eq("user_id", uid);
        }
      });

      await Promise.all(memberUpdates);

      const finalPicker = getCurrentPicker(draftOrder, finalPickIndex);
      const finalPickerName = members.find(m => m.id === finalPicker)?.displayName || "Unknown";

      alert(`✅ Draft simulated up to final pick using live draft logic!\n\nFinal pick belongs to: ${finalPickerName}\nRemaining teams: ${availableTeams.length}`);
      refresh();

    } catch (err) {
      console.error("Error simulating draft:", err);
      alert("Error: " + err.message);
    }
  };

  const handleSimulateNext10Picks = async () => {
    if (!draftMeta || draftMeta.draft_complete) {
      alert("No active draft found or draft is already complete.");
      return;
    }

    const remainingPicks = (members.length * 7) - draftMeta.current_pick_index;
    const picksToSimulate = Math.min(10, remainingPicks);

    if (picksToSimulate <= 0) {
      alert("No more picks remaining in the draft.");
      return;
    }

    if (!window.confirm(`This will simulate the next ${picksToSimulate} pick${picksToSimulate !== 1 ? 's' : ''} using live draft logic. Continue?`)) {
      return;
    }

    try {
      // 🔧 FIX 1: Get FRESH draft data to avoid stale state
      const { data: freshDraftData } = await supabase.from("drafts").select("*").eq("league_id", leagueId).single();
      if (!freshDraftData) {
        alert("Draft data not found.");
        return;
      }

      // Get teams data
      const { data: teamsData } = await supabase.from("teams").select("*");
      const allTeamsData = {};
      (teamsData || []).forEach(t => {
        allTeamsData[t.id] = t;
      });

      // 🔧 FIX 2: Use fresh data, not stale draftMeta
      let {
        draft_order: draftOrder,
        current_pick_index: currentPickIndex,
        selected_teams: selectedTeams
      } = freshDraftData;

      // availableTeams not stored separately; reconstruct from selectedTeams vs all FBS teams
      const { data: allTeams } = await supabase.from("teams").select("id,classification");
      const allFbsTeamIds = (allTeams || [])
        .filter(t => t.classification?.toLowerCase() === "fbs")
        .map(t => t.id);
      const pickedTeamIds = new Set(Object.values(selectedTeams || {}).flat());
      let availableTeams = allFbsTeamIds.filter(id => !pickedTeamIds.has(id));


      // 🔧 FIX 3: Ensure selectedTeams is properly initialized
      if (!selectedTeams) selectedTeams = {};
      draftOrder.forEach(uid => {
        if (!selectedTeams[uid]) {
          selectedTeams[uid] = [];
        }
      });

      // 🔧 FIX 4: Create a working copy of availableTeams to avoid mutation issues
      let workingAvailableTeams = [...availableTeams];

      const totalPicks = draftOrder.length * 7;
      const endPickIndex = Math.min(currentPickIndex + picksToSimulate, totalPicks);

      // 🔧 FIX 5: Track picks made during this simulation for logging
      const simulatedPicks = [];

      // Simulate picks one by one
      for (let pickIndex = currentPickIndex; pickIndex < endPickIndex; pickIndex++) {
        const currentUid = getCurrentPicker(draftOrder, pickIndex);

        if (!currentUid) {
          console.error(`❌ No current UID for pick ${pickIndex + 1}`);
          break;
        }

        if (workingAvailableTeams.length === 0) {
          console.error(`❌ No available teams left at pick ${pickIndex + 1}`);
          break;
        }

        // Skip if manager already has 7 teams
        if (selectedTeams[currentUid].length >= 7) {
          console.warn(`⚠️ Manager ${currentUid} already has 7 teams, skipping pick ${pickIndex + 1}`);
          continue;
        }

        // 🔧 FIX 6: Use current workingAvailableTeams, not original availableTeams
        const teamRankings = {};

        workingAvailableTeams.forEach(teamId => {
          const teamData = allTeamsData[teamId];
          if (teamData && teamData.philMetricDraftRank !== undefined) {
            teamRankings[teamId] = teamData.philMetricDraftRank;
          }
        });

        const availableTeamsWithRanks = workingAvailableTeams
          .map(teamId => ({
            id: teamId,
            rank: teamRankings[teamId] || 999
          }))
          .sort((a, b) => a.rank - b.rank);

        if (availableTeamsWithRanks.length === 0) {
          console.error(`❌ No teams with ranks available at pick ${pickIndex + 1}`);
          break;
        }

        const bestTeam = availableTeamsWithRanks[0];
        const pickedTeam = bestTeam.id;

        // 🔧 FIX 7: Double-check team hasn't been picked already
        if (!workingAvailableTeams.includes(pickedTeam)) {
          console.error(`❌ Team ${pickedTeam} not in available teams at pick ${pickIndex + 1}`);
          break;
        }

        // Add to selected teams
        selectedTeams[currentUid].push(pickedTeam);

        // 🔧 FIX 8: Remove from working available teams immediately
        workingAvailableTeams = workingAvailableTeams.filter(t => t !== pickedTeam);

        // Track for logging
        const managerName = members.find(m => m.id === currentUid)?.displayName || currentUid;
        const teamName = allTeamsData[pickedTeam]?.school || pickedTeam;
        simulatedPicks.push({
          pick: pickIndex + 1,
          manager: managerName,
          team: teamName,
          rank: bestTeam.rank
        });

      }

      const newPickIndex = endPickIndex;
      const draftComplete = newPickIndex >= totalPicks;

      // 🔧 FIX 9: Update with working available teams
      const draftUpdateData = {
        current_pick_index: newPickIndex,
        selected_teams: selectedTeams,
        draft_complete: draftComplete
      };

      // 🔧 FIX 10: Update Supabase with updated draft data
      await supabase.from("drafts").update(draftUpdateData).eq("league_id", leagueId);

      // Update member lineups
      const memberUpdates = Object.entries(selectedTeams).map(async ([uid, teams]) => {
        if (draftComplete) {
          const starters = teams.slice(0, 5);
          const bench = teams.slice(5);

          await supabase.from("league_members").update({
            starters,
            bench
          }).eq("league_id", leagueId).eq("user_id", uid);
        }
      });

      await Promise.all(memberUpdates);

      if (draftComplete) {
        await supabase.from("leagues").update({ draft_complete: true }).eq("id", leagueId);
      }

      // 🔧 FIX 11: Enhanced success message with pick details
      const simulatedCount = simulatedPicks.length;
      let message = `✅ Successfully simulated ${simulatedCount} pick${simulatedCount !== 1 ? 's' : ''}!\n\n`;

      // Show the picks that were made
      message += "Picks made:\n";
      simulatedPicks.forEach(pick => {
        message += `Pick ${pick.pick}: ${pick.team} → ${pick.manager}\n`;
      });

      if (draftComplete) {
        message += "\n🎉 DRAFT IS NOW COMPLETE!";
      } else {
        const nextPicker = getCurrentPicker(draftOrder, newPickIndex);
        const nextPickerName = nextPicker ? members.find(m => m.id === nextPicker)?.displayName || "Unknown" : null;
        message += `\nNext pick: ${nextPickerName}`;
        message += `\nRemaining picks: ${totalPicks - newPickIndex}`;
        message += `\nTeams left: ${workingAvailableTeams.length}`;
      }

      alert(message);
      refresh();

    } catch (err) {
      console.error("❌ Error simulating next picks:", err);
      alert("Error: " + err.message);
    }
  };

  const handleResetDraft = async () => {
    if (!window.confirm("This will delete all draft data and clear every lineup. Continue?")) return;

    try {
      await supabase.from("drafts").delete().eq("league_id", leagueId);

      await supabase.from("leagues").update({ draft_complete: false }).eq("id", leagueId);

      const { data: membersData } = await supabase.from("league_members").select("user_id").eq("league_id", leagueId);
      const clears = (membersData || []).map(m =>
        supabase.from("league_members").update({
          starters: [],
          bench: [],
          free_agent_moves: 0,
          points: 0,
          weekly_points: 0
        }).eq("league_id", leagueId).eq("user_id", m.user_id)
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

    const needed = league.max_managers - members.length;
    if (needed <= 0) {
      alert("League is already full.");
      return;
    }

    try {
      const { data: usersData } = await supabase.from("users").select("*");
      const currentIds = new Set(members.map(m => m.id));
      const available = (usersData || []).filter(u => !currentIds.has(u.id));

      if (available.length < needed) {
        alert("Not enough users to fill the league.");
        return;
      }

      const selected = available.sort(() => 0.5 - Math.random()).slice(0, needed);

      const batchAdds = selected.map(async (userData) => {
        const uidSuffix = userData.id.slice(-4);

        const displayName =
          userData.first_name?.trim() ||
          (userData.email?.split("@")[0]?.replace(/\W/g, "") || `User${uidSuffix}`);

        const teamName =
          userData.team_name?.trim() ||
          `Team ${uidSuffix}`;

        await supabase.from("league_members").insert({
          league_id: leagueId,
          user_id: userData.id,
          team_name: teamName,
          free_agent_moves: 0,
          points: 0,
          weekly_points: 0,
          starters: [],
          bench: []
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
    if (draftMeta.draft_complete) return <span style={{ color: "green" }}>✅ Complete</span>;
    return <span style={{ color: "orange" }}>🕐 In Progress</span>;
  };

  const formatDraftType = () => {
    if (league.draft_type === "live") {
      return `Live Draft`;
    } else if (league.draft_type === "manual") {
      return `Manual Draft`;
    }
    return league.draft_type || "Unknown";
  };

  const formatDraftOrderType = () => {
    if (league.draft_order_type === "random") {
      return "Random Order";
    } else if (league.draft_order_type === "admin") {
      return "Commissioner Sets Order";
    }
    return league.draft_order_type || "Not Set";
  };

  const formatDraftDateTime = () => {
    if (!league.draft_date) return "-";

    try {
      const date = new Date(league.draft_date);
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
    <div style={{
      minHeight: "100vh",
      backgroundColor: "#ffffff",
      padding: "0"
    }}>
      <div style={{
        padding: "2rem",
        backgroundColor: "#ffffff",
        minHeight: "100vh"
      }}>
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
        <p><strong>Admin UID:</strong> {league.admin_id}</p>
        <p><strong>Created By:</strong> {league.created_by}</p>
        <p><strong>Scoring Type:</strong> {league.scoring_type}</p>
        <p><strong>Max Managers:</strong> {league.max_managers}</p>
        <p><strong>Members:</strong> {members.length}</p>
        <p><strong>Draft Status:</strong> {draftStatus()}</p>
        <p><strong>Draft Type:</strong> {formatDraftType()}</p>
        <p><strong>Draft Order:</strong> {formatDraftOrderType()}</p>
        {league.draft_type === "live" && (
          <>
            <p><strong>Draft Date:</strong> {formatDraftDateTime()}</p>
            <p><strong>Time Per Pick:</strong> {league.time_per_pick ? `${league.time_per_pick} minute${league.time_per_pick !== 1 ? 's' : ''}` : "-"}</p>
          </>
        )}
        <p><strong>League Current Week:</strong> {league.current_week || "Not Set"}</p>

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

          <button
            onClick={handleSimulateNext10Picks}
            disabled={!draftMeta || draftMeta.draft_complete}
            style={{
              marginLeft: "1rem",
              backgroundColor: draftMeta && !draftMeta.draft_complete ? "#9c27b0" : "#ccc",
              color: "white",
              border: "none",
              padding: "8px 12px",
              borderRadius: "4px",
              cursor: draftMeta && !draftMeta.draft_complete ? "pointer" : "not-allowed"
            }}
          >
            ⚡ Simulate Next 10 Picks
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
                <th style={th}>FA Moves</th>
                <th style={th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m, idx) => (
                <tr key={m.id} style={{ backgroundColor: idx % 2 === 0 ? "#fafafa" : "white" }}>
                  <td style={td}>{m.id}</td>
                  <td style={td}>{m.displayName}</td>
                  <td style={td}>{m.team_name}</td>
                  <td style={td}>{m.email}</td>
                  <td style={td}>{formatList(m.starters)}</td>
                  <td style={td}>{formatList(m.bench)}</td>
                  <td style={td}>{m.free_agent_moves || 0}</td>
                  <td style={td}>
                    {m.id !== league.admin_id ? (
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
    </div>
  );
}

export default AdminLeagueDetail;
