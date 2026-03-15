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

    const { data: member } = await supabase
      .from("league_members")
      .select("starters, bench")
      .eq("league_id", leagueId)
      .eq("user_id", user.id)
      .single();

    if (!member) return;

    await supabase
      .from("league_members")
      .update({
        starters: (member.starters || []).filter(t => t !== teamName),
        bench: (member.bench || []).filter(t => t !== teamName),
      })
      .eq("league_id", leagueId)
      .eq("user_id", user.id);

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
