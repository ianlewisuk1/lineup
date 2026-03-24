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

    if (currentRoster.length >= 7) return;

    const emptyStarterIndex = starters.findIndex(t => !t);
    const emptyBenchIndex = bench.findIndex(t => !t);

    if (emptyStarterIndex !== -1) {
      starters[emptyStarterIndex] = teamName;
    } else if (emptyBenchIndex !== -1) {
      bench[emptyBenchIndex] = teamName;
    }

    await supabase.from("weekly_lineups").upsert({
      league_id: leagueId,
      member_id: memberData.id,
      week: currentWeek,
      starters,
      bench,
    }, { onConflict: 'league_id,member_id,week' });

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
