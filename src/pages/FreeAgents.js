import React, { useEffect, useState, useRef } from "react";
import { supabase } from "../supabase/supabase";
import { useParams } from "react-router-dom";
import { Plus, Search, Filter, ChevronDown } from "lucide-react";
import BottomNavBar from "../components/BottomNavBar";
import LeagueNav from "../components/LeagueNav";
import { useLeague } from "../context/LeagueContext";
import { useModalState } from "../hooks/useModalState";
import { parseGamesPlayed as parseRecord, calculateAverage } from "../utils/teamStats";
import { useSeasonConfig } from "../hooks/useSeasonConfig";
import TeamLogoImage from "../components/league/TeamLogoImage";
import TeamDrawer from "../components/league/TeamDrawer";

// Compact Sort Button Component
const SortButton = ({ label, sortKey, sortConfig, onSort }) => (
  <button
    onClick={() => onSort(sortKey)}
    className={`
      px-3 py-2 border rounded-lg text-xs font-medium cursor-pointer flex items-center gap-1 transition-all duration-200
      ${sortConfig.key === sortKey
        ? 'bg-blue-500/20 border-blue-400/50 text-blue-200'
        : 'bg-white/10 border-white/20 text-white/70 hover:bg-white/20'
      }
    `}
  >
    {label}
    <span className="text-xs">
      {sortConfig.key === sortKey ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '⇅'}
    </span>
  </button>
);

function FreeAgents() {
  const { leagueId } = useParams();
  const { currentUserId, currentMemberId, currentWeek } = useLeague();
  const [teamsByConference, setTeamsByConference] = useState({});
  const [conferenceList, setConferenceList] = useState([]);
  const [activeConference, setActiveConference] = useState("National");
  const [draftedTeams, setDraftedTeams] = useState({});
  const [loading, setLoading] = useState(true);
  const [userTeams, setUserTeams] = useState([]);
  const [drawerTeam, setDrawerTeam] = useState(null);
  const [selectedDropTeam, setSelectedDropTeam] = useState("");
  const [pendingAddTeam, setPendingAddTeam] = useState("");
  const [showSwapUI, setShowSwapUI] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [teamToAdd, setTeamToAdd] = useState(null);
  const [sortConfig, setSortConfig] = useState({ key: "school", direction: "asc" });
  const [searchQuery, setSearchQuery] = useState("");

  const { config: seasonConfig, loading: configLoading } = useSeasonConfig();
  const faLocked = seasonConfig?.faLocked || false;

  const {
    showSuccessModal, showErrorModal,
    modalTitle, modalMessage,
    showSuccess, showError, closeModals,
  } = useModalState();

  // MODIFIED: Added config fetch to initial useEffect
  useEffect(() => {
    const fetchData = async () => {

      const user = { id: currentUserId };
      if (!currentUserId) return;

      const { data: teamsData } = await supabase.from('teams').select('*');
      const { data: memberRows } = await supabase
        .from('league_members')
        .select('id, user_id, team_name')
        .eq('league_id', leagueId);

      // Build member id→name map
      const memberNameMap = {};
      (memberRows || []).forEach(row => {
        memberNameMap[row.id] = row.team_name || "Unknown";
      });

      const teamsMap = {};
      const drafted = {};

      // Build drafted teams object from weekly_lineups for the current week
      const week = currentWeek || 1;
      const { data: lineupRows } = await supabase
        .from('weekly_lineups')
        .select('member_id, starters, bench')
        .eq('league_id', leagueId)
        .eq('week', week);

      (lineupRows || []).forEach(row => {
        const starters = row.starters || [];
        const bench = row.bench || [];
        const ownerName = memberNameMap[row.member_id] || "Unknown";
        const current = [...starters, ...bench];
        current.forEach(teamId => {
          if (teamId && teamId.trim()) {
            drafted[teamId] = {
              ownerName,
              teamName: ownerName,
            };
          }
        });
      });

      // Build teams map with enhanced data structure
      (teamsData || []).forEach(data => {
        if ((data.classification || "").toUpperCase() !== "FBS") return;

        const conf = data.conference || "Unknown";
        if (!teamsMap[conf]) teamsMap[conf] = [];

        // ENHANCED: Add all the data fields that Stats page uses
        teamsMap[conf].push({
          id: data.id,
          ...data,
          logo: data.logo_filename ? `/logos/${data.logo_filename}` : null,
          color: data.color || null,
          currentSeason: {}
        });
      });

      // Set state
      const sortedConf = Object.keys(teamsMap).sort();
      setConferenceList(["National", ...sortedConf]);
      setTeamsByConference(teamsMap);
      setActiveConference("National");
      setDraftedTeams(drafted);

      // Get current user's teams
      if (!user) {
        setLoading(false);
        return;
      }

      // Load current user's lineup from weekly_lineups
      if (currentMemberId) {
        const { data: userLineupRow } = await supabase
          .from('weekly_lineups')
          .select('starters, bench')
          .eq('league_id', leagueId)
          .eq('member_id', currentMemberId)
          .eq('week', week)
          .single();
        const starters = userLineupRow?.starters || [];
        const bench = userLineupRow?.bench || [];
        setUserTeams([...starters, ...bench].filter(Boolean));
      }

      setLoading(false);
    };

    fetchData();
  }, [leagueId]);

  const handleTeamClick = (teamName) => {
    setDrawerTeam(teamName);
  };

  // MODIFIED: Added free agency lock check
  const handleAddTeam = (team) => {
    // Check if free agency is locked
    if (faLocked) {
      showError(
        "Free Agency Closed",
        "Free agent moves are currently locked. Please try again later when the window reopens."
      );
      return;
    }

    if (!currentUserId) return;

    if (userTeams.length < 7) {
      setTeamToAdd(team);
      setShowAddModal(true);
    } else {
      setPendingAddTeam(team.school);
      setSelectedDropTeam("");
      setShowSwapUI(true);
    }
  };

  const confirmAddTeam = async () => {
    if (!teamToAdd) return;

    // Double-check lock status before proceeding
    if (faLocked) {
      showError(
        "Free Agency Closed",
        "Free agent moves are currently locked. Please try again later when the window reopens."
      );
      setShowAddModal(false);
      setTeamToAdd(null);
      return;
    }

    try {
      if (!currentUserId || !currentMemberId) return;

      const actualCurrentWeek = currentWeek || seasonConfig?.currentWeek || 1;

      const { data: lineupRow } = await supabase
        .from('weekly_lineups')
        .select('starters, bench')
        .eq('league_id', leagueId)
        .eq('member_id', currentMemberId)
        .eq('week', actualCurrentWeek)
        .single();

      const starters = [...(lineupRow?.starters || Array(5).fill(null))];
      const bench = [...(lineupRow?.bench || Array(2).fill(null))];

      // NORMALIZE THE TEAM NAME BEFORE SAVING
      const normalizedTeamName = teamToAdd.school
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/&/g, "-")
        .replace(/[^a-z0-9\-]/g, "");

      const emptyStarterIndex = starters.findIndex(t => !t);
      const emptyBenchIndex = bench.findIndex(t => !t);

      if (emptyStarterIndex !== -1) {
        starters[emptyStarterIndex] = normalizedTeamName;
      } else if (emptyBenchIndex !== -1) {
        bench[emptyBenchIndex] = normalizedTeamName;
      } else {
        showError("Roster Full", "Your roster is full! Please drop a team first.");
        return;
      }

      const { error: updateError } = await supabase
        .from('weekly_lineups')
        .upsert({
          league_id: leagueId,
          member_id: currentMemberId,
          week: actualCurrentWeek,
          starters,
          bench,
        }, { onConflict: 'league_id,member_id,week' });
      if (updateError) throw updateError;

      // Fetch team name for move history
      const { data: memberRow } = await supabase
        .from('league_members')
        .select('team_name')
        .eq('id', currentMemberId)
        .single();

      // Log the move
      await supabase.from('move_history').insert({
        league_id: leagueId,
        member_id: currentMemberId,
        team_name: memberRow?.team_name || "",
        picked_up: teamToAdd.school,
        dropped: null,
        move_type: "pickup",
        week: actualCurrentWeek,
        created_at: new Date().toISOString()
      });

      setUserTeams([...starters, ...bench].filter(Boolean));

      // Update draftedTeams to reflect the new team ownership
      setDraftedTeams(prev => ({
        ...prev,
        [normalizedTeamName]: {
          ownerName: memberRow?.team_name || "You",
          teamName: memberRow?.team_name || "Your Team"
        }
      }));

      setShowAddModal(false);
      setTeamToAdd(null);

      showSuccess("Team Added!", `${teamToAdd.school} has been successfully added to your lineup!`);

    } catch (error) {
      console.error("Error adding team:", error);
      showError("Error", "Failed to add team. Please try again.");
    }
  };

  const handleConfirmSwap = async () => {
    if (!selectedDropTeam || !pendingAddTeam) return;

    // Double-check lock status before proceeding
    if (faLocked) {
      showError(
        "Free Agency Closed",
        "Free agent moves are currently locked. Please try again later when the window reopens."
      );
      setShowSwapUI(false);
      setPendingAddTeam("");
      setSelectedDropTeam("");
      return;
    }

    try {
      if (!currentUserId || !currentMemberId) return;

      const actualCurrentWeek = currentWeek || seasonConfig?.currentWeek || 1;

      const { data: lineupRow } = await supabase
        .from('weekly_lineups')
        .select('starters, bench')
        .eq('league_id', leagueId)
        .eq('member_id', currentMemberId)
        .eq('week', actualCurrentWeek)
        .single();

      const starters = [...(lineupRow?.starters || Array(5).fill(null))];
      const bench = [...(lineupRow?.bench || Array(2).fill(null))];

      // NORMALIZE THE NEW TEAM NAME
      const normalizedNewTeam = pendingAddTeam
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/&/g, "-")
        .replace(/[^a-z0-9\-]/g, "");

      const starterIndex = starters.findIndex(t => t === selectedDropTeam);
      const benchIndex = bench.findIndex(t => t === selectedDropTeam);

      if (starterIndex !== -1) {
        starters[starterIndex] = normalizedNewTeam;
      } else if (benchIndex !== -1) {
        bench[benchIndex] = normalizedNewTeam;
      }

      const { error: updateError } = await supabase
        .from('weekly_lineups')
        .upsert({
          league_id: leagueId,
          member_id: currentMemberId,
          week: actualCurrentWeek,
          starters,
          bench,
        }, { onConflict: 'league_id,member_id,week' });
      if (updateError) throw updateError;

      // Get display name for dropped team
      const droppedTeamData = Object.values(teamsByConference).flat().find(team =>
        team.school?.toLowerCase()
          .replace(/\s+/g, "-")
          .replace(/&/g, "-")
          .replace(/[^a-z0-9\-]/g, "") === selectedDropTeam
      );
      const droppedTeamName = droppedTeamData?.school || selectedDropTeam;

      // Fetch team name for move history
      const { data: memberRow } = await supabase
        .from('league_members')
        .select('team_name')
        .eq('id', currentMemberId)
        .single();

      // Log the move
      await supabase.from('move_history').insert({
        league_id: leagueId,
        member_id: currentMemberId,
        team_name: memberRow?.team_name || "",
        picked_up: pendingAddTeam,
        dropped: droppedTeamName,
        move_type: "swap",
        week: actualCurrentWeek,
        created_at: new Date().toISOString()
      });

      setUserTeams([...starters, ...bench].filter(Boolean));

      // Update draftedTeams to reflect the swap
      setDraftedTeams(prev => {
        const updated = { ...prev };
        // Remove the dropped team from drafted teams (make it available again)
        delete updated[selectedDropTeam];
        // Add the new team as drafted by this user
        updated[normalizedNewTeam] = {
          ownerName: memberRow?.team_name || "You",
          teamName: memberRow?.team_name || "Your Team"
        };
        return updated;
      });

      setShowSwapUI(false);
      setPendingAddTeam("");
      setSelectedDropTeam("");

      // Use the droppedTeamName that was already calculated above
      showSuccess("Team Swapped!", `Successfully swapped ${droppedTeamName} for ${pendingAddTeam}!`);

    } catch (error) {
      console.error("Error swapping teams:", error);
      showError("Error", "Failed to swap teams. Please try again.");
    }
  };

  const getVisibleFreeAgents = () => {
    // Get list of teams by conference
    let allTeams = activeConference === "National"
      ? Object.values(teamsByConference).flat()
      : teamsByConference[activeConference] || [];

    // Filter out drafted teams by matching school names
    const teams = allTeams.filter(team => {
      // Normalize the team's school name to match the format in drafted teams
      const normalizedSchoolName = team.school
        ?.toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/&/g, "-")
        .replace(/[^a-z0-9\-]/g, "");

      // Check if this normalized school name is in the drafted teams
      const isDrafted = draftedTeams[normalizedSchoolName];

      return !isDrafted;
    });

    // Apply search query
    if (searchQuery) {
      return teams.filter(team =>
        team.school.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    return teams;
  };

  const sortedTeams = [...getVisibleFreeAgents()].sort((a, b) => {
    const key = sortConfig.key;
    let aValue, bValue;

    if (key === "currentSeason.record") {
      aValue = a.currentSeason?.record || "0-0";
      bValue = b.currentSeason?.record || "0-0";
    } else if (key === "currentSeason.nextOpponent") {
      aValue = a.currentSeason?.nextOpponent || "";
      bValue = b.currentSeason?.nextOpponent || "";
    } else if (key === "points") {
      aValue = a.currentSeason?.gamePoints || 0;
      bValue = b.currentSeason?.gamePoints || 0;
    } else {
      aValue = a[key] || "";
      bValue = b[key] || "";
    }

    if (typeof aValue === "number" && typeof bValue === "number") {
      return sortConfig.direction === "asc" ? aValue - bValue : bValue - aValue;
    }

    return sortConfig.direction === "asc"
      ? String(aValue).localeCompare(String(bValue))
      : String(bValue).localeCompare(String(aValue));
  });

  const toggleSort = (key) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc",
    }));
  };

  // ENHANCED: Improved next game formatting that matches Stats page logic
  const formatNextGame = (season) => {
    if (!season?.nextOpponent) return "—";

    const isHome = season.nextGameIsHome;
    const spread = season.nextOpponentSpreadDisplay ?? season.nextOpponentSpread ?? "TBD";
    const prefix = isHome ? "vs" : "@";

    // Format the date if available
    let dateStr = "";
    if (season.nextGameDate) {
      try {
        // Handle both string and object date formats
        const date = typeof season.nextGameDate === 'string'
          ? new Date(season.nextGameDate)
          : season.nextGameDate.toDate ? season.nextGameDate.toDate() : new Date(season.nextGameDate);

        if (!isNaN(date.getTime())) {
          const month = date.getMonth() + 1;
          const day = date.getDate();
          dateStr = ` • ${month}/${day}`;
        }
      } catch (error) {
        // If date parsing fails, just show without date
        console.warn("Date parsing error for team:", error);
        dateStr = "";
      }
    }

    return `${prefix} ${season.nextOpponent} (${spread})${dateStr}`;
  };

  // MODIFIED: Team Card Component with lock status check for Add button
  const TeamCard = ({ team }) => {
    if (!team) return null;

    const currentWeek = "Preseason";
    const previousWeek = currentWeek === "Preseason" ? null : `Week ${parseInt(currentWeek.replace("Week ", "")) - 1}`;
    const previousWeekPoints = previousWeek && team.weekly_points?.[previousWeek]
      ? team.weekly_points[previousWeek]
      : null;

    // ENHANCED: Calculate averages properly using helper functions
    const season = team.currentSeason || {};
    const gamesPlayed = parseRecord(season.record);
    const avgPointsFor = calculateAverage(season.totalPointsFor || 0, gamesPlayed);
    const avgPointsAgainst = calculateAverage(season.totalPointsAgainst || 0, gamesPlayed);

    return (
      <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-4 mb-4 border border-white/20 transition-all duration-300 hover:bg-white/15">
        {/* Header with team info, sort data, and add button */}
        <div className="flex items-center gap-3 mb-3">
          {/* Team Logo */}
          <TeamLogoImage teamId={team.id} teamName={team.school} primaryColor={team.colors?.primary || team.color} size={32} />

          {/* Team Name */}
          <div className="flex-1 min-w-0">
            <h3
              onClick={() => handleTeamClick(team.school)}
              className="text-sm font-semibold text-white mb-1 cursor-pointer hover:text-blue-300 transition-colors overflow-hidden text-ellipsis whitespace-nowrap"
            >
              {team.school}
            </h3>
            <p className="text-xs text-white/60 m-0">
              {team.conference || "N/A"}
            </p>
          </div>

          {/* Sort Data: Fantasy Points, Record */}
          <div className="flex gap-2 text-xs">
            <div className="px-2 py-1 bg-white/10 rounded-lg text-center min-w-9">
              <div className="text-white/60 font-medium mb-0.5 text-xs">Points</div>
              <div className="text-green-300 font-bold text-xs">
                {season.gamePoints || 0}
              </div>
            </div>
            <div className="px-2 py-1 bg-white/10 rounded-lg text-center min-w-8">
              <div className="text-white/60 font-medium mb-0.5 text-xs">Record</div>
              <div className="text-white font-semibold text-xs">
                {season.record || "0-0"}
              </div>
            </div>
          </div>

          {/* MODIFIED: Add Button with lock status visual indication */}
          <button
            onClick={() => handleAddTeam(team)}
            disabled={faLocked}
            className={`
              w-7 h-7 rounded-full border-none text-white cursor-pointer flex items-center justify-center shadow-lg transition-all duration-200 flex-shrink-0
              ${faLocked
                ? 'bg-gray-500 cursor-not-allowed opacity-50'
                : 'bg-green-500 hover:bg-green-600 hover:scale-105'
              }
            `}
            title={faLocked ? "Free agency is currently locked" : "Add team to your roster"}
          >
            <Plus size={12} />
          </button>
        </div>

        {/* ENHANCED: Second Row with proper data fields */}
        <div className="grid grid-cols-3 gap-2 text-xs mb-2">
          <div className="px-2 py-1 bg-white/5 rounded-lg text-center">
            <div className="text-white/60 font-medium mb-0.5 text-xs">Conf. Record</div>
            <div className="text-white font-semibold text-xs">
              {season.confRecord || "0-0"}
            </div>
          </div>

          <div className="px-2 py-1 bg-white/5 rounded-lg text-center">
            <div className="text-white/60 font-medium mb-0.5 text-xs">ATS Record</div>
            <div className="text-white font-semibold text-xs">
              {season.atsRecord || "0-0"}
            </div>
          </div>

          <div className="px-2 py-1 bg-white/5 rounded-lg text-center">
            <div className="text-white/60 font-medium mb-0.5 text-xs">Avg Pts For</div>
            <div className="text-green-300 font-semibold text-xs">
              {avgPointsFor}
            </div>
          </div>
        </div>

        {/* ENHANCED: Third Row with additional stats */}
        <div className="grid grid-cols-2 gap-2 text-xs mb-2">
          <div className="px-2 py-1 bg-white/5 rounded-lg text-center">
            <div className="text-white/60 font-medium mb-0.5 text-xs">Avg Pts Against</div>
            <div className="text-red-300 font-semibold text-xs">
              {avgPointsAgainst}
            </div>
          </div>

          <div className="px-2 py-1 bg-white/5 rounded-lg text-center">
            <div className="text-white/60 font-medium mb-0.5 text-xs">Prev Week Pts</div>
            <div className="text-white font-semibold text-xs">
              {previousWeekPoints !== null ? previousWeekPoints : "N/A"}
            </div>
          </div>
        </div>

        {/* ENHANCED: Fourth Row - Next Game with proper formatting */}
        <div className="px-2 py-2 bg-white/5 rounded-lg text-xs text-center">
          <div className="text-white/60 font-medium mb-1 text-xs">Next Game</div>
          <div className="text-white font-semibold text-xs">
            {formatNextGame(season)}
          </div>
        </div>
      </div>
    );
  };

  // MODIFIED: Updated loading check to include config loading
  if (loading || configLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white">
        {/* Animated Background Elements */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-4 sm:left-10 w-48 sm:w-72 h-48 sm:h-72 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full blur-3xl animate-pulse"></div>
        </div>
        <div className="relative z-10 flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="text-4xl mb-4 animate-spin">⚡</div>
            <p className="text-xl text-white/80">Loading free agents...</p>
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

      <BottomNavBar />

      <LeagueNav />

      {/* Main Content */}
      <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 py-4 pb-24">

        {/* Header - matching DraftRoom style */}
        <div className="text-center mb-8">
          <div className="mb-4">
            <span className="inline-block text-4xl sm:text-5xl mb-2">🔍</span>
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black mb-2 leading-tight">
            <span className="bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
              Free Agents
            </span>
          </h1>
          <p className="text-xl sm:text-2xl font-semibold text-white mb-4">
            Available Teams
          </p>
          <p className="text-lg sm:text-xl text-white/80">
            {sortedTeams.length} teams available
          </p>
          {/* ADDED: Free agency status indicator */}
          {faLocked && (
            <div className="mt-4 p-3 bg-red-500/20 border border-red-500/40 rounded-xl">
              <p className="text-red-300 font-medium">
                🔒 Free agency is currently locked
              </p>
            </div>
          )}
        </div>

        {/* Controls Section */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20 mb-8">
          {/* Search and Conference Filter Row */}
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            {/* Search */}
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/60" />
              <input
                type="text"
                placeholder="Search teams..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-11 pl-10 pr-4 bg-white/10 backdrop-blur-sm border-2 border-white/30 rounded-xl text-sm text-white placeholder-white/50 focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20 focus:outline-none transition-all duration-300"
              />
            </div>

            {/* Conference Filter */}
            <div className="flex-1 sm:max-w-48 relative">
              <Filter size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/60 pointer-events-none z-10" />
              <select
                value={activeConference}
                onChange={(e) => setActiveConference(e.target.value)}
                className="w-full h-11 pl-10 pr-4 bg-white/10 backdrop-blur-sm border-2 border-white/30 rounded-xl text-white transition-all duration-300 hover:border-blue-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20 focus:outline-none appearance-none cursor-pointer"
                style={{
                  backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='rgba(255,255,255,0.6)' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6,9 12,15 18,9'%3e%3c/polyline%3e%3c/svg%3e")`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 1rem center',
                  backgroundSize: '1rem'
                }}
              >
                <option value="National" className="bg-slate-800 text-white">All Conferences</option>
                {conferenceList.slice(1).map(conf => (
                  <option key={conf} value={conf} className="bg-slate-800 text-white">
                    {conf}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Sort Options */}
          <div className="flex flex-wrap gap-2 justify-center">
            <SortButton
              label="Name"
              sortKey="school"
              sortConfig={sortConfig}
              onSort={toggleSort}
            />
            <SortButton
              label="Points"
              sortKey="points"
              sortConfig={sortConfig}
              onSort={toggleSort}
            />
            <SortButton
              label="Record"
              sortKey="currentSeason.record"
              sortConfig={sortConfig}
              onSort={toggleSort}
            />
          </div>
        </div>

        {/* Teams List */}
        {sortedTeams.length === 0 ? (
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 border border-white/20 text-center">
            <div className="text-4xl mb-4">🏈</div>
            <p className="text-white/80 text-lg">
              {searchQuery ?
                `No teams found matching "${searchQuery}"` :
                "No free agents available"
              }
            </p>
          </div>
        ) : (
          <div>
            {sortedTeams.map((team) => (
              <TeamCard key={team.id} team={team} />
            ))}
          </div>
        )}

        {/* Add Team Modal */}
        {showAddModal && teamToAdd && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white/10 backdrop-blur-lg border border-white/20 rounded-2xl p-6 max-w-md w-full shadow-2xl">
              <div className="text-center">
                <div className="text-4xl mb-4">🏈</div>
                <h3 className="text-xl font-bold text-white mb-4">
                  Add {teamToAdd.school}?
                </h3>
                <p className="text-white/80 mb-6">
                  This will add them to your lineup.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setShowAddModal(false);
                      setTeamToAdd(null);
                    }}
                    className="flex-1 px-4 py-3 bg-white/20 hover:bg-white/30 border border-white/30 rounded-xl text-white font-medium transition-all duration-300"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmAddTeam}
                    className="flex-1 px-4 py-3 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 rounded-xl text-white font-bold transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-green-500/40"
                  >
                    Add Team
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Swap UI Modal */}
        {showSwapUI && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white/10 backdrop-blur-lg border border-white/20 rounded-2xl p-6 max-w-md w-full shadow-2xl">
              <div className="text-center">
                <div className="text-4xl mb-4">🔄</div>
                <h3 className="text-xl font-bold text-white mb-4">
                  Add {pendingAddTeam}
                </h3>
                <p className="text-white/80 mb-6">
                  Your roster is full. Select a team to drop:
                </p>

                <select
                  value={selectedDropTeam}
                  onChange={(e) => setSelectedDropTeam(e.target.value)}
                  className="w-full p-3 mb-6 bg-white/10 backdrop-blur-sm border-2 border-white/30 rounded-xl text-white focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20 focus:outline-none"
                >
                  <option value="" className="bg-slate-800 text-white">Select a team to drop</option>
                  {userTeams.filter(Boolean).map((teamId) => {
                    // Get the actual school name from allTeams using the teamId
                    const teamData = Object.values(teamsByConference).flat().find(team =>
                      team.school?.toLowerCase()
                        .replace(/\s+/g, "-")
                        .replace(/&/g, "-")
                        .replace(/[^a-z0-9\-]/g, "") === teamId
                    );
                    const displayName = teamData?.school || teamId;

                    return (
                      <option key={teamId} value={teamId} className="bg-slate-800 text-white">
                        {displayName}
                      </option>
                    );
                  })}
                </select>

                <div className="flex gap-3">
                  <button
                    onClick={() => setShowSwapUI(false)}
                    className="flex-1 px-4 py-3 bg-white/20 hover:bg-white/30 border border-white/30 rounded-xl text-white font-medium transition-all duration-300"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirmSwap}
                    disabled={!selectedDropTeam}
                    className={`
                      flex-1 px-4 py-3 rounded-xl font-bold transition-all duration-300 transform
                      ${selectedDropTeam
                        ? 'bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white hover:scale-105 shadow-lg hover:shadow-green-500/40'
                        : 'bg-white/20 text-white/40 cursor-not-allowed'
                      }
                    `}
                  >
                    Confirm Swap
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Custom Success Modal */}
        {showSuccessModal && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white/10 backdrop-blur-lg border border-white/20 rounded-2xl p-6 max-w-md w-full text-center shadow-2xl">
              {/* Success Icon */}
              <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <div className="text-white text-2xl font-bold">✓</div>
              </div>

              <h3 className="text-xl font-bold text-white mb-2">
                {modalTitle}
              </h3>

              <p className="text-white/80 mb-6">
                {modalMessage}
              </p>

              <button
                onClick={closeModals}
                className="w-full px-4 py-3 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 rounded-xl text-white font-bold transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-green-500/40"
              >
                Awesome!
              </button>
            </div>
          </div>
        )}

        {/* Custom Error Modal */}
        {showErrorModal && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white/10 backdrop-blur-lg border border-white/20 rounded-2xl p-6 max-w-md w-full text-center shadow-2xl">
              {/* Error Icon */}
              <div className="w-16 h-16 bg-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <div className="text-white text-2xl font-bold">!</div>
              </div>

              <h3 className="text-xl font-bold text-white mb-2">
                {modalTitle}
              </h3>

              <p className="text-white/80 mb-6">
                {modalMessage}
              </p>

              <button
                onClick={closeModals}
                className="w-full px-4 py-3 bg-white/20 hover:bg-white/30 border border-white/30 rounded-xl text-white font-medium transition-all duration-300"
              >
                Got it
              </button>
            </div>
          </div>
        )}
      </div>
      <TeamDrawer teamName={drawerTeam} onClose={() => setDrawerTeam(null)} />
    </div>
  );
}

export default FreeAgents;
