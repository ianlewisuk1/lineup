import React from "react";
import { useNavigate, useParams } from "react-router-dom";

function LeagueNavBar() {
  const { leagueId } = useParams();
  const navigate = useNavigate();

  return (
    <nav style={{ display: "flex", gap: "1rem", padding: "1rem", background: "#f4f4f4" }}>
      <button onClick={() => navigate(`/${leagueId}/my-lineup`)}>My Lineup</button>
      <button onClick={() => navigate(`/${leagueId}/free-agents`)}>Free Agents</button>
      <button onClick={() => navigate(`/${leagueId}/draft-room`)}>Draft Room</button>
      <button onClick={() => navigate(`/${leagueId}/my-league`)}>Standings</button>
      <button onClick={() => navigate(`/${leagueId}/league-rules`)}>League Rules</button>
      <button onClick={() => navigate(`/${leagueId}/stats`)}>Stats</button>
    </nav>
  );
}

export default LeagueNavBar;
