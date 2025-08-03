import React, { useEffect, useState } from "react";
import { db } from "../firebase/firebase";
import { collection, getDocs } from "firebase/firestore";
import { useParams, useNavigate } from "react-router-dom";
import LeagueNavBar from "../components/LeagueNavBar";

function Scouting() {
  const { leagueId } = useParams();
  const navigate = useNavigate();
  const [teams, setTeams] = useState([]);
  const [allTeams, setAllTeams] = useState({});
  const [sortConfig, setSortConfig] = useState({ key: "philMetricDraftRank", direction: "asc" });
  const [conferenceFilter, setConferenceFilter] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const fetchTeams = async () => {
      const querySnapshot = await getDocs(collection(db, "teams"));
      
      // Create teams map for logos/colors (like MyLeague)
      const teamsMap = {};
      querySnapshot.docs.forEach(doc => {
        const teamData = doc.data();
        if (teamData.school) {
          teamsMap[teamData.school] = {
            logo: teamData.logos1 || teamData.logos2 || null,
            color: teamData.color || null,
            ...teamData
          };
        }
      });
      setAllTeams(teamsMap);

      // Filter for FBS teams
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

  // Team Logo Component (from MyLeague)
  const TeamLogo = ({ teamName, size = 24 }) => {
    const team = allTeams[teamName];
    const logoUrl = team?.logo;

    const logoStyle = {
      width: size,
      height: size,
      borderRadius: "50%",
      overflow: "hidden",
      border: "1px solid #e2e8f0",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#f1f5f9",
      flexShrink: 0,
      marginRight: "8px"
    };

    if (logoUrl) {
      return (
        <div style={logoStyle}>
          <img 
            src={logoUrl} 
            alt={teamName}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover"
            }}
            onError={(e) => {
              const fallbackUrl = team?.logos2;
              if (fallbackUrl && e.target.src !== fallbackUrl) {
                e.target.src = fallbackUrl;
              } else {
                e.target.style.display = 'none';
                e.target.nextSibling.style.display = 'flex';
              }
            }}
          />
          <div style={{
            display: 'none',
            width: '100%',
            height: '100%',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '9px',
            fontWeight: '600',
            color: 'white',
            textAlign: 'center',
            background: 'linear-gradient(135deg, #1e40af 0%, #0ea5e9 100%)'
          }}>
            {teamName ? teamName.split(' ').map(word => word[0]).join('').slice(0, 2) : '?'}
          </div>
        </div>
      );
    }

    // Fallback placeholder
    return (
      <div style={{
        ...logoStyle,
        background: "linear-gradient(135deg, #1e40af 0%, #0ea5e9 100%)",
        color: "white",
        fontSize: '9px',
        fontWeight: '600'
      }}>
        {teamName ? teamName.split(' ').map(word => word[0]).join('').slice(0, 2) : '?'}
      </div>
    );
  };

  return (
    <div style={{ backgroundColor: "#f8fafc", minHeight: "100vh" }}>
      <LeagueNavBar />

      {/* Header */}
      <div style={{ 
        padding: "20px 16px 16px 16px",
        background: "linear-gradient(135deg, #1e40af 0%, #0ea5e9 100%)",
        color: "white"
      }}>
        <h1 style={{ 
          fontSize: "24px", 
          fontWeight: "700", 
          margin: "0 0 8px 0",
          textAlign: "center"
        }}>
          Team Scouting
        </h1>
        <p style={{
          fontSize: "14px",
          opacity: "0.9",
          textAlign: "center",
          margin: 0
        }}>
          {filteredTeams.length} teams • Analyze stats and find your next pick
        </p>
      </div>

      {/* Filters */}
      <div style={{
        backgroundColor: "white",
        borderBottom: "1px solid #e2e8f0",
        padding: "16px"
      }}>
        <div style={{ 
          display: "flex", 
          gap: "12px", 
          alignItems: "center",
          flexWrap: "wrap",
          justifyContent: "center"
        }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <label style={{ fontSize: "12px", fontWeight: "600", color: "#64748b" }}>
              Search Teams
            </label>
            <input
              type="text"
              placeholder="Search by school name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                padding: "10px 12px",
                fontSize: "14px",
                border: "2px solid #e2e8f0",
                borderRadius: "8px",
                width: "200px",
                outline: "none",
                transition: "border-color 0.2s ease"
              }}
              onFocus={(e) => e.target.style.borderColor = "#1e40af"}
              onBlur={(e) => e.target.style.borderColor = "#e2e8f0"}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <label style={{ fontSize: "12px", fontWeight: "600", color: "#64748b" }}>
              Conference
            </label>
            <select
              value={conferenceFilter}
              onChange={(e) => setConferenceFilter(e.target.value)}
              style={{
                padding: "10px 12px",
                fontSize: "14px",
                border: "2px solid #e2e8f0",
                borderRadius: "8px",
                backgroundColor: "white",
                cursor: "pointer",
                outline: "none"
              }}
            >
              <option value="All">All Conferences</option>
              <option value="P4">Power 4 Only</option>
              {uniqueConferences.map((conf) => (
                <option key={conf} value={conf}>
                  {conf}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Content Area */}
      <div style={{ padding: "16px" }}>
        {/* Table Container */}
        <div style={{
          backgroundColor: "white",
          borderRadius: "12px",
          boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
          border: "1px solid #e2e8f0",
          overflow: "hidden"
        }}>
          {/* Table Header Info */}
          <div style={{
            padding: "16px 20px",
            borderBottom: "1px solid #e2e8f0",
            background: "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)"
          }}>
            <h3 style={{
              fontSize: "16px",
              fontWeight: "700",
              color: "#1e293b",
              margin: "0 0 4px 0"
            }}>
              FBS Team Database
            </h3>
            <p style={{
              fontSize: "12px",
              color: "#64748b",
              margin: 0
            }}>
              Click any column header to sort • Click team name to view details
            </p>
          </div>

          {/* Scrollable Table */}
          <div style={{ overflowX: "auto" }}>
            <table style={{ 
              width: "100%", 
              borderCollapse: "collapse", 
              fontSize: "13px",
              minWidth: "1000px"
            }}>
              <thead>
                <tr style={{ background: "linear-gradient(135deg, #1e40af 0%, #0ea5e9 100%)", color: "white" }}>
                  <Th label="School" sortKey="school" sortBy={sortBy} sortConfig={sortConfig} />
                  <Th label="Conf Odds" sortKey="confOdds" sortBy={sortBy} sortConfig={sortConfig} />
                  <Th label="PhilMetrics" sortKey="philMetricDraftRank" sortBy={sortBy} sortConfig={sortConfig} />
                  <Th label="Power Rank" sortKey="powerRank" sortBy={sortBy} sortConfig={sortConfig} />
                  <Th label="Ret. Starters" sortKey="retStarters" sortBy={sortBy} sortConfig={sortConfig} />
                  <Th label="SOS Rank" sortKey="sosRank" sortBy={sortBy} sortConfig={sortConfig} />
                  <Th label="2024 Pts" sortKey="prevYearPoints" sortBy={sortBy} sortConfig={sortConfig} />
                  <Th label="2024 Record" sortKey="prevYearRecord" sortBy={sortBy} sortConfig={sortConfig} />
                  <Th label="2024 ATS" sortKey="prevYearAts" sortBy={sortBy} sortConfig={sortConfig} />
                  <Th label="Pred. Wins" sortKey="predictedWins" sortBy={sortBy} sortConfig={sortConfig} />
                </tr>
              </thead>
              <tbody>
                {sortedTeams.map((team, i) => (
                  <tr 
                    key={i}
                    style={{
                      backgroundColor: i % 2 === 0 ? "#fafafa" : "white",
                      transition: "background-color 0.2s ease"
                    }}
                    onMouseEnter={(e) => e.target.parentElement.style.backgroundColor = "#f1f5f9"}
                    onMouseLeave={(e) => e.target.parentElement.style.backgroundColor = i % 2 === 0 ? "#fafafa" : "white"}
                  >
                    <td style={tdStyle}>
                      <div style={{ display: "flex", alignItems: "center" }}>
                        <TeamLogo teamName={team.school} size={24} />
                        <div>
                          <div
                            onClick={() => handleTeamClick(team.school)}
                            style={{ 
                              cursor: "pointer", 
                              color: "#1e40af", 
                              fontWeight: "600",
                              textDecoration: "none",
                              fontSize: "14px"
                            }}
                            onMouseEnter={(e) => e.target.style.textDecoration = "underline"}
                            onMouseLeave={(e) => e.target.style.textDecoration = "none"}
                          >
                            {team.school}
                          </div>
                          <div style={{ fontSize: "11px", color: "#64748b", fontWeight: "500" }}>
                            {team.conference}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td style={tdStyle}>
                      {team.confOdds != null ? (
                        <span style={{
                          backgroundColor: team.confOdds >= 20 ? "#dcfce7" : team.confOdds >= 10 ? "#fef3c7" : "#fef2f2",
                          color: team.confOdds >= 20 ? "#166534" : team.confOdds >= 10 ? "#92400e" : "#991b1b",
                          padding: "2px 6px",
                          borderRadius: "4px",
                          fontSize: "12px",
                          fontWeight: "600"
                        }}>
                          {team.confOdds}%
                        </span>
                      ) : "-"}
                    </td>
                    <td style={tdStyle}>
                      {team.philMetricDraftRank ? (
                        <span style={{
                          backgroundColor: team.philMetricDraftRank <= 25 ? "#dcfce7" : 
                                          team.philMetricDraftRank <= 50 ? "#fef3c7" : "#f3f4f6",
                          color: team.philMetricDraftRank <= 25 ? "#166534" : 
                                 team.philMetricDraftRank <= 50 ? "#92400e" : "#374151",
                          padding: "2px 6px",
                          borderRadius: "4px",
                          fontSize: "12px",
                          fontWeight: "600"
                        }}>
                          #{team.philMetricDraftRank}
                        </span>
                      ) : "-"}
                    </td>
                    <td style={tdStyle}>{team.powerRank ?? "-"}</td>
                    <td style={tdStyle}>
                      {team.retStarters ? `${team.retStarters}%` : "-"}
                    </td>
                    <td style={tdStyle}>{team.sosRank ?? "-"}</td>
                    <td style={tdStyle}>
                      {team.prevYearPoints ? (
                        <span style={{
                          fontWeight: "600",
                          color: "#1e40af"
                        }}>
                          {team.prevYearPoints}
                        </span>
                      ) : "-"}
                    </td>
                    <td style={tdStyle}>{team.prevYearRecord || "-"}</td>
                    <td style={tdStyle}>{team.prevYearAts || "-"}</td>
                    <td style={tdStyle}>
                      {team.predictedWins ? (
                        <span style={{
                          fontWeight: "600",
                          color: team.predictedWins >= 8 ? "#059669" : team.predictedWins >= 6 ? "#d97706" : "#64748b"
                        }}>
                          {team.predictedWins}
                        </span>
                      ) : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* No Results */}
          {sortedTeams.length === 0 && (
            <div style={{
              padding: "40px 20px",
              textAlign: "center"
            }}>
              <p style={{ color: "#64748b", fontSize: "16px", margin: 0 }}>
                No teams found matching your criteria.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const Th = ({ label, sortKey, sortBy, sortConfig }) => (
  <th
    onClick={() => sortBy(sortKey)}
    style={{ 
      ...thStyle, 
      cursor: "pointer",
      transition: "background-color 0.2s ease"
    }}
    onMouseEnter={(e) => e.target.style.backgroundColor = "rgba(255, 255, 255, 0.1)"}
    onMouseLeave={(e) => e.target.style.backgroundColor = "transparent"}
  >
    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
      <span>{label}</span>
      {sortConfig.key === sortKey && (
        <span style={{ fontSize: "10px" }}>
          {sortConfig.direction === "asc" ? "▲" : "▼"}
        </span>
      )}
    </div>
  </th>
);

const thStyle = {
  borderRight: "1px solid rgba(255, 255, 255, 0.2)",
  padding: "12px 16px",
  textAlign: "left",
  fontWeight: "700",
  fontSize: "12px",
  textTransform: "uppercase",
  letterSpacing: "0.5px",
  whiteSpace: "nowrap"
};

const tdStyle = {
  padding: "12px 16px",
  borderBottom: "1px solid #f1f5f9",
  verticalAlign: "middle"
};

export default Scouting;