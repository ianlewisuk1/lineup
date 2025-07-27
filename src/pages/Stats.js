import React, { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase/firebase";
import LeagueNavBar from "../components/LeagueNavBar";

function Stats() {
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortConfig, setSortConfig] = useState({ key: "school", direction: "ascending" });
  const [conferenceList, setConferenceList] = useState([]);
  const [activeConference, setActiveConference] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const fetchTeams = async () => {
      const snap = await getDocs(collection(db, "teams"));
      const list = [];
      const confSet = new Set();

      snap.forEach(doc => {
        const data = doc.data();
        if ((data.classification || "").toUpperCase() === "FBS") {
          list.push(data);
          if (data.conference) confSet.add(data.conference);
        }
      });

      setTeams(list);
      setConferenceList(["All", "P4", ...Array.from(confSet).sort()]);
      setLoading(false);
    };
    fetchTeams();
  }, []);

  const filteredTeams = teams.filter(team => {
    const matchesSearch = team.school.toLowerCase().includes(searchQuery.toLowerCase());

    const p4 = ["SEC", "ACC", "Big Ten", "Big 12"];
    if (activeConference === "All") return matchesSearch;
    if (activeConference === "P4") return matchesSearch && p4.includes(team.conference);
    return matchesSearch && team.conference === activeConference;
  });

  const sortedTeams = [...filteredTeams].sort((a, b) => {
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

  const formatNextOpponent = (team) => {
    const cs = team.currentSeason;
    if (!cs || !cs.nextOpponent) return "-";

    const spread = cs.nextOpponentSpread ?? "TBD";

    let prefix = "?";
    if (cs.nextGameIsHome === true) prefix = "vs";
    else if (cs.nextGameIsHome === false) prefix = "@";

    return `${prefix} ${cs.nextOpponent} (${spread})`;
  };

  if (loading) return <p>Loading FBS stats...</p>;

  return (
    <div style={{ padding: "1rem" }}>
      <LeagueNavBar />
      <h2>FBS Team Stats</h2>

      <div style={{ display: "flex", gap: "1rem", marginBottom: "1rem", flexWrap: "wrap" }}>
        <input
          type="text"
          placeholder="Search by team name..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ padding: "6px", fontSize: "0.9rem" }}
        />

        <select
          value={activeConference}
          onChange={(e) => setActiveConference(e.target.value)}
          style={{ padding: "6px", fontSize: "0.9rem" }}
        >
          {conferenceList.map(conf => (
            <option key={conf} value={conf}>{conf}</option>
          ))}
        </select>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <Th label="Team (Conf)" sortKey="school" onSort={handleSort} sortConfig={sortConfig} />
            <Th label="Points" sortKey="gamePoints" onSort={handleSort} sortConfig={sortConfig} />
            <Th label="Record" sortKey="record" onSort={handleSort} sortConfig={sortConfig} />
            <Th label="Conf Rec" sortKey="confRecord" onSort={handleSort} sortConfig={sortConfig} />
            <Th label="ATS Record" sortKey="ats" onSort={handleSort} sortConfig={sortConfig} />
            <Th label="Avg PF" sortKey="avgPointsFor" onSort={handleSort} sortConfig={sortConfig} />
            <Th label="Avg PA" sortKey="avgPointsAgainst" onSort={handleSort} sortConfig={sortConfig} />
            <Th label="Next Opponent (Spread)" sortKey="nextOpponent" onSort={handleSort} sortConfig={sortConfig} />
            <Th label="SOS Rank" sortKey="sosRank" onSort={handleSort} sortConfig={sortConfig} />
            <Th label="Phil Metrics Rank" sortKey="philMetrics" onSort={handleSort} sortConfig={sortConfig} />
          </tr>
        </thead>
        <tbody>
          {sortedTeams.map((team) => (
            <tr key={team.school}>
              <td>{team.school} ({team.conference || "-"})</td>
              <td>{team.currentSeason?.gamePoints ?? 0}</td>
              <td>{team.currentSeason?.record || "-"}</td>
              <td>{team.currentSeason?.confRecord || "-"}</td>
              <td>{team.currentSeason?.ats || "-"}</td>
              <td>{team.currentSeason?.avgPointsFor ?? "-"}</td>
              <td>{team.currentSeason?.avgPointsAgainst ?? "-"}</td>
              <td>{formatNextOpponent(team)}</td>
              <td>{team.currentSeason?.sosRank ?? "-"}</td>
              <td>{team.currentSeason?.philMetrics ?? "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const Th = ({ label, sortKey, onSort, sortConfig }) => (
  <th
    onClick={() => onSort(sortKey)}
    style={{ cursor: "pointer", textAlign: "left", borderBottom: "1px solid #ccc", whiteSpace: "nowrap" }}
  >
    {label} {sortConfig.key === sortKey ? (sortConfig.direction === "ascending" ? "▲" : "▼") : ""}
  </th>
);

export default Stats;
