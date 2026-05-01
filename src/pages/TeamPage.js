import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../supabase/supabase";
import { Plus, ArrowLeft, Calendar, MapPin, Trophy, Users, TrendingUp, ChevronDown } from "lucide-react";
import BottomNavBar from "../components/BottomNavBar";
import LeagueNav from "../components/LeagueNav";
import { SEASON_YEAR } from "../utils/season";
import { useModalState } from "../hooks/useModalState";
import { parseGamesPlayed as parseRecord, calculateAverage } from "../utils/teamStats";
import HelmetIcon from "../components/league/HelmetIcon";

function TeamPage() {
  const { leagueId, teamName } = useParams();
  const navigate = useNavigate();
  const [schedule, setSchedule] = useState([]);
  const [loading, setLoading] = useState(true);
  const [teamInfo, setTeamInfo] = useState(null);
  const [ownershipInfo, setOwnershipInfo] = useState(null);
  const [userTeams, setUserTeams] = useState([]);
  const [selectedDropTeam, setSelectedDropTeam] = useState("");
  const [pendingAddTeam, setPendingAddTeam] = useState("");
  const [showSwapUI, setShowSwapUI] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [teamToAdd, setTeamToAdd] = useState(null);
  const [loadingStage, setLoadingStage] = useState("Fetching team info...");
  const [currentWeek, setCurrentWeek] = useState(1);
  const [currentWeekGame, setCurrentWeekGame] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);

  const [showDropdown, setShowDropdown] = useState(false);

  const {
    showSuccessModal, showErrorModal,
    modalTitle, modalMessage,
    showSuccess, showError, closeModals,
  } = useModalState();


  const denormalizeTeamName = (normalizedName) => {
    if (!normalizedName) return normalizedName;

    return normalizedName
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
      .replace(/\bAnd\b/g, '&');
  };

  // Format the current week's game display
  const formatWeekGame = (game, teamName) => {
    if (!game) return "BYE";

    const isHome = game.home_team === teamName || game.homeTeam === teamName;
    const opponent = isHome ? (game.away_team || game.awayTeam) : (game.home_team || game.homeTeam);
    const prefix = game.neutralSite ? "vs" : (isHome ? "vs" : "@");

    // Get spread information
    const spread = game.home_spread || game.homeSpread || game.spread || "TBD";
    const displaySpread = spread !== "TBD" ? `(${spread})` : "";

    // Check if game is complete
    if (game.game_complete || game.gameComplete) {
      const teamScore = isHome ? (game.home_score ?? game.finalScore?.home) : (game.away_score ?? game.finalScore?.away);
      const opponentScore = isHome ? (game.away_score ?? game.finalScore?.away) : (game.home_score ?? game.finalScore?.home);

      if (teamScore !== null && teamScore !== undefined &&
          opponentScore !== null && opponentScore !== undefined) {
        const won = teamScore > opponentScore;
        const result = won ? "W" : "L";
        return `${result} ${prefix} ${opponent} ${teamScore}-${opponentScore} ${displaySpread}`;
      }
    }

    // Game is upcoming
    return `${prefix} ${opponent} ${displaySpread}`;
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showDropdown && !event.target.closest('[data-dropdown]')) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showDropdown]);

  useEffect(() => {
    const fetchTeamData = async () => {
      try {
        const decodedTeamName = decodeURIComponent(teamName);

        // Get current user
        const { data: { user } } = await supabase.auth.getUser();
        setCurrentUser(user);

        // Stage 1: Fetch current week and team info
        setLoadingStage("Loading team details...");
        const [configResult, teamsResult] = await Promise.all([
          supabase.from('config').select('value').eq('key', 'season').single(),
          supabase.from('teams').select('*, team_season_stats(*)')
        ]);

        // Get current week
        const week = configResult.data?.value?.currentWeek || 1;
        setCurrentWeek(week);

        // Find team info, flattening season stats
        let foundTeam = null;
        (teamsResult.data || []).forEach(team => {
          if (team.school === decodedTeamName) {
            const stats = team.team_season_stats?.[0] || {};
            foundTeam = {
              ...team,
              logo: team.logo_filename ? `/logos/${team.logo_filename}` : null,
              // Flatten live fields from team_season_stats
              game_points: stats.game_points || 0,
              record: stats.record || null,
              conf_record: stats.conf_record || null,
              ats_record: stats.ats_record || null,
              is_on_bye: stats.is_on_bye || false,
              next_opponent: stats.next_opponent || null,
              next_game_is_home: stats.next_game_is_home || false,
              next_opponent_spread: stats.next_opponent_spread || null,
              next_opponent_spread_display: stats.next_opponent_spread_display || null,
              total_points_for: stats.total_points_for || 0,
              total_points_against: stats.total_points_against || 0,
              sos_rank: stats.sos_rank || null,
              prev_year_points: stats.prev_year_points || 0,
              game_status: stats.game_status || null,
              game_complete: stats.game_complete || false,
              weekly_points: stats.weekly_points || {},
            };
          }
        });
        setTeamInfo(foundTeam);

        // Stage 2: Fetch current week's game
        setLoadingStage("Loading current week game...");
        const { data: weekGamesData } = await supabase
          .from('games')
          .select('*')
          .eq('week', week.toString());

        let weekGame = null;
        (weekGamesData || []).forEach(game => {
          if (game.home_team === decodedTeamName || game.away_team === decodedTeamName ||
              game.homeTeam === decodedTeamName || game.awayTeam === decodedTeamName) {
            weekGame = {
              ...game,
              week: week,
              gameId: game.id
            };
          }
        });
        setCurrentWeekGame(weekGame);

        // Stage 3: Fetch ownership and user data in parallel
        setLoadingStage("Checking ownership status...");
        const [ownershipResult, userTeamsResult] = await Promise.all([
          fetchOwnershipInfo(decodedTeamName, user),
          fetchUserTeams(user)
        ]);

        setOwnershipInfo(ownershipResult);
        setUserTeams(userTeamsResult);

        // Stage 4: Fetch full schedule (most expensive operation)
        setLoadingStage("Loading schedule...");
        const scheduleData = await fetchTeamSchedule(decodedTeamName);
        setSchedule(scheduleData);

        setLoading(false);
      } catch (error) {
        console.error("Error fetching team data:", error);
        setLoading(false);
      }
    };

    const fetchOwnershipInfo = async (teamName, user) => {
      // NORMALIZE THE TEAM NAME FOR CHECKING
      const normalizedTeamName = teamName
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/&/g, "")
        .replace(/[^a-z0-9\-]/g, "");

      // Get all members for this league
      const { data: memberRows } = await supabase
        .from('league_members')
        .select('id, user_id, team_name')
        .eq('league_id', leagueId);

      if (!memberRows?.length) return null;

      // Get current week lineups for all members
      const memberIds = memberRows.map(m => m.id);
      const currentWeekNum = (await supabase.from('config').select('value').eq('key', 'season').single())
        .data?.value?.currentWeek || 1;

      const { data: lineupRows } = await supabase
        .from('weekly_lineups')
        .select('member_id, starters, bench')
        .eq('league_id', leagueId)
        .eq('week', currentWeekNum)
        .in('member_id', memberIds);

      const lineupByMember = {};
      (lineupRows || []).forEach(row => { lineupByMember[row.member_id] = row; });

      for (const memberRow of memberRows) {
        const lineup = lineupByMember[memberRow.id] || {};
        const starters = lineup.starters || [];
        const bench = lineup.bench || [];

        let status = null;
        if (starters.includes(normalizedTeamName)) {
          status = "starting";
        } else if (bench.includes(normalizedTeamName)) {
          status = "bench";
        }

        if (status) {
          // Only fetch user data if we found ownership
          let ownerName = memberRow.team_name || "Unknown Owner";
          try {
            const { data: userData } = await supabase
              .from('users')
              .select('first_name, last_name')
              .eq('id', memberRow.user_id)
              .single();
            if (userData) {
              ownerName = userData.first_name
                ? `${userData.first_name} ${userData.last_name || ""}`.trim()
                : memberRow.team_name || "Unknown Owner";
            }
          } catch (error) {
            console.warn("Could not fetch user data:", error);
          }

          return {
            status,
            ownerName,
            teamName: memberRow.team_name || "Unnamed Team"
          };
        }
      }
      return null;
    };

    const fetchUserTeams = async (user) => {
      if (!user) return [];

      try {
        // Look up member_id for the current user in this league
        const { data: memberRow } = await supabase
          .from('league_members')
          .select('id')
          .eq('league_id', leagueId)
          .eq('user_id', user.id)
          .single();

        if (!memberRow) return [];

        const currentWeekNum = (await supabase.from('config').select('value').eq('key', 'season').single())
          .data?.value?.currentWeek || 1;

        const { data: lineupRow } = await supabase
          .from('weekly_lineups')
          .select('starters, bench')
          .eq('league_id', leagueId)
          .eq('member_id', memberRow.id)
          .eq('week', currentWeekNum)
          .single();

        if (lineupRow) {
          const starters = lineupRow.starters || [];
          const bench = lineupRow.bench || [];
          return [...starters, ...bench];
        }
      } catch (error) {
        console.error("Error fetching user teams:", error);
      }
      return [];
    };

    const fetchTeamSchedule = async (teamName) => {
      // Fetch all games for this team from the games table
      const { data: gamesData, error } = await supabase
        .from('games')
        .select('*')
        .or(`home_team.eq.${teamName},away_team.eq.${teamName}`);

      if (error) {
        console.error("Error fetching schedule:", error);
        return [];
      }

      const scheduleData = (gamesData || []).map(game => ({
        ...game,
        homeTeam: game.home_team,
        awayTeam: game.away_team,
        homeScore: game.home_score,
        awayScore: game.away_score,
        homeSpread: game.home_spread,
        gameComplete: game.game_complete,
        gameId: game.id
      }));

      // Sort by week
      return scheduleData.sort((a, b) => {
        const weekA = parseInt(String(a.week).replace(/\D/g, '')) || 0;
        const weekB = parseInt(String(b.week).replace(/\D/g, '')) || 0;
        return weekA - weekB;
      });
    };

    fetchTeamData();
  }, [teamName, leagueId]);

  const handleAddTeam = (teamName) => {
    if (!currentUser) return;

    if (userTeams.length < 7) {
      setTeamToAdd({ school: teamName });
      setShowAddModal(true);
    } else {
      setPendingAddTeam(teamName);
      setSelectedDropTeam("");
      setShowSwapUI(true);
    }
  };

  const confirmAddTeam = async () => {
    if (!teamToAdd) return;

    try {
      if (!currentUser) return;

      // Look up member_id for current user
      const { data: memberRow } = await supabase
        .from('league_members')
        .select('id, team_name')
        .eq('league_id', leagueId)
        .eq('user_id', currentUser.id)
        .single();

      if (!memberRow) return;

      const weekNum = currentWeek || 1;
      const { data: lineupRow } = await supabase
        .from('weekly_lineups')
        .select('starters, bench')
        .eq('league_id', leagueId)
        .eq('member_id', memberRow.id)
        .eq('week', weekNum)
        .single();

      const starters = [...(lineupRow?.starters || Array(5).fill(null))];
      const bench = [...(lineupRow?.bench || Array(2).fill(null))];

      // NORMALIZE THE TEAM NAME BEFORE SAVING
      const normalizedTeamName = teamToAdd.school
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/&/g, "")
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
          member_id: memberRow.id,
          week: weekNum,
          starters,
          bench,
        }, { onConflict: 'league_id,member_id,week' });
      if (updateError) throw updateError;

      setUserTeams([...starters, ...bench].filter(Boolean));
      setShowAddModal(false);
      setTeamToAdd(null);

      showSuccess("Team Added!", `${teamToAdd.school} has been successfully added to your lineup!`);

      // Update ownership info to reflect the change
      const { data: userData } = await supabase
        .from('users')
        .select('first_name, last_name')
        .eq('id', currentUser.id)
        .single();

      let ownerName = "You";
      if (userData) {
        ownerName = userData.first_name
          ? `${userData.first_name} ${userData.last_name || ""}`.trim()
          : "You";
      }

      setOwnershipInfo({
        status: emptyStarterIndex !== -1 ? "starting" : "bench",
        ownerName,
        teamName: memberRow?.team_name || "Your Team"
      });

    } catch (error) {
      console.error("Error adding team:", error);
      showError("Error", "Failed to add team. Please try again.");
    }
  };

  const handleConfirmSwap = async () => {
    if (!selectedDropTeam || !pendingAddTeam) return;

    try {
      if (!currentUser) return;

      // Look up member_id for current user
      const { data: memberRow } = await supabase
        .from('league_members')
        .select('id, team_name')
        .eq('league_id', leagueId)
        .eq('user_id', currentUser.id)
        .single();

      if (!memberRow) return;

      const weekNum = currentWeek || 1;
      const { data: lineupRow } = await supabase
        .from('weekly_lineups')
        .select('starters, bench')
        .eq('league_id', leagueId)
        .eq('member_id', memberRow.id)
        .eq('week', weekNum)
        .single();

      const starters = [...(lineupRow?.starters || Array(5).fill(null))];
      const bench = [...(lineupRow?.bench || Array(2).fill(null))];

      // NORMALIZE THE NEW TEAM NAME BEFORE SAVING
      const normalizedNewTeam = pendingAddTeam
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/&/g, "")
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
          member_id: memberRow.id,
          week: weekNum,
          starters,
          bench,
        }, { onConflict: 'league_id,member_id,week' });
      if (updateError) throw updateError;

      setUserTeams([...starters, ...bench].filter(Boolean));
      setShowSwapUI(false);
      setPendingAddTeam("");
      setSelectedDropTeam("");

      showSuccess("Team Swapped!", `Successfully swapped ${selectedDropTeam} for ${pendingAddTeam}!`);

      // Update ownership info to reflect the change
      const { data: userData } = await supabase
        .from('users')
        .select('first_name, last_name')
        .eq('id', currentUser.id)
        .single();

      let ownerName = "You";
      if (userData) {
        ownerName = userData.first_name
          ? `${userData.first_name} ${userData.last_name || ""}`.trim()
          : "You";
      }

      setOwnershipInfo({
        status: starterIndex !== -1 ? "starting" : "bench",
        ownerName,
        teamName: memberRow?.team_name || "Your Team"
      });

    } catch (error) {
      console.error("Error swapping teams:", error);
      showError("Error", "Failed to swap teams. Please try again.");
    }
  };

  const formatGameResult = (game, teamName) => {
    const isHome = game.home_team === teamName || game.homeTeam === teamName;
    const teamScore = isHome ? (game.home_score ?? game.homeScore) : (game.away_score ?? game.awayScore);
    const opponentScore = isHome ? (game.away_score ?? game.awayScore) : (game.home_score ?? game.homeScore);

    if ((game.game_complete || game.gameComplete) && teamScore !== null && teamScore !== undefined &&
        opponentScore !== null && opponentScore !== undefined) {
      const won = teamScore > opponentScore;
      return { result: won ? "W" : "L", score: `${teamScore}-${opponentScore}`, won };
    }

    return null;
  };

  const formatOpponent = (game, teamName) => {
    const isHome = game.home_team === teamName || game.homeTeam === teamName;
    const opponent = isHome ? (game.away_team || game.awayTeam) : (game.home_team || game.homeTeam);

    if (game.neutralSite) {
      return { opponent, prefix: "vs", isHome: null };
    }

    return { opponent, prefix: isHome ? "vs" : "@", isHome };
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return {
      weekday: date.toLocaleDateString('en-US', { weekday: 'short' }),
      date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    };
  };

  const renderOwnershipStatus = () => {
    const decodedTeamName = decodeURIComponent(teamName);

    if (!ownershipInfo) {
      return (
        <div className="bg-green-500/20 border-2 border-green-400/50 rounded-2xl p-4 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users size={18} className="text-green-300" />
              <span className="font-semibold text-green-200">Status: Free Agent</span>
            </div>
            {currentUser && (
              <button
                onClick={() => handleAddTeam(decodedTeamName)}
                className="flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 rounded-xl text-white font-medium transition-all duration-200 transform hover:scale-105"
              >
                <Plus size={14} />
                Add Team
              </button>
            )}
          </div>
        </div>
      );
    }

    const { status, ownerName, teamName: ownerTeamName } = ownershipInfo;
    const isStarting = status === "starting";
    const statusText = isStarting ? "Starting Lineup" : "Riding the Bench";

    return (
      <div className={`border-2 rounded-2xl p-4 mb-6 ${
        isStarting
          ? 'bg-blue-500/20 border-blue-400/50'
          : 'bg-yellow-500/20 border-yellow-400/50'
      }`}>
        <div className="flex items-center gap-2 mb-1">
          <Trophy size={18} className={isStarting ? 'text-blue-300' : 'text-yellow-300'} />
          <span className={`font-semibold ${
            isStarting ? 'text-blue-200' : 'text-yellow-200'
          }`}>
            Status: {statusText}
          </span>
        </div>
        <div className={`ml-6 text-sm ${
          isStarting ? 'text-blue-200/80' : 'text-yellow-200/80'
        }`}>
          Owned by <strong>{ownerName}</strong> ({ownerTeamName})
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white">
        {/* Animated Background Elements */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-4 sm:left-10 w-48 sm:w-72 h-48 sm:h-72 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full blur-3xl animate-pulse"></div>
        </div>
        <div className="relative z-10 flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="text-4xl mb-4 animate-spin">⚡</div>
            <p className="text-xl text-white/80 mb-2">Loading {decodeURIComponent(teamName)}...</p>
            <p className="text-sm text-white/60">{loadingStage}</p>
          </div>
        </div>
      </div>
    );
  }

  const decodedTeamName = decodeURIComponent(teamName);

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
      <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 py-4 pb-28">
        {/* Back Button */}
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 mb-6 px-4 py-2 bg-white/10 backdrop-blur-sm border border-white/30 rounded-xl text-white hover:bg-white/20 transition-all duration-300"
        >
          <ArrowLeft size={16} />
          Back
        </button>

        {/* Header */}
        <div className="text-center mb-8">
          <div className="mb-4 flex justify-center">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full border-2 border-white/20 bg-white/10 flex items-center justify-center overflow-hidden">
              <HelmetIcon
                color={teamInfo?.colors?.primary || teamInfo?.color}
                alternate_color={teamInfo?.colors?.secondary || teamInfo?.alternate_color}
                size={64}
              />
            </div>
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black mb-2 leading-tight">
            <span className="bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
              {decodedTeamName}
            </span>
          </h1>
          {teamInfo && (
            <p className="text-lg sm:text-xl text-white/80">
              {teamInfo.conference || "Independent"} • {teamInfo.record || "0-0"}
            </p>
          )}
        </div>

        {/* Ownership Status */}
        {renderOwnershipStatus()}

        {/* Team Stats */}
        {teamInfo && (
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20 mb-8">
            <h3 className="flex items-center gap-2 text-xl font-bold text-white mb-6">
              <TrendingUp size={20} />
              {SEASON_YEAR} Season Stats
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              <div className="bg-white/5 rounded-xl p-3 text-center">
                <div className="text-xs text-white/60 font-medium mb-1">Conference Record</div>
                <div className="text-lg font-bold text-white">
                  {teamInfo.conf_record || "0-0"}
                </div>
              </div>

              <div className="bg-white/5 rounded-xl p-3 text-center">
                <div className="text-xs text-white/60 font-medium mb-1">ATS Record</div>
                <div className="text-lg font-bold text-white">
                  {teamInfo.ats_record || "0-0"}
                </div>
              </div>

              <div className="bg-white/5 rounded-xl p-3 text-center">
                <div className="text-xs text-white/60 font-medium mb-1">Fantasy Points</div>
                <div className="text-lg font-bold text-green-300">
                  {teamInfo.game_points || 0}
                </div>
              </div>

              <div className="bg-white/5 rounded-xl p-3 text-center">
                <div className="text-xs text-white/60 font-medium mb-1">Avg Weekly Fantasy</div>
                <div className="text-lg font-bold text-blue-300">
                  {(() => {
                    const gamesPlayed = parseRecord(teamInfo.record);
                    const gamePoints = teamInfo.game_points || 0;
                    return calculateAverage(gamePoints, gamesPlayed);
                  })()}
                </div>
              </div>

              <div className="bg-white/5 rounded-xl p-3 text-center">
                <div className="text-xs text-white/60 font-medium mb-1">Games Played</div>
                <div className="text-lg font-bold text-white">
                  {parseRecord(teamInfo.record)}
                </div>
              </div>

              <div className="bg-white/5 rounded-xl p-3 text-center">
                <div className="text-xs text-white/60 font-medium mb-1">SOS Rank</div>
                <div className="text-lg font-bold text-purple-300">
                  {teamInfo.sos_rank ?? "—"}
                </div>
              </div>

              <div className="bg-white/5 rounded-xl p-3 text-center">
                <div className="text-xs text-white/60 font-medium mb-1">Phil Metrics</div>
                <div className="text-lg font-bold text-purple-300">
                  {teamInfo.phil_metrics ?? "—"}
                </div>
              </div>

              <div className="bg-white/5 rounded-xl p-3 text-center">
                <div className="text-xs text-white/60 font-medium mb-1">Prev Year Pts</div>
                <div className="text-lg font-bold text-white">
                  {teamInfo.prev_year_points ?? "—"}
                </div>
              </div>
            </div>

            {/* Week X Game - Updated Section */}
            <div className="mt-4 bg-white/5 rounded-xl p-4 text-center">
              <div className="text-xs text-white/60 font-medium mb-2">Week {currentWeek} Game</div>
              <div className="text-lg font-bold text-white">
                {formatWeekGame(currentWeekGame, decodedTeamName)}
              </div>
              {currentWeekGame && (currentWeekGame.date || currentWeekGame.game_time) && (
                <div className="text-sm text-white/60 mt-1">
                  {new Date(currentWeekGame.date || currentWeekGame.game_time).toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric'
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Schedule */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl border border-white/20 overflow-hidden">
          <div className="p-6 border-b border-white/10">
            <h3 className="flex items-center gap-2 text-xl font-bold text-white">
              <Calendar size={20} />
              {SEASON_YEAR} Schedule ({schedule.length} games)
            </h3>
          </div>

          {schedule.length === 0 ? (
            <div className="p-8 text-center text-white/60">
              No schedule found for {decodedTeamName}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-white/5">
                    <th className="px-2 py-3 text-center text-xs font-semibold text-white/80 w-16">Wk</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-white/80 w-24">Date</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-white/80">Opponent</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-white/80">Venue</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-white/80">Result</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-white/80 w-20">Fantasy Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {schedule.map((game, index) => {
                    const gameResult = formatGameResult(game, decodedTeamName);
                    const opponentInfo = formatOpponent(game, decodedTeamName);
                    const dateStr = game.date || game.game_time;
                    const dateInfo = dateStr ? formatDate(dateStr) : { weekday: '', date: '' };

                    return (
                      <tr
                        key={index}
                        className={`border-b border-white/5 hover:bg-white/5 transition-colors duration-200 ${
                          index % 2 === 0 ? 'bg-white/2' : ''
                        }`}
                      >
                        <td className="px-2 py-3 font-semibold text-white text-center">
                          {game.week}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="text-sm text-white">{dateInfo.weekday}</div>
                          <div className="text-xs text-white/60">{dateInfo.date}</div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <span className="text-xs text-white/60 font-medium">
                              {opponentInfo.prefix}
                            </span>
                            <span className="text-sm font-semibold text-white">
                              {opponentInfo.opponent}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <MapPin size={12} className="text-white/40" />
                            <span className="text-sm text-white/60">
                              {game.venue || "TBD"}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {gameResult ? (
                            <div className={`inline-flex items-center justify-center px-3 py-2 rounded-lg text-sm font-semibold min-w-[80px] ${
                              gameResult.won
                                ? 'bg-green-500/20 text-green-300 border border-green-500/30'
                                : 'bg-red-500/20 text-red-300 border border-red-500/30'
                            }`}>
                              <div className="text-center">
                                <div className="text-xs font-bold mb-0.5">{gameResult.result}</div>
                                <div className="text-xs opacity-90">{gameResult.score}</div>
                              </div>
                            </div>
                          ) : (
                            <span className="text-white/40 text-sm">TBD</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {(() => {
                            if ((game.game_complete || game.gameComplete) && teamInfo?.weekly_points) {
                              const weekKey = `week${game.week}`;
                              const weeklyPoints = teamInfo.weekly_points[weekKey];
                              if (weeklyPoints !== undefined && weeklyPoints !== null) {
                                return (
                                  <span className="text-green-300 text-sm font-semibold">
                                    {weeklyPoints}
                                  </span>
                                );
                              }
                            }
                            return <span className="text-white/40 text-sm">—</span>;
                          })()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

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

              <div data-dropdown className="relative mb-6">
                <button
                  onClick={() => setShowDropdown(!showDropdown)}
                  className="w-full p-4 bg-white/10 backdrop-blur-sm border-2 border-white/30 rounded-xl text-white focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20 focus:outline-none flex items-center justify-between transition-all duration-300"
                >
                  <span className={selectedDropTeam ? 'text-white' : 'text-white/50'}>
                    {selectedDropTeam ? denormalizeTeamName(selectedDropTeam) : "Choose a team to drop"}
                  </span>
                  <ChevronDown
                    size={16}
                    className={`text-white/60 transition-transform duration-200 ${
                      showDropdown ? 'rotate-180' : 'rotate-0'
                    }`}
                  />
                </button>

                {showDropdown && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white/10 backdrop-blur-lg border-2 border-white/20 rounded-xl shadow-2xl z-50 max-h-60 overflow-y-auto">
                    {userTeams.filter(Boolean).map((team, index) => (
                      <button
                        key={team}
                        onClick={() => {
                          setSelectedDropTeam(team);
                          setShowDropdown(false);
                        }}
                        className={`w-full p-3 text-left transition-all duration-150 ${
                          selectedDropTeam === team
                            ? 'bg-blue-500/20 text-blue-200 font-semibold'
                            : 'text-white hover:bg-white/10'
                        } ${index === 0 ? 'rounded-t-xl' : ''} ${
                          index === userTeams.filter(Boolean).length - 1 ? 'rounded-b-xl' : 'border-b border-white/10'
                        }`}
                      >
                        {denormalizeTeamName(team)}
                      </button>
                    ))}
                  </div>
                )}
              </div>

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
  );
}

export default TeamPage;
