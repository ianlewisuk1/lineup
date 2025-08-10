import React, { useEffect, useState, useRef } from "react";
import { db, auth } from "../firebase/firebase";
import {
  collection,
  getDocs,
  getDoc,
  doc,
  updateDoc,
} from "firebase/firestore";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Plus, Search, Filter, ChevronDown } from "lucide-react";
import BottomNavBar from "../components/BottomNavBar";
import { logFreeAgentMove } from '../components/LogFreeAgentMove';

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
  const navigate = useNavigate();
  const [teamsByConference, setTeamsByConference] = useState({});
  const [conferenceList, setConferenceList] = useState([]);
  const [activeConference, setActiveConference] = useState("National");
  const [draftedTeams, setDraftedTeams] = useState({});
  const [loading, setLoading] = useState(true);
  const [userTeams, setUserTeams] = useState([]);
  const [selectedDropTeam, setSelectedDropTeam] = useState("");
  const [pendingAddTeam, setPendingAddTeam] = useState("");
  const [showSwapUI, setShowSwapUI] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [teamToAdd, setTeamToAdd] = useState(null);
  const [sortConfig, setSortConfig] = useState({ key: "school", direction: "asc" });
  const [searchQuery, setSearchQuery] = useState("");
  
  // Custom notification modal states
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [modalMessage, setModalMessage] = useState("");
  const [modalTitle, setModalTitle] = useState("");

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

  useEffect(() => {
    const fetchData = async () => {
      const teamsSnap = await getDocs(collection(db, "teams"));
      const membersSnap = await getDocs(collection(db, "leagues", leagueId, "members"));

      const teamsMap = {};
      const drafted = {};
      
      // Build drafted teams object
      membersSnap.forEach(doc => {
        const { displayName, teamName, lineup } = doc.data();
        const starters = lineup?.starters || [];
        const bench = lineup?.bench || [];
        const current = [...starters, ...bench];

        current.forEach(teamId => {
          // Teams are stored as document IDs, so use them directly
          if (teamId && teamId.trim()) {
            drafted[teamId] = {
              ownerName: displayName,
              teamName: teamName || "Unnamed Squad"
            };
          }
        });
      });

      // Build teams map
      teamsSnap.forEach(doc => {
        const data = doc.data();
        if ((data.classification || "").toUpperCase() !== "FBS") return;

        const conf = data.conference || "Unknown";
        if (!teamsMap[conf]) teamsMap[conf] = [];

        teamsMap[conf].push({
          id: doc.id,
          ...data,
          logo: data.logos1 || data.logos2 || null,
          currentWeekPoints: data.currentSeason?.currentWeekPoints || null,
          gameComplete: data.currentSeason?.gameComplete || false,
          color: data.color || null
        });
      });

      // Set state
      const sortedConf = Object.keys(teamsMap).sort();
      setConferenceList(["National", ...sortedConf]);
      setTeamsByConference(teamsMap);
      setActiveConference("National");
      setDraftedTeams(drafted);

      // Get current user's teams
      const user = auth.currentUser;
      if (!user) return;

      const memberRef = doc(db, "leagues", leagueId, "members", user.uid);
      const memberSnap = await getDoc(memberRef);
      const lineup = memberSnap.data()?.lineup || {};

      const starters = lineup.starters || [];
      const bench = lineup.bench || [];
      setUserTeams([...starters, ...bench].filter(Boolean));

      setLoading(false);
    };

    fetchData();
  }, [leagueId]);

  const handleTeamClick = (teamName) => {
    navigate(`/${leagueId}/team/${encodeURIComponent(teamName)}`);
  };

  const handleAddTeam = (team) => {
    const user = auth.currentUser;
    if (!user) return;

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

      // INCREMENT FREE AGENT MOVES COUNTER
      const currentMoves = memberData?.freeAgentMoves || 0;

      await updateDoc(memberRef, {
        "lineup.starters": starters,
        "lineup.bench": bench,
        "freeAgentMoves": currentMoves + 1
      });

      // Log the move for the news ticker
      try {
        // Get user's first name from users collection
        let firstName = "Unknown Manager";
        try {
          const userDoc = await getDoc(doc(db, "users", user.uid));
          if (userDoc.exists()) {
            const userData = userDoc.data();
            firstName = userData.firstName || userData.displayName || "Unknown Manager";
          }
        } catch (userError) {
          console.warn("Could not fetch user data for logging:", userError);
        }

        await logFreeAgentMove(leagueId, {
          userId: user.uid,
          teamName: firstName, // Use firstName from users collection
          pickedUp: teamToAdd.school,
          dropped: null,
          week: "Preseason", // You can change this to dynamic later
          moveType: 'pickup'
        });
      } catch (error) {
        console.error('Error logging move:', error);
        // Don't fail the whole operation if logging fails
      }

      setUserTeams([...starters, ...bench].filter(Boolean));
      
      // Update draftedTeams to reflect the new team ownership
      setDraftedTeams(prev => ({
        ...prev,
        [normalizedTeamName]: {
          ownerName: memberData.displayName || "You",
          teamName: memberData.teamName || "Your Team"
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
    
    try {
      const user = auth.currentUser;
      if (!user) return;

      const memberRef = doc(db, "leagues", leagueId, "members", user.uid);
      const memberSnap = await getDoc(memberRef);
      const memberData = memberSnap.data();
      
      const lineup = memberData?.lineup || {};
      const starters = [...(lineup.starters || [])];
      const bench = [...(lineup.bench || [])];
      
      // NORMALIZE THE NEW TEAM NAME
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

      // INCREMENT FREE AGENT MOVES COUNTER
      const currentMoves = memberData?.freeAgentMoves || 0;

      await updateDoc(memberRef, {
        "lineup.starters": starters,
        "lineup.bench": bench,
        "freeAgentMoves": currentMoves + 1
      });

      // Log the move for the news ticker
      try {
        // Get user's first name from users collection
        let firstName = "Unknown Manager";
        try {
          const userDoc = await getDoc(doc(db, "users", user.uid));
          if (userDoc.exists()) {
            const userData = userDoc.data();
            firstName = userData.firstName || userData.displayName || "Unknown Manager";
          }
        } catch (userError) {
          console.warn("Could not fetch user data for logging:", userError);
        }

        // Get display name for dropped team
        const droppedTeamData = Object.values(teamsByConference).flat().find(team => 
          team.school?.toLowerCase()
            .replace(/\s+/g, "-")
            .replace(/&/g, "-")
            .replace(/[^a-z0-9\-]/g, "") === selectedDropTeam
        );
        const droppedTeamName = droppedTeamData?.school || selectedDropTeam;

        await logFreeAgentMove(leagueId, {
          userId: user.uid,
          teamName: firstName, // Use firstName from users collection
          pickedUp: pendingAddTeam,
          dropped: droppedTeamName,
          week: "Preseason", // You can change this to dynamic later
          moveType: 'swap'
        });
      } catch (error) {
        console.error('Error logging move:', error);
        // Don't fail the whole operation if logging fails
      }

      setUserTeams([...starters, ...bench].filter(Boolean));
      
      // Update draftedTeams to reflect the swap
      setDraftedTeams(prev => {
        const updated = { ...prev };
        // Remove the dropped team from drafted teams (make it available again)
        delete updated[selectedDropTeam];
        // Add the new team as drafted by this user
        updated[normalizedNewTeam] = {
          ownerName: memberData.displayName || "You",
          teamName: memberData.teamName || "Your Team"
        };
        return updated;
      });
      
      setShowSwapUI(false);
      setPendingAddTeam("");
      setSelectedDropTeam("");
      
      // Get display names for the success message
      const droppedTeamData = Object.values(teamsByConference).flat().find(team => 
        team.school?.toLowerCase()
          .replace(/\s+/g, "-")
          .replace(/&/g, "-")
          .replace(/[^a-z0-9\-]/g, "") === selectedDropTeam
      );
      const droppedTeamName = droppedTeamData?.school || selectedDropTeam;
      
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

  const formatNextGame = (season) => {
    if (!season?.nextOpponent) return "—";
    
    const isHome = season.nextGameIsHome;
    const spread = season.nextOpponentSpread ?? "TBD";
    const prefix = isHome === false ? "@" : isHome === true ? "vs" : "?";
    
    // Format the date if available
    let dateStr = "";
    if (season.nextGameDate) {
      try {
        // Assuming date format is "2025-08-23"
        const date = new Date(season.nextGameDate);
        const month = date.getMonth() + 1;
        const day = date.getDate();
        dateStr = ` • ${month}/${day}`;
      } catch (error) {
        // If date parsing fails, just show without date
        dateStr = "";
      }
    }
    
    return `${prefix} ${season.nextOpponent} (${spread})${dateStr}`;
  };

  // Team Card Component with DraftRoom styling
  const TeamCard = ({ team }) => {
    if (!team) return null;

    const currentWeek = "Preseason";
    const previousWeek = currentWeek === "Preseason" ? null : `Week ${parseInt(currentWeek.replace("Week ", "")) - 1}`;
    const previousWeekPoints = previousWeek && team.weeklyPoints?.[previousWeek] 
      ? team.weeklyPoints[previousWeek] 
      : null;

    return (
      <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-4 mb-4 border border-white/20 transition-all duration-300 hover:bg-white/15">
        {/* Header with team info, sort data, and add button */}
        <div className="flex items-center gap-3 mb-3">
          {/* Team Logo */}
          <div className="w-8 h-8 rounded-full overflow-hidden border border-white/20 bg-white/5 flex-shrink-0 flex items-center justify-center">
            {team.logo ? (
              <img 
                src={team.logo}
                alt={team.school}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="text-xs font-bold text-white/60">
                {team.school ? team.school.split(' ').map(word => word[0]).join('').slice(0, 2) : '?'}
              </div>
            )}
          </div>

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
                {team.currentSeason?.gamePoints || 0}
              </div>
            </div>
            <div className="px-2 py-1 bg-white/10 rounded-lg text-center min-w-8">
              <div className="text-white/60 font-medium mb-0.5 text-xs">Record</div>
              <div className="text-white font-semibold text-xs">
                {team.currentSeason?.record || "0-0"}
              </div>
            </div>
          </div>

          {/* Add Button */}
          <button 
            onClick={() => handleAddTeam(team)}
            className="w-7 h-7 rounded-full bg-green-500 hover:bg-green-600 border-none text-white cursor-pointer flex items-center justify-center shadow-lg transition-all duration-200 hover:scale-105 flex-shrink-0"
          >
            <Plus size={12} />
          </button>
        </div>

        {/* Second Row: Conf Record, ATS, Prev Week Points */}
        <div className="grid grid-cols-3 gap-2 text-xs mb-2">
          <div className="px-2 py-1 bg-white/5 rounded-lg text-center">
            <div className="text-white/60 font-medium mb-0.5 text-xs">Conf. Record</div>
            <div className="text-white font-semibold text-xs">
              {team.currentSeason?.confRecord || "0-0"}
            </div>
          </div>

          <div className="px-2 py-1 bg-white/5 rounded-lg text-center">
            <div className="text-white/60 font-medium mb-0.5 text-xs">ATS Record</div>
            <div className="text-white font-semibold text-xs">
              {team.currentSeason?.ats || "0-0"}
            </div>
          </div>

          <div className="px-2 py-1 bg-white/5 rounded-lg text-center">
            <div className="text-white/60 font-medium mb-0.5 text-xs">Prev Week Pts</div>
            <div className="text-white font-semibold text-xs">
              {previousWeekPoints !== null ? previousWeekPoints : "N/A"}
            </div>
          </div>
        </div>

        {/* Third Row: Next Game */}
        <div className="px-2 py-2 bg-white/5 rounded-lg text-xs text-center">
          <div className="text-white/60 font-medium mb-1 text-xs">Next Game</div>
          <div className="text-white font-semibold text-xs">
            {formatNextGame(team.currentSeason)}
          </div>
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
    </div>
  );
}

export default FreeAgents;