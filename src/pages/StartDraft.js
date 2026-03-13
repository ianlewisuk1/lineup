import React, { useState } from "react";
import { supabase } from "../supabase/supabase";

function StartDraft() {
  const [message, setMessage] = useState("");

  const startDraft = async () => {
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    if (!currentUser) {
      setMessage("You must be logged in.");
      return;
    }

    try {
      // Step 1: Get user's league ID
      const { data: userSnap } = await supabase.from("users").select("*").eq("id", currentUser.id).single();
      const leagueId = userSnap.leagueId;

      if (!leagueId) {
        setMessage("No league found for user.");
        return;
      }

      // ✅ Step 2: Check if draft already exists
      const { data: draftSnap } = await supabase.from("drafts").select("*").eq("league_id", leagueId).single();

      if (draftSnap) {
        setMessage("⚠️ Draft has already been initialized for this league.");
        return;
      }

      // Step 3: Get all users in the league
      const { data: leagueMembers } = await supabase.from("users").select("*").eq("leagueId", leagueId);
      const draftOrder = (leagueMembers || []).map((u) => u.id);

      // Step 4: Get member info from league_members
      const { data: membersSnap } = await supabase.from("league_members").select("*").eq("league_id", leagueId);
      const teamNames = {};
      (membersSnap || []).forEach((m) => {
        teamNames[m.user_id] = m.team_name || "Unnamed Team";
      });

      // Step 5: Prep selectedTeams map
      const selectedTeams = {};
      draftOrder.forEach((uid) => {
        selectedTeams[uid] = [];
      });

      // Step 6: Get list of available FBS teams
      const { data: teamsData } = await supabase.from("teams").select("*");
      const availableTeams = (teamsData || [])
        .filter(team => {
          if (!team || typeof team !== "object") return false;
          if (!team.classification) return false;
          return team.classification.toLowerCase() === "fbs";
        })
        .map(team => team.school || "Unnamed Team");

      // Step 7: Write draft data
      const draftData = {
        league_id: leagueId,
        draft_order: draftOrder,
        current_pick_index: 0,
        selected_teams: selectedTeams,
        available_teams: availableTeams,
        team_names: teamNames
      };

      await supabase.from("drafts").insert(draftData);
      setMessage("✅ Draft initialized!");
    } catch (err) {
      console.error(err);
      setMessage("Error: " + err.message);
    }
  };

  return (
    <div>
      <h2>Start Draft</h2>
      <button onClick={startDraft}>Initialize Draft</button>
      <p>{message}</p>
    </div>
  );
}

export default StartDraft;
