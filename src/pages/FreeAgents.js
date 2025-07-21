import React from "react";
import { useParams } from "react-router-dom";

function FreeAgents() {
  const { leagueId } = useParams();

  return (
    <div>
      <h2>Free Agents - League: {leagueId}</h2>
      {/* TODO: Show teams not currently drafted by anyone in this league */}
    </div>
  );
}

export default FreeAgents;
