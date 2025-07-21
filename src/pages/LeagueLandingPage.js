import React from "react";
import { useParams, useNavigate } from "react-router-dom";

function LeagueLandingPage() {
  const { leagueId } = useParams();
  const navigate = useNavigate();

  const handleNavigate = (path) => {
    navigate(`/${leagueId}/${path}`);
  };

  return (
    <div>
      <h2>League: {leagueId}</h2>
      <button onClick={() => handleNavigate("my-lineup")}>My Lineup</button>
      <button onClick={() => handleNavigate("free-agents")}>Free Agents</button>
      <button onClick={() => handleNavigate("draft-room")}>Draft Room</button>
    </div>
  );
}

export default LeagueLandingPage;
