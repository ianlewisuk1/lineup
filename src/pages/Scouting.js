import React, { useEffect, useState } from "react";
import { db } from "../firebase/firebase";
import { collection, getDocs } from "firebase/firestore";
import { useParams, useNavigate } from "react-router-dom";
import LeagueNavBar from "../components/LeagueNavBar";

function Scouting() {
  const { leagueId } = useParams();
  const navigate = useNavigate();
  const [teams, setTeams] = useState([]);
  const [sortConfig, setSortConfig] = useState({ key: "philMetricDraftRank", direction: "asc" });
  const [conferenceFilter, setConferenceFilter] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const fetchTeams = async () => {
      const querySnapshot = await getDocs(collection(db, "teams"));
      const fbsTeams = querySnapshot.docs
        .map((doc) => doc.data())
        .filter((team) => (team.classification || "").toLowerCase() === "fbs");
      setTeams(fbsTeams);
    };

    fetchTeams();
  }, []);

  const handleTeamClick = (teamName) => {
    navigate(`/${leagueId}/team/${encodeURIComponent(teamName)}`);
  };

  const sortBy = (key) => {
    let direction = "asc";
    if (sortConfig.key === key && sortConfig.direction === "asc") {
      direction = "desc";
    }
    setSortConfig({ key, direction });
  };

  const filteredTeams = teams.filter((team) => {
    const matchesSearch = team.school.toLowerCase().includes(searchQuery.toLowerCase());

    const p4 = ["SEC", "ACC", "Big Ten", "Big 12"];
    if (conferenceFilter === "All") return matchesSearch;
    if (conferenceFilter === "P4") return matchesSearch && p4.includes(team.conference);
    return matchesSearch && team.conference === conferenceFilter;
  });

  const sortedTeams = [...filteredTeams].sort((a, b) => {
    const aValue = a[sortConfig.key];
    const bValue = b[sortConfig.key];

    if (aValue == null && bValue == null) return 0;
    if (aValue == null) return 1;
    if (bValue == null) return -1;

    if (typeof aValue === "number" && typeof bValue === "number") {
      return sortConfig.direction === "asc" ? aValue - bValue : bValue - aValue;
    }

    return sortConfig.direction === "asc"
      ? aValue.toString().localeCompare(bValue.toString())
      : bValue.toString().localeCompare(aValue.toString());
  });

  const uniqueConferences = [...new Set(teams.map((team) => team.conference))].sort();

  return (
    <div>
      <LeagueNavBar />
      <h2 style={{ textAlign: "center" }}>Scouting</h2>

      <div style={{ display: "flex", justifyContent: "center", gap: "10px", margin: "10px 0" }}>
        <input
          type="text"
          placeholder="Search by school..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ padding: "6px", fontSize: "0.9rem", width: "200px" }}
        />

        <select
          value={conferenceFilter}
          onChange={(e) => setConferenceFilter(e.target.value)}
          style={{ padding: "6px", fontSize: "0.9rem" }}
        >
          <option value="All">All Conferences</option>
          <option value="P4">Power 4 (SEC, ACC, Big Ten, Big 12)</option>
          {uniqueConferences.map((conf) => (
            <option key={conf} value={conf}>
              {conf}
            </option>
          ))}
        </select>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
          <thead>
            <tr>
              <Th label="School" sortKey="school" sortBy={sortBy} sortConfig={sortConfig} />
              <Th label="Odds to Win Conf" sortKey="confOdds" sortBy={sortBy} sortConfig={sortConfig} />
              <Th label="PhilMetrics" sortKey="philMetricDraftRank" sortBy={sortBy} sortConfig={sortConfig} />
              <Th label="Power Rank" sortKey="powerRank" sortBy={sortBy} sortConfig={sortConfig} />
              <Th label="Returning Starters" sortKey="retStarters" sortBy={sortBy} sortConfig={sortConfig} />
              <Th label="SOS Rank" sortKey="sosRank" sortBy={sortBy} sortConfig={sortConfig} />
              <Th label="2024 Pts" sortKey="prevYearPoints" sortBy={sortBy} sortConfig={sortConfig} />
              <Th label="2024 Record" sortKey="prevYearRecord" sortBy={sortBy} sortConfig={sortConfig} />
              <Th label="2024 ATS Record" sortKey="prevYearAts" sortBy={sortBy} sortConfig={sortConfig} />
              <Th label="Predicted Wins" sortKey="predictedWins" sortBy={sortBy} sortConfig={sortConfig} />
            </tr>
          </thead>
          <tbody>
            {sortedTeams.map((team, i) => (
              <tr key={i}>
                <td style={tdStyle}>
                  <strong 
                    onClick={() => handleTeamClick(team.school)}
                    style={{ 
                      cursor: "pointer", 
                      color: "#0066cc", 
                      textDecoration: "underline" 
                    }}
                  >
                    {team.school}
                  </strong>{" "}
                  <span style={{ color: "#666" }}>({team.conference})</span>
                </td>
                <td style={tdStyle}>{team.confOdds != null ? `${team.confOdds}%` : "-"}</td>
                <td style={tdStyle}>{team.philMetricDraftRank ?? "-"}</td>
                <td style={tdStyle}>{team.powerRank ?? "-"}</td>
                <td style={tdStyle}>{team.retStarters ?? "-"}</td>
                <td style={tdStyle}>{team.sosRank ?? "-"}</td>
                <td style={tdStyle}>{team.prevYearPoints ?? "-"}</td>
                <td style={tdStyle}>{team.prevYearRecord || "-"}</td>
                <td style={tdStyle}>{team.prevYearAts || "-"}</td>
                <td style={tdStyle}>{team.predictedWins ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const Th = ({ label, sortKey, sortBy, sortConfig }) => (
  <th
    onClick={() => sortBy(sortKey)}
    style={{ ...thStyle, cursor: "pointer", whiteSpace: "nowrap" }}
  >
    {label} {sortConfig.key === sortKey ? (sortConfig.direction === "asc" ? "▲" : "▼") : ""}
  </th>
);

const thStyle = {
  borderBottom: "1px solid #ccc",
  padding: "8px",
  background: "#f0f0f0",
  textAlign: "left",
};

const tdStyle = {
  padding: "8px",
  borderBottom: "1px solid #eee",
};

export default Scouting;