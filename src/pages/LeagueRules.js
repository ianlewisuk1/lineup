// src/pages/LeagueRules.js
import React from "react";

function LeagueRules() {
  return (
    <div style={{ padding: "1rem" }}>
      <h2>League Rules</h2>
      <ul>
        <li>Each user drafts 7 college football teams.</li>
        <li>5 teams are active (starters), 2 are benched weekly.</li>
        <li>Points are based on performance vs the spread.</li>
        <li>Free agents can be added by dropping a team from your current roster.</li>
        <li>League admins choose head-to-head or cumulative formats.</li>
        <li>Each league can support 8, 10, or 12 managers.</li>
      </ul>
    </div>
  );
}

export default LeagueRules;