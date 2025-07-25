// src/pages/LeagueRules.js
import React from "react";
import LeagueNavBar from "../components/LeagueNavBar";
import { useParams } from "react-router-dom";

function LeagueRules() {
  const { leagueId } = useParams();

  return (
    <div>
      <LeagueNavBar />
      <div style={{ padding: "1rem" }}>
        <h2>League Rules</h2>
        <ul>
          <li>Each league consists of 8, 10, or 12 players.</li>
          <li>Every player drafts 7 college football teams: 5 starters, 2 bench.</li>
          <li>Points are awarded based on whether teams win and how they perform against the spread.</li>
          <li>You can swap teams between your starting lineup and bench at any time.</li>
          <li>Each week, you can cut teams and pick up new ones from the free agent pool.</li>
          <li>Admins choose the league format: head-to-head or cumulative scoring.</li>
          <li>Draft order is randomized, and the draft uses a snake format.</li>
          <li>You can view full team stats and free agents from the league dashboard.</li>
        </ul>
        <p>
          All rule enforcement is automated. Have fun, and may the best lineup win!
        </p>
      </div>
    </div>
  );
}

export default LeagueRules;
