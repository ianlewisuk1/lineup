import React, { useEffect, useState } from "react";
import { supabase } from "../supabase/supabase";
import { useParams, useNavigate } from "react-router-dom";
import BottomNavBar from "../components/BottomNavBar";
import LeagueNav from "../components/LeagueNav";
import { parseRecord } from "../utils/teamStats";

function Scouting() {
  const { leagueId } = useParams();
  const navigate = useNavigate();
  const [teams, setTeams] = useState([]);
  const [allTeams, setAllTeams] = useState({});
  const [draftedTeams, setDraftedTeams] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [sortConfig, setSortConfig] = useState({ key: "philMetricDraftRank", direction: "asc" });
  const [conferenceFilter, setConferenceFilter] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");

useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch teams data with season stats
        const { data: teamsData, error: teamsError } = await supabase.from('teams').select('*, team_season_stats(*)');
        if (teamsError) throw teamsError;

        // Create teams map for logos/colors
        const teamsMap = {};
        (teamsData || []).forEach(teamData => {
          if (teamData.school) {
            const stats = teamData.team_season_stats?.[0] || {};
            teamsMap[teamData.school] = {
              logo: teamData.logo_filename ? `/logos/${teamData.logo_filename}` : null,
              color: teamData.color || null,
              ...teamData,
              // Flatten season stats for column access
              game_points: stats.game_points || 0,
              record: stats.record || null,
              sos_rank: stats.sos_rank || null,
              prev_year_points: stats.prev_year_points || 0,
              is_on_bye: stats.is_on_bye || false,
              next_opponent: stats.next_opponent || null,
            };
          }
        });
        setAllTeams(teamsMap);

        // Fetch drafted team IDs from draft_picks
        const draftedTeamsSet = new Set();
        if (leagueId) {
          const { data: picks } = await supabase
            .from('draft_picks')
            .select('team_id')
            .eq('league_id', leagueId);
          (picks ?? []).forEach((p) => draftedTeamsSet.add(p.team_id));
        }
        setDraftedTeams(draftedTeamsSet);

        // Filter for FBS teams and mark as drafted, flattening season stats
        const fbsTeams = (teamsData || [])
          .filter((team) => (team.classification || "").toLowerCase() === "fbs")
          .map(team => {
            const stats = team.team_season_stats?.[0] || {};
            return {
              ...team,
              logo: team.logo_filename ? `/logos/${team.logo_filename}` : null,
              game_points: stats.game_points || 0,
              record: stats.record || null,
              sos_rank: stats.sos_rank || null,
              prev_year_points: stats.prev_year_points || 0,
              is_on_bye: stats.is_on_bye || false,
              next_opponent: stats.next_opponent || null,
              isDrafted: draftedTeamsSet.has(team.id)
            };
          });

        setTeams(fbsTeams);
        setLoading(false);
      } catch (error) {
        console.error("Error fetching data:", error);
        setLoading(false);
      }
    };

    fetchData();
  }, [leagueId]);

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
    if (conferenceFilter === "Available") return matchesSearch && !team.isDrafted;
    if (conferenceFilter === "Drafted") return matchesSearch && team.isDrafted;
    return matchesSearch && team.conference === conferenceFilter;
  });

  const sortedTeams = [...filteredTeams].sort((a, b) => {
    const aValue = a[sortConfig.key];
    const bValue = b[sortConfig.key];

    if (aValue == null && bValue == null) return 0;
    if (aValue == null) return 1;
    if (bValue == null) return -1;

    // FIX: Add school name sorting
    if (sortConfig.key === "school") {
      const aSchool = a.school || "";
      const bSchool = b.school || "";
      return sortConfig.direction === "asc"
        ? aSchool.localeCompare(bSchool)
        : bSchool.localeCompare(aSchool);
    }

    // Custom logic for record and ATS fields
    if (sortConfig.key === "prevYearRecord" || sortConfig.key === "prevYearAts") {
      const [aWins, aLosses] = parseRecord(aValue);
      const [bWins, bLosses] = parseRecord(bValue);

      const aPct = aWins + aLosses > 0 ? aWins / (aWins + aLosses) : 0;
      const bPct = bWins + bLosses > 0 ? bWins / (bWins + bLosses) : 0;

      return sortConfig.direction === "asc" ? aPct - bPct : bPct - aPct;
    }

    // Standard numeric comparison
    if (typeof aValue === "number" && typeof bValue === "number") {
      return sortConfig.direction === "asc" ? aValue - bValue : bValue - aValue;
    }

    // Fallback string comparison
    return sortConfig.direction === "asc"
      ? aValue.toString().localeCompare(bValue.toString())
      : bValue.toString().localeCompare(aValue.toString());
  });

  const uniqueConferences = [...new Set(teams.map((team) => team.conference))].sort();

  // Team Logo Component
  const TeamLogo = ({ teamName, size = 24, isDrafted = false }) => {
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
      opacity: isDrafted ? 0.4 : 1,
      filter: isDrafted ? "grayscale(100%)" : "none"
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
              const fallbackUrl = null; // logos array removed; no fallback URL
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

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-4 sm:left-10 w-48 sm:w-72 h-48 sm:h-72 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full blur-3xl animate-pulse"></div>
        </div>
        <div className="relative z-10 flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="text-4xl mb-4 animate-spin">⚡</div>
            <p className="text-xl text-white/80">Loading team database...</p>
          </div>
        </div>
      </div>
    );
  }

  const availableCount = teams.filter(team => !team.isDrafted).length;
  const draftedCount = teams.filter(team => team.isDrafted).length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white">
      {/* Animated Background Elements */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-20 left-4 sm:left-10 w-48 sm:w-72 h-48 sm:h-72 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-20 right-4 sm:right-10 w-56 sm:w-96 h-56 sm:h-96 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full blur-3xl animate-pulse delay-1000"></div>
      </div>

      <BottomNavBar />

      <LeagueNav />

      {/* Main Content */}
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 py-4 pb-20">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="mb-4">
            <span className="inline-block text-4xl sm:text-5xl mb-2">🔍</span>
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black mb-4 leading-tight">
            <span className="bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
              Team Scouting
            </span>
          </h1>
          <p className="text-lg sm:text-xl text-white/80">
            {filteredTeams.length} teams • {availableCount} available, {draftedCount} drafted
          </p>
        </div>

        {/* Filters */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20 mb-8">
          <div className="flex flex-wrap gap-6 justify-center">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-white/80 uppercase tracking-wide">
                Search Teams
              </label>
              <input
                type="text"
                placeholder="Search by school name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="px-4 py-3 text-slate-900 bg-white/90 border-2 border-white/20 rounded-xl w-64 outline-none transition-all duration-300 focus:border-purple-400 focus:bg-white placeholder:text-slate-500"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-white/80 uppercase tracking-wide">
                Conference
              </label>
              <select
                value={conferenceFilter}
                onChange={(e) => setConferenceFilter(e.target.value)}
                className="px-4 py-3 text-slate-900 bg-white/90 border-2 border-white/20 rounded-xl cursor-pointer outline-none transition-all duration-300 focus:border-purple-400 focus:bg-white"
              >
                <option value="All">All Conferences</option>
                <option value="P4">Power 4 Only</option>
                <option value="Available">Available Only</option>
                <option value="Drafted">Drafted Only</option>
                {uniqueConferences.map((conf) => (
                  <option key={conf} value={conf}>
                    {conf}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Table Container */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl border border-white/20 overflow-hidden">
        {/* Table Header Info */}
        <div className="p-6 border-b border-white/20 bg-white/5">
          <h3 className="text-lg font-bold text-white mb-2">
            FBS Team Database
          </h3>
          <p className="text-sm text-white/70">
            Click any column header to sort • Click team name to view details • Greyed out teams are drafted
          </p>
        </div>

        {/* Scrollable Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[1000px]" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "linear-gradient(135deg, #1e40af 0%, #0ea5e9 100%)", color: "white" }}>
                  <th style={{
                    ...thStyle,
                    textAlign: "center",
                    width: "40px",
                    position: "sticky",
                    left: "0",
                    zIndex: "20",
                    backgroundColor: "transparent",
                    borderRight: "none"
                  }}>
                  </th>

                  {/* FIX: Make School column sortable */}
                  <th
                    onClick={() => sortBy("school")}
                    style={{
                      ...thStyle,
                      textAlign: "left",
                      width: "210px",
                      position: "relative",
                      paddingLeft: "0",
                      borderLeft: "none",
                      cursor: "pointer",
                      transition: "background-color 0.2s ease"
                    }}
                    onMouseEnter={(e) => e.target.style.backgroundColor = "rgba(255, 255, 255, 0.1)"}
                    onMouseLeave={(e) => e.target.style.backgroundColor = "transparent"}
                  >
                    <span style={{
                      position: "absolute",
                      left: "20px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      display: "flex",
                      alignItems: "center",
                      gap: "4px"
                    }}>
                      School
                      {sortConfig.key === "school" && (
                        <span style={{ fontSize: "10px" }}>
                          {sortConfig.direction === "asc" ? "▲" : "▼"}
                        </span>
                      )}
                    </span>
                  </th>

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
                    className={`transition-colors duration-200 hover:bg-white/10 ${i % 2 === 0 ? "bg-white/5" : "bg-transparent"}`}
                    style={{
                      opacity: team.isDrafted ? 0.4 : 1,
                      backgroundColor: team.isDrafted ? 'rgba(239, 68, 68, 0.05)' : undefined
                    }}
                  >
                    {/* Logo Column - Sticky */}
                    <td style={{
                      ...tdStyle,
                      textAlign: "center",
                      width: "40px",
                      paddingRight: "4px",
                      position: "sticky",
                      left: "0",
                      zIndex: "1"
                    }}>
                      <div style={{ display: "flex", justifyContent: "center" }}>
                        <TeamLogo teamName={team.school} size={24} isDrafted={team.isDrafted} />
                      </div>
                    </td>

                    {/* Team Name Column */}
                    <td style={{...tdStyle, textAlign: "left", paddingLeft: "4px", width: "210px"}}>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "2px" }}>
                          <div
                            onClick={() => handleTeamClick(team.school)}
                            style={{
                              cursor: "pointer",
                              color: team.isDrafted ? "#9ca3af" : "#60a5fa",
                              fontWeight: "600",
                              textDecoration: "none",
                              fontSize: "14px"
                            }}
                            onMouseEnter={(e) => e.target.style.textDecoration = "underline"}
                            onMouseLeave={(e) => e.target.style.textDecoration = "none"}
                          >
                            {team.school}
                          </div>
                          {team.isDrafted && (
                            <span style={{
                              backgroundColor: "#ef4444",
                              color: "white",
                              padding: "2px 6px",
                              borderRadius: "4px",
                              fontSize: "10px",
                              fontWeight: "600",
                              textTransform: "uppercase",
                              opacity: 0.8
                            }}>
                              DRAFTED
                            </span>
                          )}
                        </div>
                        <div style={{
                          fontSize: "11px",
                          color: team.isDrafted ? "#6b7280" : "#64748b",
                          fontWeight: "500"
                        }}>
                          {team.conference}
                        </div>
                      </div>
                    </td>

                    <td style={{...tdStyle, color: team.isDrafted ? "#9ca3af" : "white"}}>
                      {team.confOdds != null ? (
                        <span style={{
                          backgroundColor: team.confOdds >= 20 ? "#dcfce7" : team.confOdds >= 10 ? "#fef3c7" : "#fef2f2",
                          color: team.confOdds >= 20 ? "#166534" : team.confOdds >= 10 ? "#92400e" : "#991b1b",
                          padding: "2px 6px",
                          borderRadius: "4px",
                          fontSize: "12px",
                          fontWeight: "600",
                          opacity: team.isDrafted ? 0.5 : 1
                        }}>
                          {team.confOdds}%
                        </span>
                      ) : "-"}
                    </td>
                    <td style={{...tdStyle, color: team.isDrafted ? "#9ca3af" : "white"}}>
                      {team.philMetricDraftRank ? (
                        <span style={{
                          backgroundColor: team.philMetricDraftRank <= 25 ? "#dcfce7" :
                                          team.philMetricDraftRank <= 50 ? "#fef3c7" : "#f3f4f6",
                          color: team.philMetricDraftRank <= 25 ? "#166534" :
                                 team.philMetricDraftRank <= 50 ? "#92400e" : "#374151",
                          padding: "2px 6px",
                          borderRadius: "4px",
                          fontSize: "12px",
                          fontWeight: "600",
                          opacity: team.isDrafted ? 0.5 : 1
                        }}>
                          #{team.philMetricDraftRank}
                        </span>
                      ) : "-"}
                    </td>
                    <td style={{...tdStyle, color: team.isDrafted ? "#9ca3af" : "white"}}>
                      {team.powerRank ?? "-"}
                    </td>
                    <td style={{...tdStyle, color: team.isDrafted ? "#9ca3af" : "white"}}>
                      {team.retStarters ? `${team.retStarters}%` : "-"}
                    </td>
                    <td style={{...tdStyle, color: team.isDrafted ? "#9ca3af" : "white"}}>
                      {team.sos_rank ?? "-"}
                    </td>
                    <td style={{...tdStyle, color: team.isDrafted ? "#9ca3af" : "white"}}>
                      {team.prev_year_points ? (
                        <span style={{
                          fontWeight: "600",
                          color: team.isDrafted ? "#9ca3af" : "white"
                        }}>
                          {team.prev_year_points}
                        </span>
                      ) : "-"}
                    </td>
                    <td style={{...tdStyle, color: team.isDrafted ? "#9ca3af" : "white"}}>
                      {team.prevYearRecord || "-"}
                    </td>
                    <td style={{...tdStyle, color: team.isDrafted ? "#9ca3af" : "white"}}>
                      {team.prevYearAts || "-"}
                    </td>
                    <td style={{...tdStyle, color: team.isDrafted ? "#9ca3af" : "white"}}>
                      {team.predictedWins ? (
                        <span style={{
                          fontWeight: "600",
                          color: team.isDrafted ? "#9ca3af" : "white"
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
              <div className="p-10 text-center">
                <p className="text-white/70 text-base">
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
  borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
  verticalAlign: "middle",
  color: "white",
  textAlign: "center"
};

export default Scouting;
