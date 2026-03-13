// src/pages/ConfirmSwapTeam.js
import React from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../supabase/supabase";
import LeagueNavBar from "../components/LeagueNavBar";

function ConfirmSwapTeam() {
  const { leagueId, addTeam, dropTeam } = useParams();
  const navigate = useNavigate();

  const handleConfirmSwap = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: memberData } = await supabase.from("league_members").select("*").eq("league_id", leagueId).eq("user_id", user.id).single();
    const starters = memberData.starters || [];
    const bench = memberData.bench || [];
    const currentRoster = [...starters, ...bench];

    if (!currentRoster.includes(dropTeam)) return;

    let newStarters = starters;
    let newBench = bench;

    if (starters.includes(dropTeam)) {
      newStarters = starters.map(t => (t === dropTeam ? addTeam : t));
    } else if (bench.includes(dropTeam)) {
      newBench = bench.map(t => (t === dropTeam ? addTeam : t));
    } else {
      // Defensive fallback: dropTeam is somehow not in either group
      return;
    }

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
      <h2>Confirm Swap</h2>
      <p>Swap <strong>{dropTeam}</strong> with <strong>{addTeam}</strong>?</p>
      <button onClick={handleConfirmSwap}>Yes, Confirm Swap</button>
      <button onClick={() => navigate(-1)} style={{ marginLeft: "1rem" }}>
        Cancel
      </button>
    </div>
  );
}

export default ConfirmSwapTeam;