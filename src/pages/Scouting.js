import React, { useEffect, useMemo, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { Star } from "lucide-react";
import BottomNavBar from "../components/BottomNavBar";
import LeagueNav from "../components/LeagueNav";
import TeamLogoImage from "../components/league/TeamLogoImage";
import { useLeague } from "../context/LeagueContext";
import { useAuth } from "../context/AuthContext";
import { useDraftContext } from "../context/DraftContext";
import { usePreseasonStats } from "../hooks/usePreseasonStats";
import { useBigBoard } from "../hooks/useBigBoard";
import TeamDrawer from "../components/league/TeamDrawer";

// conf_odds is stored as a raw American moneyline. Negatives already carry their sign;
// positives need one added back for display.
const formatAmericanOdds = (odds) => (odds > 0 ? `+${odds}` : `${odds}`);

function Scouting() {
  const { leagueId } = useParams();
  const { isDraftComplete } = useLeague();
  const { teams: authTeams } = useAuth();
  const { pickedTeamIds } = useDraftContext();
  const { preseasonData } = usePreseasonStats();
  const { count, limit, isOnBoard, rankOf, toggle } = useBigBoard(leagueId, pickedTeamIds);

  // Ascending on American odds = best price (biggest favorite) first.
  const [sortConfig, setSortConfig] = useState({ key: "confOdds", direction: "asc" });
  const [conferenceFilter, setConferenceFilter] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [drawerTeam, setDrawerTeam] = useState(null);
  const [boardNotice, setBoardNotice] = useState("");

  useEffect(() => {
    if (!boardNotice) return;
    const id = setTimeout(() => setBoardNotice(""), 3000);
    return () => clearTimeout(id);
  }, [boardNotice]);

  const teams = useMemo(() =>
    Object.values(authTeams)
      .filter((t) => (t.classification || "").toLowerCase() === "fbs")
      .map((t) => {
        const pre = preseasonData[t.id] || {};
        return {
          ...t,
          isDrafted:           pickedTeamIds.has(t.id),
          boardRank:           rankOf(t.id),
          // Preseason SOS, not the in-season one on team_season_stats — this
          // page is pre-draft, and the two diverge once games are played.
          sos_rank:            pre.sos_rank ?? null,
          prev_year_record:    pre.prev_year_record ?? null,
          prev_year_ats:       pre.prev_year_ats ?? null,
          confOdds:            pre.conf_odds ?? null,
          predictedWins:       pre.predicted_wins ?? null,
          powerRank:           pre.power_rank ?? null,
          retStarters:         pre.ret_starters ?? null,
        };
      }),
  [authTeams, pickedTeamIds, preseasonData, rankOf]);

  const allTeams = useMemo(() =>
    Object.fromEntries(teams.map((t) => [t.school, t])),
  [teams]);

  if (isDraftComplete) return <Navigate to="/home" />;

  const handleToggleBoard = (team) => {
    const result = toggle(team.id);
    if (!result.ok && result.reason === "full") {
      setBoardNotice(`Big board is full (${limit} teams) — remove one before adding ${team.school}.`);
    } else {
      setBoardNotice("");
    }
  };

  const sortBy = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc",
    }));
  };

  const filteredTeams = teams.filter((team) => {
    const matchesSearch = team.school.toLowerCase().includes(searchQuery.toLowerCase());
    const p4 = ["SEC", "ACC", "Big Ten", "Big 12"];
    if (conferenceFilter === "All") return matchesSearch;
    if (conferenceFilter === "P4") return matchesSearch && p4.includes(team.conference);
    if (conferenceFilter === "Available") return matchesSearch && !team.isDrafted;
    if (conferenceFilter === "Drafted") return matchesSearch && team.isDrafted;
    if (conferenceFilter === "Board") return matchesSearch && team.boardRank != null;
    return matchesSearch && team.conference === conferenceFilter;
  });

  const sortedTeams = [...filteredTeams].sort((a, b) => {
    const aValue = sortValue(a[sortConfig.key], sortConfig.key);
    const bValue = sortValue(b[sortConfig.key], sortConfig.key);

    if (aValue == null && bValue == null) return 0;
    if (aValue == null) return 1;
    if (bValue == null) return -1;

    if (sortConfig.key === "school") {
      return sortConfig.direction === "asc"
        ? a.school.localeCompare(b.school)
        : b.school.localeCompare(a.school);
    }

    if (typeof aValue === "number" && typeof bValue === "number") {
      return sortConfig.direction === "asc" ? aValue - bValue : bValue - aValue;
    }

    return sortConfig.direction === "asc"
      ? aValue.toString().localeCompare(bValue.toString())
      : bValue.toString().localeCompare(aValue.toString());
  });

  const uniqueConferences = [...new Set(teams.map((team) => team.conference))].sort();
  const availableCount = teams.filter((t) => !t.isDrafted).length;
  const draftedCount   = teams.filter((t) => t.isDrafted).length;

  const TeamLogo = ({ teamName, size = 24, isDrafted = false }) => {
    const team = allTeams[teamName];
    return (
      <div style={{ opacity: isDrafted ? 0.4 : 1, filter: isDrafted ? "grayscale(100%)" : "none", flexShrink: 0 }}>
        <TeamLogoImage teamName={teamName} primaryColor={team?.colors?.primary || team?.color} size={size} />
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">

      <BottomNavBar />
      <LeagueNav />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 pb-24">

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-1">
            <span className="text-2xl">🔍</span>
            <h1 className="text-2xl font-black text-gray-900">Team Scouting</h1>
          </div>
          <p className="text-sm text-gray-500 pl-10">
            {filteredTeams.length} teams · {availableCount} available, {draftedCount} drafted · big board {count}/{limit}
          </p>
        </div>

        {boardNotice && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-amber-700 text-sm mb-4">
            {boardNotice}
          </div>
        )}

        {/* Filters */}
        <div className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm mb-5">
          <div className="flex flex-wrap gap-5">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Search Teams
              </label>
              <input
                type="text"
                placeholder="Search by school name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="px-4 py-2.5 text-gray-900 bg-white border border-gray-200 rounded-xl w-64 outline-none transition-all duration-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 placeholder:text-gray-400 text-sm"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Conference
              </label>
              <select
                value={conferenceFilter}
                onChange={(e) => setConferenceFilter(e.target.value)}
                className="px-4 py-2.5 text-gray-900 bg-white border border-gray-200 rounded-xl cursor-pointer outline-none transition-all duration-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 text-sm"
              >
                <option value="All">All Conferences</option>
                <option value="P4">Power 4 Only</option>
                <option value="Available">Available Only</option>
                <option value="Drafted">Drafted Only</option>
                <option value="Board">My Big Board</option>
                {uniqueConferences.map((conf) => (
                  <option key={conf} value={conf}>{conf}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Table Container */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-gray-100 bg-gray-50">
            <h3 className="text-base font-bold text-gray-900 mb-0.5">FBS Team Database</h3>
            <p className="text-xs text-gray-500">
              Click any column header to sort · Click team name to view details · Greyed out teams are drafted ·
              Star up to {limit} teams to build your big board
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[1180px]" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ backgroundColor: "#0072BC", color: "white" }}>
                  <th style={{
                    ...thStyle,
                    textAlign: "center",
                    width: "40px",
                    padding: "11px 4px",
                    position: "sticky",
                    left: "0",
                    zIndex: "20",
                    backgroundColor: "#0072BC",
                    borderRight: "none"
                  }}>
                    ★
                  </th>

                  <th style={{
                    ...thStyle,
                    textAlign: "center",
                    width: "40px",
                    position: "sticky",
                    left: "40px",
                    zIndex: "20",
                    backgroundColor: "#0072BC",
                    borderRight: "none"
                  }}>
                  </th>

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
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.1)"}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
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

                  <Th label="Board"        sortKey="boardRank"           sortBy={sortBy} sortConfig={sortConfig} />
                  <Th label="Conf Odds"    sortKey="confOdds"            sortBy={sortBy} sortConfig={sortConfig} />
                  <Th label="Power Rank"   sortKey="powerRank"           sortBy={sortBy} sortConfig={sortConfig} />
                  <Th label="SOS Rank"     sortKey="sos_rank"            sortBy={sortBy} sortConfig={sortConfig} />
                  <Th label="Ret. Starters (%)" sortKey="retStarters"    sortBy={sortBy} sortConfig={sortConfig} />
                  <Th label="Pred. Wins"   sortKey="predictedWins"       sortBy={sortBy} sortConfig={sortConfig} />
                  <Th label="2025 Record"  sortKey="prev_year_record"    sortBy={sortBy} sortConfig={sortConfig} />
                  <Th label="2025 ATS"     sortKey="prev_year_ats"       sortBy={sortBy} sortConfig={sortConfig} />
                </tr>
              </thead>
              <tbody>
                {sortedTeams.map((team, i) => (
                  <tr
                    key={i}
                    style={{
                      backgroundColor: team.isDrafted
                        ? '#FEF2F2'
                        : i % 2 === 0
                          ? '#FFFFFF'
                          : '#F9FAFB',
                      opacity: team.isDrafted ? 0.6 : 1,
                      cursor: 'default',
                    }}
                    onMouseEnter={(e) => { if (!team.isDrafted) e.currentTarget.style.backgroundColor = '#EFF6FF'; }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = team.isDrafted
                        ? '#FEF2F2'
                        : i % 2 === 0 ? '#FFFFFF' : '#F9FAFB';
                    }}
                  >
                    <td style={{
                      ...tdStyle,
                      textAlign: "center",
                      width: "40px",
                      padding: "11px 4px",
                      position: "sticky",
                      left: "0",
                      zIndex: "1",
                      backgroundColor: "inherit",
                    }}>
                      <BoardStar
                        team={team}
                        starred={isOnBoard(team.id)}
                        onToggle={handleToggleBoard}
                      />
                    </td>

                    <td style={{
                      ...tdStyle,
                      textAlign: "center",
                      width: "40px",
                      paddingRight: "4px",
                      position: "sticky",
                      left: "40px",
                      zIndex: "1",
                      backgroundColor: "inherit",
                    }}>
                      <div style={{ display: "flex", justifyContent: "center" }}>
                        <TeamLogo teamName={team.school} size={24} isDrafted={team.isDrafted} />
                      </div>
                    </td>

                    <td style={{ ...tdStyle, textAlign: "left", paddingLeft: "4px", width: "210px" }}>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "2px" }}>
                          <div
                            onClick={() => setDrawerTeam(team.school)}
                            style={{
                              cursor: "pointer",
                              color: team.isDrafted ? "#9CA3AF" : "#0072BC",
                              fontWeight: "600",
                              fontSize: "14px"
                            }}
                            onMouseEnter={(e) => e.target.style.textDecoration = "underline"}
                            onMouseLeave={(e) => e.target.style.textDecoration = "none"}
                          >
                            {team.school}
                          </div>
                          {team.isDrafted && (
                            <span style={{
                              backgroundColor: "#FEE2E2",
                              color: "#DC2626",
                              padding: "2px 6px",
                              borderRadius: "4px",
                              fontSize: "10px",
                              fontWeight: "600",
                              textTransform: "uppercase",
                            }}>
                              DRAFTED
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: "11px", color: "#9CA3AF", fontWeight: "500" }}>
                          {team.conference}
                        </div>
                      </div>
                    </td>

                    <td style={tdStyle}>
                      {team.boardRank != null ? (
                        <span style={{
                          backgroundColor: "#DBEAFE",
                          color: "#1D4ED8",
                          padding: "2px 7px",
                          borderRadius: "4px",
                          fontSize: "12px",
                          fontWeight: "700",
                        }}>
                          #{team.boardRank}
                        </span>
                      ) : "-"}
                    </td>

                    <td style={tdStyle}>
                      {team.confOdds != null ? (
                        <span style={{
                          backgroundColor: team.confOdds <= 500 ? "#DCFCE7" : team.confOdds <= 2500 ? "#FEF3C7" : "#FEE2E2",
                          color: team.confOdds <= 500 ? "#166534" : team.confOdds <= 2500 ? "#92400E" : "#991B1B",
                          padding: "2px 6px",
                          borderRadius: "4px",
                          fontSize: "12px",
                          fontWeight: "600",
                        }}>
                          {formatAmericanOdds(team.confOdds)}
                        </span>
                      ) : "-"}
                    </td>

                    <td style={tdStyle}>{team.powerRank ?? "-"}</td>

                    <td style={tdStyle}>{team.sos_rank ?? "-"}</td>

                    <td style={tdStyle}>{team.retStarters ?? "-"}</td>

                    <td style={tdStyle}>
                      {team.predictedWins != null
                        ? <span style={{ fontWeight: "600", color: "#111827" }}>{team.predictedWins}</span>
                        : "-"}
                    </td>

                    <td style={tdStyle}>{team.prev_year_record ?? "-"}</td>

                    <td style={tdStyle}>{team.prev_year_ats ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {sortedTeams.length === 0 && (
            <div className="p-10 text-center">
              <p className="text-gray-500 text-sm">No teams found matching your criteria.</p>
            </div>
          )}
        </div>
      </div>
      <TeamDrawer teamName={drawerTeam} onClose={() => setDrawerTeam(null)} />
    </div>
  );
}

// "9-3" / "9-3-1" sort by win pct, not alphabetically ("10-3" < "9-3" as text).
const RECORD_KEYS = new Set(["prev_year_record", "prev_year_ats"]);

const sortValue = (value, key) => {
  if (!RECORD_KEYS.has(key) || typeof value !== "string") return value;
  const parts = value.split("-").map(Number);
  if (parts.length < 2 || parts.some(Number.isNaN)) return value;
  const [wins, losses, ties = 0] = parts;
  const games = wins + losses + ties;
  return games > 0 ? (wins + ties * 0.5) / games : null;
};

// A drafted team can't be starred — the 018 trigger strips it from every board
// in the league the moment the pick lands.
const BoardStar = ({ team, starred, onToggle }) => (
  <button
    onClick={() => onToggle(team)}
    disabled={team.isDrafted}
    title={
      team.isDrafted ? "Already drafted"
        : starred ? "Remove from big board"
        : "Add to big board"
    }
    style={{
      background: "none",
      border: "none",
      padding: "2px",
      cursor: team.isDrafted ? "not-allowed" : "pointer",
      opacity: team.isDrafted ? 0.25 : 1,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      margin: "0 auto",
    }}
  >
    <Star
      size={16}
      color={starred ? "#2563EB" : "#D1D5DB"}
      fill={starred ? "#2563EB" : "none"}
    />
  </button>
);

const Th = ({ label, sortKey, sortBy, sortConfig }) => (
  <th
    onClick={() => sortBy(sortKey)}
    style={{ ...thStyle, cursor: "pointer" }}
    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.1)"}
    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
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
  borderRight: "1px solid rgba(255,255,255,0.2)",
  padding: "11px 16px",
  textAlign: "left",
  fontWeight: "700",
  fontSize: "11px",
  textTransform: "uppercase",
  letterSpacing: "0.5px",
  whiteSpace: "nowrap",
};

const tdStyle = {
  padding: "11px 16px",
  borderBottom: "1px solid #F3F4F6",
  verticalAlign: "middle",
  color: "#111827",
  textAlign: "center",
};

export default Scouting;
