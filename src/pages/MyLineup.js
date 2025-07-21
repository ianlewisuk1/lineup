import React from "react";
import { useParams } from "react-router-dom";

function MyLineup() {
  const { leagueId } = useParams();

  return (
    <div>
      <h2>My Lineup - League: {leagueId}</h2>
      {/* TODO: Load user's 5 starters and 2 bench from league/members/{userId} */}
    </div>
  );
}

export default MyLineup;
