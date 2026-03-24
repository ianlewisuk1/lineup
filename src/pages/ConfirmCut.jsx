import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../supabase/supabase";
import LeagueNavBar from "../components/LeagueNavBar";

function ConfirmCut() {
  const { leagueId, teamName } = useParams();
  const [teamData, setTeamData] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchTeam = async () => {
      const { data } = await supabase
        .from("teams")
        .select("school, conference, wins, losses")
        .eq("slug", teamName)
        .single();
      if (data) setTeamData(data);
      setLoading(false);
    };
    fetchTeam();
  }, [teamName]);

  const handleConfirm = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: memberRow } = await supabase
      .from("league_members")
      .select("id")
      .eq("league_id", leagueId)
      .eq("user_id", user.id)
      .single();

    if (!memberRow) return;

    // Get current week
    const { data: configRow } = await supabase
      .from("config").select("value").eq("key", "season").single();
    const currentWeek = configRow?.value?.currentWeek || 1;

    const { data: lineupRow } = await supabase
      .from("weekly_lineups")
      .select("starters, bench")
      .eq("league_id", leagueId)
      .eq("member_id", memberRow.id)
      .eq("week", currentWeek)
      .single();

    if (!lineupRow) return;

    await supabase
      .from("weekly_lineups")
      .update({
        starters: (lineupRow.starters || []).map(t => t === teamName ? null : t),
        bench: (lineupRow.bench || []).map(t => t === teamName ? null : t),
      })
      .eq("league_id", leagueId)
      .eq("member_id", memberRow.id)
      .eq("week", currentWeek);

    navigate(`/${leagueId}/my-lineup`);
  };

  const handleCancel = () => navigate(`/${leagueId}/my-lineup`);

  if (loading) return <p>Loading team info...</p>;

  return (
    <div>
      <LeagueNavBar />
      <h2>Confirm Cut</h2>
      <p>Are you sure you want to cut <strong>{teamName}</strong> from your roster?</p>

      {teamData && (
        <div style={{ padding: "1rem", border: "1px solid #ccc", marginBottom: "1rem" }}>
          <strong>{teamData.school}</strong> ({teamData.conference})<br />
          Record: {teamData.wins}-{teamData.losses}
        </div>
      )}

      <button onClick={handleConfirm} style={{ marginRight: "1rem", background: "#f44336", color: "white" }}>
        Yes, cut them
      </button>
      <button onClick={handleCancel}>Cancel</button>
    </div>
  );
}

export default ConfirmCut;
