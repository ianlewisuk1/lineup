import React, { useEffect, useState, useRef } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db, auth } from "../firebase/firebase";
import { useNavigate, useParams, Link } from "react-router-dom";
import { Search, Filter, ChevronDown, BarChart3, ChevronUp } from "lucide-react";
import BottomNavBar from "../components/BottomNavBar";

function Stats() {
  const { leagueId } = useParams();
  const navigate = useNavigate();
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [conferenceList, setConferenceList] = useState([]);
  const [activeConference, setActiveConference] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStat, setSelectedStat] = useState("gamePoints");
  const [sortColumn, setSortColumn] = useState("gamePoints");
  const [sortDirection, setSortDirection] = useState("descending");

  // All available stats with labels
  const statOptions = [
    { value: "gamePoints", label: "Fantasy Points", type: "number" },
    { value: "record", label: "Overall Record", type: "string" },
    { value: "confRecord", label: "Conference Record", type: "string" },
    { value: "ats", label: "ATS Record", type: "string" },
    { value: "avgPointsFor", label: "Avg Points For", type: "number" },
    { value: "avgPointsAgainst", label: "Avg Points Against", type: "number" },
    { value: "sosRank", label: "SOS Rank", type: "number" },
    { value: "philMetrics", label: "Phil Metrics Score", type: "number" },
    { value: "prevYearPoints", label: "2024 Points", type: "number" },
    { value: "nextOpponent", label: "Next Opponent", type: "string" }
  ];

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
      
      switch (key) {
        case "gamePoints":
          return Number(season.gamePoints) || 0;
        case "avgPointsFor":
          return Number(season.avgPointsFor) || 0;
        case "avgPointsAgainst":
          return Number(season.avgPointsAgainst) || 0;
        case "sosRank":
          return Number(team.sosRank) || 999;
        case "philMetrics":
          return Number(team.philMetrics) || 999;
        case "prevYearPoints":
          return Number(team.prevYearPoints) || 0;
        case "nextOpponent":
          return season.nextOpponent || "zzz";
        case "record":
        case "confRecord":
        case "ats":
          return season[key] || "zzz";
        default:
          return season[key] || "";
      }
    };

    const aVal = getValue(a, sortColumn);
    const bVal = getValue(b, sortColumn);

    const currentStat = statOptions.find(s => s.value === sortColumn) || 
                      { type: sortColumn === "school" ? "string" : "string" };
    
    if (currentStat?.type === "number") {
      return sortDirection === "ascending" ? aVal - bVal : bVal - aVal;
    }
    
    const aStr = String(aVal).toLowerCase();
    const bStr = String(bVal).toLowerCase();
    
    if (sortDirection === "ascending") {
      return aStr.localeCompare(bStr);
    } else {
      return bStr.localeCompare(aStr);
    }
  });

  const handleTeamClick = (teamName) => {
    navigate(`/${leagueId}/team/${encodeURIComponent(teamName)}`);
  };

  const handleColumnSort = (column) => {
    if (sortColumn === column) {
      // Same column - toggle direction
      setSortDirection(prev => prev === "ascending" ? "descending" : "ascending");
    } else {
      // New column - set as sort column and default to descending for numbers, ascending for strings
      setSortColumn(column);
      const stat = statOptions.find(s => s.value === column);
      const isString = column === "school" || stat?.type === "string";
      setSortDirection(isString ? "ascending" : "descending");
    }
  };

  const toggleSort = () => {
    // Set the sort column to the currently selected stat and toggle direction
    setSortColumn(selectedStat);
    setSortDirection(prev => prev === "ascending" ? "descending" : "ascending");
  };

  const formatNextOpponent = (team) => {
    const cs = team.currentSeason;
    if (!cs || !cs.nextOpponent) return "—";

    const spread = cs.nextOpponentSpread ?? "TBD";

    let prefix = "?";
    if (cs.nextGameIsHome === true) prefix = "vs";
    else if (cs.nextGameIsHome === false) prefix = "@";

    return `${prefix} ${cs.nextOpponent} (${spread})`;
  };

  const getStatValue = (team, statKey) => {
    const season = team.currentSeason || {};
    
    switch (statKey) {
      case "gamePoints":
        return season.gamePoints ?? 0;
      case "avgPointsFor":
        return season.avgPointsFor ?? "—";
      case "avgPointsAgainst":
        return season.avgPointsAgainst ?? "—";
      case "sosRank":
        return team.sosRank ?? "—";
      case "philMetrics":
        return team.philMetrics !== undefined && team.philMetrics !== null ? team.philMetrics : "—";
      case "prevYearPoints":
        return team.prevYearPoints ?? "—";
      case "nextOpponent":
        return formatNextOpponent(team);
      case "record":
      case "confRecord":
      case "ats":
        return season[statKey] || "—";
      default:
        return "—";
    }
  };

  const getStatColor = (statKey, value) => {
    switch (statKey) {
      case "gamePoints":
      case "prevYearPoints":
      case "avgPointsFor":
        return "text-green-400"; // Green for positive stats
      case "avgPointsAgainst":
        return "text-red-400"; // Red for points against
      case "sosRank":
      case "philMetrics":
        return "text-purple-400"; // Purple for rankings
      default:
        return "text-white"; // Default white
    }
  };

  const handleLogout = async () => {
    if (window.confirm("Are you sure you want to log out?")) {
      try {
        await auth.signOut();
        navigate("/");
      } catch (err) {
        console.error("Logout error:", err);
      }
    }
  };

  const currentStatLabel = statOptions.find(s => s.value === selectedStat)?.label || "Stat";

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-4 sm:left-10 w-48 sm:w-72 h-48 sm:h-72 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full blur-3xl animate-pulse"></div>
        </div>
        <div className="relative z-10 flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="text-4xl mb-4 animate-spin">📊</div>
            <p className="text-xl text-white/80">Loading FBS stats...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white">
      {/* Animated Background Elements */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-20 left-4 sm:left-10 w-48 sm:w-72 h-48 sm:h-72 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-20 right-4 sm:right-10 w-56 sm:w-96 h-56 sm:h-96 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full blur-3xl animate-pulse delay-1000"></div>
      </div>

      <BottomNavBar leagueId={leagueId} isDraftComplete={true} />

      {/* Navigation */}
      <nav className="relative z-10 flex justify-between items-center p-4 sm:p-6 lg:p-8">
        <Link to="/home" className="flex items-center space-x-3">
          <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-r from-purple-500 to-blue-500 rounded-lg flex items-center justify-center font-bold text-lg sm:text-xl">
            L
          </div>
          <span className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
            Lineup
          </span>
        </Link>
        <div className="flex items-center space-x-4">
          <button 
            onClick={handleLogout}
            className="px-4 py-2 text-sm sm:text-base text-white/80 hover:text-white transition-colors duration-300 font-medium"
          >
            Logout
          </button>
        </div>
      </nav>

      {/* Main Content */}
      <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 py-4 pb-24">
        
        {/* Header */}
        <div className="text-center mb-8">
          <div className="mb-4">
            <span className="inline-block text-4xl sm:text-5xl mb-2">📊</span>
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black mb-2 leading-tight">
            <span className="bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
              FBS Team Stats
            </span>
          </h1>
          <p className="text-lg sm:text-xl text-white/80">
            {sortedTeams.length} teams • Sorted by {sortColumn === "school" ? "Team Name" : currentStatLabel}
          </p>
        </div>

        {/* Controls */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20 mb-8">
          {/* First Row: Search and Conference */}
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-4 top-1/2 transform -translate-y-1/2 text-white/60 pointer-events-none z-10" />
              <input
                type="text"
                placeholder="Search teams..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-12 pl-12 pr-4 bg-white/10 backdrop-blur-sm border-2 border-white/30 rounded-xl text-white placeholder-white/60 transition-all duration-300 hover:border-blue-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20 focus:outline-none"
              />
            </div>

            <div className="flex-1 relative">
              <Filter size={16} className="absolute left-4 top-1/2 transform -translate-y-1/2 text-white/60 pointer-events-none z-10" />
              <select
                value={activeConference}
                onChange={(e) => setActiveConference(e.target.value)}
                className="w-full h-12 pl-12 pr-4 bg-white/10 backdrop-blur-sm border-2 border-white/30 rounded-xl text-white transition-all duration-300 hover:border-blue-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20 focus:outline-none appearance-none cursor-pointer"
                style={{
                  backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='rgba(255,255,255,0.6)' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6,9 12,15 18,9'%3e%3c/polyline%3e%3c/svg%3e")`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 1rem center',
                  backgroundSize: '1rem'
                }}
              >
                {conferenceList.map(conf => (
                  <option key={conf} value={conf} className="bg-slate-800 text-white">
                    {conf}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Second Row: Stat Selector and Sort */}
          <div className="flex flex-col sm:flex-row gap-4 items-center">
            <div className="flex-1 w-full relative">
              <BarChart3 size={16} className="absolute left-4 top-1/2 transform -translate-y-1/2 text-white/60 pointer-events-none z-10" />
              <select
                value={selectedStat}
                onChange={(e) => setSelectedStat(e.target.value)}
                className="w-full h-12 pl-12 pr-4 bg-white/10 backdrop-blur-sm border-2 border-white/30 rounded-xl text-white transition-all duration-300 hover:border-blue-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20 focus:outline-none appearance-none cursor-pointer"
                style={{
                  backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='rgba(255,255,255,0.6)' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6,9 12,15 18,9'%3e%3c/polyline%3e%3c/svg%3e")`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 1rem center',
                  backgroundSize: '1rem'
                }}
              >
                {statOptions.map(stat => (
                  <option key={stat.value} value={stat.value} className="bg-slate-800 text-white">
                    {stat.label}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={toggleSort}
              className="w-full sm:w-auto px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 rounded-xl text-white font-semibold transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-blue-500/40 flex items-center justify-center gap-2"
            >
              Sort {sortDirection === "ascending" ? "▲" : "▼"}
            </button>
          </div>
        </div>

        {/* Stats List */}
        {sortedTeams.length === 0 ? (
          <div className="relative z-50 bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20 mb-8">
            <div className="text-4xl mb-4">🔍</div>
            <p className="text-white/80 text-lg">
              {searchQuery ? 
                `No teams found matching "${searchQuery}"` : 
                "No teams available"
              }
            </p>
          </div>
        ) : (
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl border border-white/20 overflow-hidden">
            {/* Clickable Header */}
            <div className="p-4 bg-white/10 border-b-2 border-white/20 flex justify-between items-center">
              <button
                onClick={() => handleColumnSort("school")}
                className="flex items-center gap-2 text-white font-semibold hover:text-blue-400 transition-colors duration-200"
              >
                Team (Conference)
                {sortColumn === "school" && (
                  sortDirection === "ascending" ? 
                    <ChevronUp size={16} /> : 
                    <ChevronDown size={16} />
                )}
              </button>
              
              <button
                onClick={() => handleColumnSort(selectedStat)}
                className="flex items-center gap-2 text-white font-semibold hover:text-blue-400 transition-colors duration-200"
              >
                {currentStatLabel}
                {sortColumn === selectedStat && (
                  sortDirection === "ascending" ? 
                    <ChevronUp size={16} /> : 
                    <ChevronDown size={16} />
                )}
              </button>
            </div>

            {/* Team Rows */}
            <div className="divide-y divide-white/10">
              {sortedTeams.map((team, index) => (
                <div
                  key={team.school}
                  className="p-4 flex justify-between items-center hover:bg-white/10 transition-colors duration-200"
                >
                  <div className="flex-1">
                    <div
                      onClick={() => handleTeamClick(team.school)}
                      className="text-blue-400 hover:text-blue-300 cursor-pointer font-semibold text-base mb-1 transition-colors duration-200"
                    >
                      {team.school}
                    </div>
                    <div className="text-white/60 text-sm">
                      {team.conference || "—"}
                    </div>
                  </div>

                  <div className={`font-bold text-lg text-right min-w-20 ${getStatColor(selectedStat, getStatValue(team, selectedStat))}`}>
                    {getStatValue(team, selectedStat)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Stats;