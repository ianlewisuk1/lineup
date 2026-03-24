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

    const { data: memberData } = await supabase
      .from("league_members")
      .select("id")
      .eq("league_id", leagueId)
      .eq("user_id", user.id)
      .single();
    if (!memberData) return;

    // Get current week from config
    const { data: configRow } = await supabase
      .from("config").select("value").eq("key", "season").single();
    const currentWeek = configRow?.value?.currentWeek || 1;

    const { data: lineupRow } = await supabase
      .from("weekly_lineups")
      .select("starters, bench")
      .eq("league_id", leagueId)
      .eq("member_id", memberData.id)
      .eq("week", currentWeek)
      .single();

    const starters = [...(lineupRow?.starters || Array(5).fill(null))];
    const bench = [...(lineupRow?.bench || Array(2).fill(null))];
    const currentRoster = [...starters, ...bench].filter(Boolean);

    if (!currentRoster.includes(dropTeam)) return;

    let newStarters = starters;
    let newBench = bench;

    if (starters.includes(dropTeam)) {
      newStarters = starters.map(t => (t === dropTeam ? addTeam : t));
    } else if (bench.includes(dropTeam)) {
      newBench = bench.map(t => (t === dropTeam ? addTeam : t));
    } else {
      return;
    }

    await supabase.from("weekly_lineups").upsert({
      league_id: leagueId,
      member_id: memberData.id,
      week: currentWeek,
      starters: newStarters,
      bench: newBench,
    }, { onConflict: 'league_id,member_id,week' });

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
