import React, { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { collection, getDocs, doc, getDoc, updateDoc } from "firebase/firestore";
import { db, auth } from "../firebase/firebase";
import { Plus, ArrowLeft, Calendar, MapPin, Trophy, Users, TrendingUp, ChevronDown } from "lucide-react";
import BottomNavBar from "../components/BottomNavBar";

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
  
  // Custom notification modal states
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [modalMessage, setModalMessage] = useState("");
  const [showDropdown, setShowDropdown] = useState(false); 
  const [modalTitle, setModalTitle] = useState("");

  // FIXED: Helper function to parse record and calculate games played
  const parseRecord = (record) => {
    if (!record || record === "0-0") return 0;
    const parts = record.split('-');
    if (parts.length !== 2) return 0;
    const wins = parseInt(parts[0]) || 0;
    const losses = parseInt(parts[1]) || 0;
    return wins + losses;
  };

  // FIXED: Helper function to calculate averages safely
  const calculateAverage = (total, gamesPlayed) => {
    if (!gamesPlayed || gamesPlayed === 0) return "0.0";
    return (total / gamesPlayed).toFixed(1);
  };

  // Custom modal helper functions
  const showSuccess = (title, message) => {
    setModalTitle(title);
    setModalMessage(message);
    setShowSuccessModal(true);
  };

  const showError = (title, message) => {
    setModalTitle(title);
    setModalMessage(message);
    setShowErrorModal(true);
  };

  const closeModals = () => {
    setShowSuccessModal(false);
    setShowErrorModal(false);
    setModalTitle("");
    setModalMessage("");
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

  const denormalizeTeamName = (normalizedName) => {
    if (!normalizedName) return normalizedName;
    
    return normalizedName
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
      .replace(/\bAnd\b/g, '&');
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
        
        // Stage 1: Fetch team info with query optimization
        setLoadingStage("Loading team details...");
        const teamsSnap = await getDocs(collection(db, "teams"));
        let foundTeam = null;
        
        teamsSnap.forEach(doc => {
          const data = doc.data();
          if (data.school === decodedTeamName) {
            foundTeam = data;
          }
        });
        setTeamInfo(foundTeam);

        // Stage 2: Fetch ownership and user data in parallel
        setLoadingStage("Checking ownership status...");
        const [ownershipResult, userTeamsResult] = await Promise.all([
          fetchOwnershipInfo(decodedTeamName),
          fetchUserTeams()
        ]);
        
        setOwnershipInfo(ownershipResult);
        setUserTeams(userTeamsResult);

        // Stage 3: Fetch schedule (most expensive operation)
        setLoadingStage("Loading schedule...");
        const scheduleData = await fetchTeamSchedule(decodedTeamName);
        setSchedule(scheduleData);
        
        setLoading(false);
      } catch (error) {
        console.error("Error fetching team data:", error);
        setLoading(false);
      }
    };

    const fetchOwnershipInfo = async (teamName) => {
      // NORMALIZE THE TEAM NAME FOR CHECKING
      const normalizedTeamName = teamName
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/&/g, "")
        .replace(/[^a-z0-9\-]/g, "");

      const membersSnap = await getDocs(collection(db, "leagues", leagueId, "members"));
      
      for (const memberDoc of membersSnap.docs) {
        const memberData = memberDoc.data();
        const lineup = memberData.lineup || {};
        const starters = lineup.starters || [];
        const bench = lineup.bench || [];
        
        let status = null;
        if (starters.includes(normalizedTeamName)) { // Use normalized name
          status = "starting";
        } else if (bench.includes(normalizedTeamName)) { // Use normalized name
          status = "bench";
        }
        
        if (status) {
          // Only fetch user data if we found ownership
          let ownerName = memberData.displayName || "Unknown Owner";
          try {
            const userDoc = await getDoc(doc(db, "users", memberDoc.id));
            if (userDoc.exists()) {
              const userData = userDoc.data();
              ownerName = userData.firstName 
                ? `${userData.firstName} ${userData.lastName || ""}`.trim()
                : userData.displayName || memberData.displayName || "Unknown Owner";
            }
          } catch (error) {
            console.warn("Could not fetch user data:", error);
          }
          
          return {
            status,
            ownerName,
            teamName: memberData.teamName || "Unnamed Team"
          };
        }
      }
      return null;
    };

    const fetchUserTeams = async () => {
      const user = auth.currentUser;
      if (!user) return [];
      
      try {
        const userMemberRef = doc(db, "leagues", leagueId, "members", user.uid);
        const userMemberSnap = await getDoc(userMemberRef);
        if (userMemberSnap.exists()) {
          const userLineup = userMemberSnap.data()?.lineup || {};
          const starters = userLineup.starters || [];
          const bench = userLineup.bench || [];
          return [...starters, ...bench];
        }
      } catch (error) {
        console.error("Error fetching user teams:", error);
      }
      return [];
    };

    const fetchTeamSchedule = async (teamName) => {
      // Batch all week queries at once instead of sequential
      const weeksSnap = await getDocs(collection(db, "schedule", "2025", "weeks"));
      const weekNumbers = weeksSnap.docs.map(doc => doc.id);
      
      // Fetch all games for all weeks in parallel
      const allGamesPromises = weekNumbers.map(async (weekNum) => {
        const gamesSnap = await getDocs(collection(db, "schedule", "2025", "weeks", weekNum, "games"));
        const weekGames = [];
        
        gamesSnap.forEach(gameDoc => {
          const game = gameDoc.data();
          if (game.homeTeam === teamName || game.awayTeam === teamName) {
            weekGames.push({
              ...game,
              week: parseInt(weekNum),
              gameId: gameDoc.id
            });
          }
        });
        
        return weekGames;
      });
      
      const allWeeksGames = await Promise.all(allGamesPromises);
      const scheduleData = allWeeksGames.flat();
      
      // Sort by week
      return scheduleData.sort((a, b) => a.week - b.week);
    };

    fetchTeamData();
  }, [teamName, leagueId]);

  const handleAddTeam = (teamName) => {
    const user = auth.currentUser;
    if (!user) return;

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
      const user = auth.currentUser;
      if (!user) return;

      const memberRef = doc(db, "leagues", leagueId, "members", user.uid);
      const memberSnap = await getDoc(memberRef);
      const memberData = memberSnap.data();
      
      const lineup = memberData?.lineup || {};
      const starters = [...(lineup.starters || [])];
      const bench = [...(lineup.bench || [])];
      
      // NORMALIZE THE TEAM NAME BEFORE SAVING
      const normalizedTeamName = teamToAdd.school
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/&/g, "")
        .replace(/[^a-z0-9\-]/g, "");
      
      const emptyStarterIndex = starters.findIndex(t => !t);
      const emptyBenchIndex = bench.findIndex(t => !t);
      
      if (emptyStarterIndex !== -1) {
        starters[emptyStarterIndex] = normalizedTeamName; // Use normalized name
      } else if (emptyBenchIndex !== -1) {
        bench[emptyBenchIndex] = normalizedTeamName; // Use normalized name
      } else {
        showError("Roster Full", "Your roster is full! Please drop a team first.");
        return;
      }

      await updateDoc(memberRef, {
        "lineup.starters": starters,
        "lineup.bench": bench
      });

      setUserTeams([...starters, ...bench].filter(Boolean));
      setShowAddModal(false);
      setTeamToAdd(null);
      
      showSuccess("Team Added!", `${teamToAdd.school} has been successfully added to your lineup!`);
      
      // Update ownership info to reflect the change
      const user2 = auth.currentUser;
      if (user2) {
        const userDoc = await getDoc(doc(db, "users", user2.uid));
        let ownerName = "You";
        if (userDoc.exists()) {
          const userData = userDoc.data();
          ownerName = userData.firstName 
            ? `${userData.firstName} ${userData.lastName || ""}`.trim()
            : userData.displayName || "You";
        }
        
        const memberDoc = await getDoc(memberRef);
        const memberData2 = memberDoc.data();
        
        setOwnershipInfo({
          status: emptyStarterIndex !== -1 ? "starting" : "bench",
          ownerName,
          teamName: memberData2.teamName || "Your Team"
        });
      }
      
    } catch (error) {
      console.error("Error adding team:", error);
      showError("Error", "Failed to add team. Please try again.");
    }
  };

  const handleConfirmSwap = async () => {
    if (!selectedDropTeam || !pendingAddTeam) return;
    
    try {
      const user = auth.currentUser;
      if (!user) return;

      const memberRef = doc(db, "leagues", leagueId, "members", user.uid);
      const memberSnap = await getDoc(memberRef);
      const memberData = memberSnap.data();
      
      const lineup = memberData?.lineup || {};
      const starters = [...(lineup.starters || [])];
      const bench = [...(lineup.bench || [])];
      
      // NORMALIZE THE NEW TEAM NAME BEFORE SAVING
      const normalizedNewTeam = pendingAddTeam
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/&/g, "")
        .replace(/[^a-z0-9\-]/g, "");
      
      const starterIndex = starters.findIndex(t => t === selectedDropTeam);
      const benchIndex = bench.findIndex(t => t === selectedDropTeam);
      
      if (starterIndex !== -1) {
        starters[starterIndex] = normalizedNewTeam; // CHANGED: Use normalized name
      } else if (benchIndex !== -1) {
        bench[benchIndex] = normalizedNewTeam; // CHANGED: Use normalized name
      }

      await updateDoc(memberRef, {
        "lineup.starters": starters,
        "lineup.bench": bench
      });

      setUserTeams([...starters, ...bench].filter(Boolean));
      setShowSwapUI(false);
      setPendingAddTeam("");
      setSelectedDropTeam("");
      
      showSuccess("Team Swapped!", `Successfully swapped ${selectedDropTeam} for ${pendingAddTeam}!`);
      
      // Update ownership info to reflect the change
      const user2 = auth.currentUser;
      if (user2) {
        const userDoc = await getDoc(doc(db, "users", user2.uid));
        let ownerName = "You";
        if (userDoc.exists()) {
          const userData = userDoc.data();
          ownerName = userData.firstName 
            ? `${userData.firstName} ${userData.lastName || ""}`.trim()
            : userData.displayName || "You";
        }
        
        setOwnershipInfo({
          status: starterIndex !== -1 ? "starting" : "bench",
          ownerName,
          teamName: memberData.teamName || "Your Team"
        });
      }
      
    } catch (error) {
      console.error("Error swapping teams:", error);
      showError("Error", "Failed to swap teams. Please try again.");
    }
  };

  const formatGameResult = (game, teamName) => {
    const isHome = game.homeTeam === teamName;
    // FIXED: Use homeScore/awayScore instead of homePoints/awayPoints
    const teamScore = isHome ? game.homeScore : game.awayScore;
    const opponentScore = isHome ? game.awayScore : game.homeScore;
    
    if (game.gameComplete && teamScore !== null && teamScore !== undefined && 
        opponentScore !== null && opponentScore !== undefined) {
      const won = teamScore > opponentScore;
      return { result: won ? "W" : "L", score: `${teamScore}-${opponentScore}`, won };
    }
    
    return null;
  };

  const formatOpponent = (game, teamName) => {
    const isHome = game.homeTeam === teamName;
    const opponent = isHome ? game.awayTeam : game.homeTeam;
    
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
            {auth.currentUser && (
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

      <BottomNavBar leagueId={leagueId} isDraftComplete={true} />

      {/* Navigation - matching DraftRoom exactly */}
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
          <div className="mb-4">
            {teamInfo?.logos1 ? (
              <img 
                src={teamInfo.logos1} 
                alt={`${decodedTeamName} logo`}
                className="w-16 h-16 sm:w-20 sm:h-20 rounded-full mx-auto border-2 border-white/20 bg-white/10 p-2"
              />
            ) : (
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full mx-auto border-2 border-white/20 bg-white/10 flex items-center justify-center text-xl sm:text-2xl font-bold text-white/80">
                {decodedTeamName.substring(0, 2).toUpperCase()}
              </div>
            )}
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black mb-2 leading-tight">
            <span className="bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
              {decodedTeamName}
            </span>
          </h1>
          {teamInfo && (
            <p className="text-lg sm:text-xl text-white/80">
              {teamInfo.conference || "Independent"} • {teamInfo.currentSeason?.record || "0-0"}
            </p>
          )}
        </div>

        {/* Ownership Status */}
        {renderOwnershipStatus()}
        
        {/* Team Stats - FIXED TO USE NEW DATABASE FIELDS */}
        {teamInfo?.currentSeason && (
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20 mb-8">
            <h3 className="flex items-center gap-2 text-xl font-bold text-white mb-6">
              <TrendingUp size={20} />
              2025 Season Stats
            </h3>
            
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              <div className="bg-white/5 rounded-xl p-3 text-center">
                <div className="text-xs text-white/60 font-medium mb-1">Conference Record</div>
                <div className="text-lg font-bold text-white">
                  {teamInfo.currentSeason.confRecord || "0-0"}
                </div>
              </div>
              
              <div className="bg-white/5 rounded-xl p-3 text-center">
                <div className="text-xs text-white/60 font-medium mb-1">ATS Record</div>
                <div className="text-lg font-bold text-white">
                  {teamInfo.currentSeason.atsRecord || "0-0"}
                </div>
              </div>
              
              <div className="bg-white/5 rounded-xl p-3 text-center">
                <div className="text-xs text-white/60 font-medium mb-1">Fantasy Points</div>
                <div className="text-lg font-bold text-green-300">
                  {teamInfo.currentSeason.gamePoints || 0}
                </div>
              </div>
              
              <div className="bg-white/5 rounded-xl p-3 text-center">
                <div className="text-xs text-white/60 font-medium mb-1">Avg Weekly Fantasy</div>
                <div className="text-lg font-bold text-blue-300">
                  {(() => {
                    const gamesPlayed = parseRecord(teamInfo.currentSeason.record);
                    const gamePoints = teamInfo.currentSeason.gamePoints || 0;
                    return calculateAverage(gamePoints, gamesPlayed);
                  })()}
                </div>
              </div>
              
              <div className="bg-white/5 rounded-xl p-3 text-center">
                <div className="text-xs text-white/60 font-medium mb-1">Season Total Pts</div>
                <div className="text-lg font-bold text-purple-300">
                  {teamInfo.currentSeason.totalPointsFor || 0}
                </div>
              </div>
              
              <div className="bg-white/5 rounded-xl p-3 text-center">
                <div className="text-xs text-white/60 font-medium mb-1">Games Played</div>
                <div className="text-lg font-bold text-white">
                  {parseRecord(teamInfo.currentSeason.record)}
                </div>
              </div>
              
              <div className="bg-white/5 rounded-xl p-3 text-center">
                <div className="text-xs text-white/60 font-medium mb-1">Avg Points For</div>
                <div className="text-lg font-bold text-green-300">
                  {(() => {
                    const gamesPlayed = parseRecord(teamInfo.currentSeason.record);
                    const totalPointsFor = teamInfo.currentSeason.totalPointsFor || 0;
                    return calculateAverage(totalPointsFor, gamesPlayed);
                  })()}
                </div>
              </div>
              
              <div className="bg-white/5 rounded-xl p-3 text-center">
                <div className="text-xs text-white/60 font-medium mb-1">Avg Points Against</div>
                <div className="text-lg font-bold text-red-300">
                  {(() => {
                    const gamesPlayed = parseRecord(teamInfo.currentSeason.record);
                    const totalPointsAgainst = teamInfo.currentSeason.totalPointsAgainst || 0;
                    return calculateAverage(totalPointsAgainst, gamesPlayed);
                  })()}
                </div>
              </div>
            </div>

            {/* Next Game - Full Width if exists */}
            {teamInfo.currentSeason.nextOpponent && (
              <div className="mt-4 bg-white/5 rounded-xl p-4 text-center">
                <div className="text-xs text-white/60 font-medium mb-2">Next Game</div>
                <div className="text-lg font-bold text-white">
                  {teamInfo.currentSeason.nextGameIsHome === false ? "@" : "vs"} {teamInfo.currentSeason.nextOpponent}
                  {(teamInfo.currentSeason.nextOpponentSpreadDisplay || teamInfo.currentSeason.nextOpponentSpread) && 
                  (teamInfo.currentSeason.nextOpponentSpreadDisplay || teamInfo.currentSeason.nextOpponentSpread) !== "TBD" && (
                    <span className="text-white/60 font-normal"> 
                      ({teamInfo.currentSeason.nextOpponentSpreadDisplay || teamInfo.currentSeason.nextOpponentSpread})
                    </span>
                  )}
                </div>
                {teamInfo.currentSeason.nextGameDate && (
                  <div className="text-sm text-white/60 mt-1">
                    {new Date(teamInfo.currentSeason.nextGameDate).toLocaleDateString('en-US', { 
                      weekday: 'short', 
                      month: 'short', 
                      day: 'numeric' 
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Schedule */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl border border-white/20 overflow-hidden">
          <div className="p-6 border-b border-white/10">
            <h3 className="flex items-center gap-2 text-xl font-bold text-white">
              <Calendar size={20} />
              2025 Schedule ({schedule.length} games)
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
                    const dateInfo = formatDate(game.date);
                    
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
                            // FIXED: Get fantasy points from team's weekly points, not game document
                            if (game.gameComplete && teamInfo?.currentSeason?.weeklyPoints) {
                              const weekKey = `week${game.week}`;
                              const weeklyPoints = teamInfo.currentSeason.weeklyPoints[weekKey];
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
  );
}

export default TeamPage;