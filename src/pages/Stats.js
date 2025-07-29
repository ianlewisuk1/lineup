import React, { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase/firebase";
import { useNavigate, useParams } from "react-router-dom";
import LeagueNavBar from "../components/LeagueNavBar";

function Stats() {
  const { leagueId } = useParams();
  const navigate = useNavigate();
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
      if (key === "school") return team.school || "";
      
      const season = team.currentSeason || {};
      
      // Handle specific keys that might need special processing
      switch (key) {
        case "gamePoints":
          return Number(season.gamePoints) || 0;
        case "avgPointsFor":
          return Number(season.avgPointsFor) || 0;
        case "avgPointsAgainst":
          return Number(season.avgPointsAgainst) || 0;
        case "sosRank":
          return Number(team.sosRank) || 999; // Put unranked teams at bottom
        case "philMetrics":
          return Number(team.philMetrics) || 999; // Put unranked teams at bottom
        case "prevYearPoints":
          return Number(team.prevYearPoints) || 0;
        case "nextOpponent":
          return season.nextOpponent || "zzz"; // Put teams without next opponent at bottom
        case "record":
        case "confRecord":
        case "ats":
          return season[key] || "zzz"; // Put teams without records at bottom
        default:
          return season[key] || "";
      }
    };

    const aVal = getValue(a, sortConfig.key);
    const bVal = getValue(b, sortConfig.key);

    // Handle numeric sorting
    if (typeof aVal === "number" && typeof bVal === "number") {
      return sortConfig.direction === "ascending" ? aVal - bVal : bVal - aVal;
    }
    
    // Handle string sorting
    const aStr = String(aVal).toLowerCase();
    const bStr = String(bVal).toLowerCase();
    
    if (sortConfig.direction === "ascending") {
      return aStr.localeCompare(bStr);
    } else {
      return bStr.localeCompare(aStr);
    }
  });

  const handleTeamClick = (teamName) => {
    navigate(`/${leagueId}/team/${encodeURIComponent(teamName)}`);
  };

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
            <SortableHeader label="Team (Conf)" sortKey="school" onSort={handleSort} sortConfig={sortConfig} />
            <SortableHeader label="Points" sortKey="gamePoints" onSort={handleSort} sortConfig={sortConfig} />
            <SortableHeader label="Record" sortKey="record" onSort={handleSort} sortConfig={sortConfig} />
            <SortableHeader label="Conf Rec" sortKey="confRecord" onSort={handleSort} sortConfig={sortConfig} />
            <SortableHeader label="ATS Record" sortKey="ats" onSort={handleSort} sortConfig={sortConfig} />
            <SortableHeader label="Avg PF" sortKey="avgPointsFor" onSort={handleSort} sortConfig={sortConfig} />
            <SortableHeader label="Avg PA" sortKey="avgPointsAgainst" onSort={handleSort} sortConfig={sortConfig} />
            <SortableHeader label="Next Opponent (Spread)" sortKey="nextOpponent" onSort={handleSort} sortConfig={sortConfig} />
            <SortableHeader label="SOS Rank" sortKey="sosRank" onSort={handleSort} sortConfig={sortConfig} />
            <SortableHeader label="Phil Metrics Rank" sortKey="philMetrics" onSort={handleSort} sortConfig={sortConfig} />
            <SortableHeader label="2024 Points" sortKey="prevYearPoints" onSort={handleSort} sortConfig={sortConfig} />
          </tr>
        </thead>
        <tbody>
          {sortedTeams.map((team) => (
            <tr key={team.school} onClick={() => handleTeamClick(team.school)} style={{ cursor: "pointer", borderBottom: "1px solid #ddd" }}>
              <td style={{ padding: "0.75rem", minWidth: "200px", width: "200px" }}>
                <span style={{ color: "#0066cc", textDecoration: "underline" }}>
                  {team.school}
                </span>
                {" "}({team.conference || "-"})
              </td>
              <td style={{ padding: "0.75rem" }}>{team.currentSeason?.gamePoints ?? 0}</td>
              <td style={{ padding: "0.75rem" }}>{team.currentSeason?.record || "-"}</td>
              <td style={{ padding: "0.75rem" }}>{team.currentSeason?.confRecord || "-"}</td>
              <td style={{ padding: "0.75rem" }}>{team.currentSeason?.ats || "-"}</td>
              <td style={{ padding: "0.75rem" }}>{team.currentSeason?.avgPointsFor ?? "-"}</td>
              <td style={{ padding: "0.75rem" }}>{team.currentSeason?.avgPointsAgainst ?? "-"}</td>
              <td style={{ padding: "0.75rem" }}>{formatNextOpponent(team)}</td>
              <td style={{ padding: "0.75rem" }}>{team.sosRank ?? "-"}</td>
              <td style={{ padding: "0.75rem" }}>{team.philMetrics !== undefined && team.philMetrics !== null ? team.philMetrics : "-"}</td>
              <td style={{ padding: "0.75rem" }}>{team.prevYearPoints ?? "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const SortableHeader = ({ label, sortKey, onSort, sortConfig }) => (
  <th
    onClick={() => onSort(sortKey)}
    style={{ 
      cursor: "pointer", 
      textAlign: "left", 
      borderBottom: "2px solid #ccc",
      padding: "0.75rem",
      userSelect: "none",
      backgroundColor: sortConfig.key === sortKey ? "#f0f0f0" : "transparent",
      whiteSpace: "nowrap"
    }}
  >
    {label} {sortConfig.key === sortKey ? (sortConfig.direction === "ascending" ? "▲" : "▼") : "⇅"}
  </th>
);

export default Stats;