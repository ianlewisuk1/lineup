// src/pages/Stats.js
import React, { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase/firebase";
import LeagueNavBar from "../components/LeagueNavBar";

function Stats() {
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortConfig, setSortConfig] = useState({ key: "school", direction: "ascending" });

  useEffect(() => {
    const fetchTeams = async () => {
      const snap = await getDocs(collection(db, "teams"));
      const list = [];
      snap.forEach(doc => {
        const data = doc.data();
        if (data.classification === "FBS") {
          list.push(data);
        }
      });
      setTeams(list);
      setLoading(false);
    };
    fetchTeams();
  }, []);

  const sortedTeams = [...teams].sort((a, b) => {
    const getValue = (team, key) => {
      if (key === "school") return team.school;
      const season = team.currentSeason || {};
      return season[key] ?? "";
    };

    const aVal = getValue(a, sortConfig.key);
    const bVal = getValue(b, sortConfig.key);

    if (typeof aVal === "number" && typeof bVal === "number") {
      return sortConfig.direction === "ascending" ? aVal - bVal : bVal - aVal;
    }
    return sortConfig.direction === "ascending"
      ? aVal.toString().localeCompare(bVal.toString())
      : bVal.toString().localeCompare(aVal.toString());
  });

  const handleSort = (key) => {
    setSortConfig((prev) => {
      if (prev.key === key) {
        return { key, direction: prev.direction === "ascending" ? "descending" : "ascending" };
      } else {
        return { key, direction: "ascending" };
      }
    });
  };

  if (loading) return <p>Loading FBS stats...</p>;

  return (
    <div style={{ padding: "1rem" }}>
      <LeagueNavBar />
      <h2>FBS Team Stats</h2>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th onClick={() => handleSort("school")} style={{ cursor: "pointer", textAlign: "left", borderBottom: "1px solid #ccc" }}>Team (Conf)</th>
            <th onClick={() => handleSort("gamePoints")} style={{ cursor: "pointer", textAlign: "left", borderBottom: "1px solid #ccc" }}>Lineup TM Pts</th>
            <th onClick={() => handleSort("record")} style={{ cursor: "pointer", textAlign: "left", borderBottom: "1px solid #ccc" }}>Record</th>
            <th onClick={() => handleSort("confRecord")} style={{ cursor: "pointer", textAlign: "left", borderBottom: "1px solid #ccc" }}>Conf Rec</th>
            <th onClick={() => handleSort("ats")} style={{ cursor: "pointer", textAlign: "left", borderBottom: "1px solid #ccc" }}>ATS</th>
            <th onClick={() => handleSort("avgPointsFor")} style={{ cursor: "pointer", textAlign: "left", borderBottom: "1px solid #ccc" }}>Avg PF</th>
            <th onClick={() => handleSort("avgPointsAgainst")} style={{ cursor: "pointer", textAlign: "left", borderBottom: "1px solid #ccc" }}>Avg PA</th>
            <th onClick={() => handleSort("nextOpponent")} style={{ cursor: "pointer", textAlign: "left", borderBottom: "1px solid #ccc" }}>Next Opponent</th>
            <th onClick={() => handleSort("nextOpponentSpread")} style={{ cursor: "pointer", textAlign: "left", borderBottom: "1px solid #ccc" }}>Next Opp Data</th>
            <th onClick={() => handleSort("sosRank")} style={{ cursor: "pointer", textAlign: "left", borderBottom: "1px solid #ccc" }}>SOS Rank</th>
            <th onClick={() => handleSort("philMetrics")} style={{ cursor: "pointer", textAlign: "left", borderBottom: "1px solid #ccc" }}>Phil Metrics</th>
          </tr>
        </thead>
        <tbody>
          {sortedTeams.map((team) => (
            <tr key={team.school}>
              <td>{team.school} ({team.conference})</td>
              <td>{team.currentSeason?.gamePoints ?? 0}</td>
              <td>{team.currentSeason?.record || "-"}</td>
              <td>{team.currentSeason?.confRecord || "-"}</td>
              <td>{team.currentSeason?.ats || "-"}</td>
              <td>{team.currentSeason?.avgPointsFor ?? "-"}</td>
              <td>{team.currentSeason?.avgPointsAgainst ?? "-"}</td>
              <td>{team.currentSeason?.nextOpponent || "-"}</td>
              <td>{team.currentSeason?.nextOpponentSpread || "-"}</td>
              <td>{team.currentSeason?.sosRank ?? "-"}</td>
              <td>{team.currentSeason?.philMetrics ?? "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default Stats;
