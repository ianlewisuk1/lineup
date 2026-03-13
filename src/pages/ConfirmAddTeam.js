// src/pages/ConfirmAddTeam.js
import React from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../supabase/supabase";
import LeagueNavBar from "../components/LeagueNavBar";

function ConfirmAddTeam() {
  const { leagueId, teamName } = useParams();
  const navigate = useNavigate();

  const handleConfirmAdd = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: memberData } = await supabase.from("league_members").select("*").eq("league_id", leagueId).eq("user_id", user.id).single();
    const starters = memberData.starters || [];
    const bench = memberData.bench || [];
    const currentRoster = [...starters, ...bench];

    if (currentRoster.length >= 7) return;

    const newStarters = starters.length < 5 ? [...starters, teamName] : starters;
    const newBench = starters.length < 5 ? bench : [...bench, teamName];

    await supabase.from("league_members").update({
      starters: newStarters,
      bench: newBench,
      free_agent_moves: (memberData.free_agent_moves || 0) + 1
    }).eq("league_id", leagueId).eq("user_id", user.id);

    navigate(`/${leagueId}/my-lineup`);
  };

  return (
    <div>
      <LeagueNavBar />
      <h2>Confirm Add</h2>
      <p>Do you want to add <strong>{teamName}</strong> to your roster?</p>
      <button onClick={handleConfirmAdd}>Yes, Add Team</button>
      <button onClick={() => navigate(-1)} style={{ marginLeft: "1rem" }}>
        Cancel
      </button>
    </div>
  );
}

export default ConfirmAddTeam;