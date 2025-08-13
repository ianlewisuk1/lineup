import React, { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { auth, db } from "../firebase/firebase";
import {
  doc,
  getDoc,
  collection,
  getDocs,
  updateDoc
} from "firebase/firestore";
import BottomNavBar from "../components/BottomNavBar";
import ScoringSystemModal from "../components/ScoringSystemModal";
import { logFreeAgentMove } from '../components/LogFreeAgentMove';
import { Settings, Trophy, Users, Star, TrendingUp, Calendar, ChevronDown, ChevronUp } from "lucide-react";
import { weeklyLineupUtils, adminUtils } from '../utils/weeklyLineupUtils';
import WeeklyLineupManager from "../components/WeeklyLineupManager";

function MyLineup() {
  const { leagueId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [teamName, setTeamName] = useState("");
  const [starters, setStarters] = useState([]);
  const [bench, setBench] = useState([]);
  const [smackTalk, setSmackTalk] = useState("");
  const [isEditingSmackTalk, setIsEditingSmackTalk] = useState(false);
  const [smackTalkSaving, setSmackTalkSaving] = useState(false);
  const [allTeams, setAllTeams] = useState({});
  const [showSwapModal, setShowSwapModal] = useState(false);
  const [swapFromIndex, setSwapFromIndex] = useState(null);
  const [swapFromType, setSwapFromType] = useState(null);
  const [showCutModal, setShowCutModal] = useState(false);
  const [teamToCut, setTeamToCut] = useState(null);
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [moveModalData, setMoveModalData] = useState(null);
  const [squadPoints, setSquadPoints] = useState(0);
  const [rosterLockDate, setRosterLockDate] = useState("");
  const [rosterLockTime, setRosterLockTime] = useState("");
  const [currentWeek, setCurrentWeek] = useState("Preseason");
  const [expandedTeams, setExpandedTeams] = useState(Array(7).fill(false));
  const [showScoringModal, setShowScoringModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [showScheduleGrid, setShowScheduleGrid] = useState(false);
  const [scheduleData, setScheduleData] = useState({});
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [weekNumbers, setWeekNumbers] = useState([]);
  const [userData, setUserData] = useState(null);

  const openCutModal = (team, index, section) => {
    setTeamToCut({ team, index, section });
    setShowCutModal(true);
  };

  const confirmCut = () => {
    if (teamToCut) {
      handleCutTeam(teamToCut.team, teamToCut.index, teamToCut.section);
      setShowCutModal(false);
      setTeamToCut(null);
    }
  };

  const handleMoveTeam = (team, fromSection, fromIndex, toSection) => {
    const hasVacancy = toSection === 'starters' 
      ? starters.some(t => t === null)
      : bench.some(t => t === null);

    if (hasVacancy) {
      // Direct move - there's an empty slot
      if (toSection === 'starters') {
        moveToStarters(team, fromIndex);
      } else {
        moveToBench(team, fromIndex);
      }
    } else {
      // Show modal to select which team to replace
      setMoveModalData({
        movingTeam: team,
        fromSection,
        fromIndex,
        toSection,
        availableTeams: toSection === 'starters' ? starters : bench
      });
      setShowMoveModal(true);
    }
  };

  const confirmMove = (replacedTeamIndex) => {
    if (!moveModalData) return;

    const { movingTeam, fromSection, fromIndex, toSection } = moveModalData;
    
    const newStarters = [...starters];
    const newBench = [...bench];

    if (toSection === 'starters') {
      // Moving to starters - replace the selected starter
      const replacedTeam = newStarters[replacedTeamIndex];
      newStarters[replacedTeamIndex] = movingTeam;
      newBench[fromIndex] = replacedTeam;
    } else {
      // Moving to bench - replace the selected bench player
      const replacedTeam = newBench[replacedTeamIndex];
      newBench[replacedTeamIndex] = movingTeam;
      newStarters[fromIndex] = replacedTeam;
    }

    setStarters(newStarters);
    setBench(newBench);

    const currentUser = auth.currentUser;
    if (currentUser) {
      const normalizeTeamName = (team) => {
        if (!team?.school) return null;
        return team.school
          .toLowerCase()
          .replace(/\s+/g, "-")
          .replace(/&/g, "")
          .replace(/[^a-z0-9\-]/g, "");
      };

      const memberRef = doc(db, "leagues", leagueId, "members", currentUser.uid);
      updateDoc(memberRef, {
        "lineup.starters": newStarters.map(t => normalizeTeamName(t)),
        "lineup.bench": newBench.map(t => normalizeTeamName(t))
      });
    }

    setShowMoveModal(false);
    setMoveModalData(null);
  };
  
  const fetchScheduleData = async () => {
    if (Object.keys(scheduleData).length > 0) return; // Already loaded
    
    setScheduleLoading(true);
    try {
      // Get all weeks
      const weeksSnap = await getDocs(collection(db, "schedule", "2025", "weeks"));
      const weeks = [];
      const schedule = {};

      // Collect all week numbers
      weeksSnap.forEach(weekDoc => {
        const weekNum = parseInt(weekDoc.id);
        if (!isNaN(weekNum) && weekNum < 15) {
          weeks.push(weekNum);
        }
      });

      weeks.sort((a, b) => a - b);
      setWeekNumbers(weeks);

      // Fetch games for each week
      for (const weekNum of weeks) {
        const gamesSnap = await getDocs(collection(db, "schedule", "2025", "weeks", weekNum.toString(), "games"));
        
        gamesSnap.forEach(gameDoc => {
          const gameData = gameDoc.data();
          const { homeTeam, awayTeam, homePoints, awayPoints, gameComplete, date } = gameData;
          
          if (!schedule[weekNum]) schedule[weekNum] = {};
          
          // Store game data for both teams
          if (homeTeam) {
            schedule[weekNum][homeTeam] = {
              opponent: awayTeam,
              isHome: true,
              homePoints,
              awayPoints,
              gameComplete,
              date
            };
          }
          
          if (awayTeam) {
            schedule[weekNum][awayTeam] = {
              opponent: homeTeam,
              isHome: false,
              homePoints,
              awayPoints,
              gameComplete,
              date
            };
          }
        });
      }

      setScheduleData(schedule);
    } catch (error) {
      console.error("Error fetching schedule data:", error);
    } finally {
      setScheduleLoading(false);
    }
  };

  // Get game info for a specific team and week
  const getGameInfo = (teamName, weekNum) => {
    if (!scheduleData[weekNum] || !teamName) return null;
    return scheduleData[weekNum][teamName] || null;
  };

  // User Avatar Component for MyLineup
  const UserAvatar = ({ member, size = 80 }) => {
    const avatarUrl = member?.teamAvatar;
    
    // Handle custom uploaded images (URLs or base64) vs preset avatars
    const isCustomUpload = avatarUrl && (avatarUrl.startsWith('http') || avatarUrl.startsWith('data:'));
    
    return (
      <div className="relative">
        <div 
          className="rounded-full flex items-center justify-center font-bold text-lg flex-shrink-0 shadow-lg overflow-hidden border-4 border-white/30"
          style={{
            width: size,
            height: size,
            backgroundColor: "rgba(255, 255, 255, 0.2)",
            color: "white"
          }}
        >
          {avatarUrl ? (
            isCustomUpload ? (
              // Custom uploaded image (URL or base64)
              <img 
                src={avatarUrl} 
                alt="Team avatar"
                className="w-full h-full object-cover"
                onError={(e) => {
                  // Fallback to initials if image fails to load
                  e.target.style.display = 'none';
                  e.target.nextSibling.style.display = 'flex';
                }}
              />
            ) : (
              // Preset numbered avatar
              <div className="w-full h-full bg-gradient-to-r from-purple-500 to-blue-500 text-white text-xl font-bold flex items-center justify-center">
                {['avatar1.png', 'avatar2.png', 'avatar3.png', 'avatar4.png', 'avatar5.png', 'avatar6.png', 'avatar7.png', 'avatar8.png'].indexOf(avatarUrl) + 1}
              </div>
            )
          ) : (
            // Fallback to team initials
            <div className="w-full h-full flex items-center justify-center text-xl font-bold">
              {teamName ? teamName.charAt(0).toUpperCase() : '?'}
            </div>
          )}
          
          {/* Fallback initials (hidden by default, shown if image fails) */}
          <div 
            className="w-full h-full flex items-center justify-center text-xl font-bold"
            style={{ display: 'none' }}
          >
            {teamName ? teamName.charAt(0).toUpperCase() : '?'}
          </div>
        </div>
      </div>
    );
  };

  // Format game display
  const formatGameDisplay = (gameInfo) => {
    if (!gameInfo) return "BYE";
    
    const { opponent, isHome, homePoints, awayPoints, gameComplete } = gameInfo;
    const prefix = isHome ? "vs" : "@";
    
    if (gameComplete && homePoints !== null && awayPoints !== null) {
      const teamScore = isHome ? homePoints : awayPoints;
      const oppScore = isHome ? awayPoints : homePoints;
      const result = teamScore > oppScore ? "W" : teamScore < oppScore ? "L" : "T";
      return `${result} ${teamScore}-${oppScore} ${prefix} ${opponent}`;
    }
    
    return `${prefix} ${opponent}`;
  };

  // Team Logo Component (reused from MyLeague)
  const TeamLogo = ({ teamName, size = 48, clickable = false }) => {
    const normalize = (name) =>
      name
        ?.toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/&/g, "")
        .replace(/[^a-z0-9\-]/g, "");

    const team = allTeams[normalize(teamName)];
    const logoUrl = team?.logo;

    const handleClick = () => {
      if (clickable && teamName) {
        navigate(`/${leagueId}/team/${encodeURIComponent(teamName)}`);
      }
    };

    const logoStyle = {
      width: size,
      height: size,
      borderRadius: "50%",
      overflow: "hidden",
      border: "2px solid rgba(255, 255, 255, 0.3)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "white", // Changed from rgba to white
      cursor: clickable ? "pointer" : "default",
      transition: "all 0.3s ease",
      flexShrink: 0,
      boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)",
      transform: "scale(1)",
      position: "relative",
      backdropFilter: "blur(10px)"
    };

    if (logoUrl) {
      return (
        <div style={{ position: "relative", display: "inline-block" }}>
          {/* Weekly Points Badge - Made Larger */}
          {clickable && (
            <div style={{
              position: "absolute",
              top: "-8px",
              right: "-8px",
              backgroundColor: team?.gameComplete 
                ? (team?.currentWeekPoints > 0 ? "#10b981" : "#6b7280")
                : "#f59e0b",
              color: "white",
              borderRadius: "50%",
              width: "28px", // Increased from 18px
              height: "28px", // Increased from 18px
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "12px", // Increased from 9px
              fontWeight: "700",
              zIndex: 10,
              border: "2px solid rgba(255, 255, 255, 0.3)",
              boxShadow: "0 2px 6px rgba(0, 0, 0, 0.2)"
            }}>
              {team?.gameComplete ? (team?.currentWeekPoints || 0) : "?"}
            </div>
          )}
          
          <div 
            style={logoStyle}
            onClick={handleClick}
            onMouseEnter={(e) => {
              if (clickable) {
                e.currentTarget.style.transform = "scale(1.05)";
                e.currentTarget.style.boxShadow = "0 6px 20px rgba(59, 130, 246, 0.3)";
              }
            }}
            onMouseLeave={(e) => {
              if (clickable) {
                e.currentTarget.style.transform = "scale(1)";
                e.currentTarget.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.1)";
              }
            }}
            title={clickable ? `Click to view ${teamName} details` : teamName}
          >
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
              fontSize: size < 30 ? '10px' : '12px',
              fontWeight: '600',
              color: '#1e293b', // Changed to dark color for white background
              textAlign: 'center',
              background: 'white' // Changed to white
            }}>
              {teamName ? teamName.split(' ').map(word => word[0]).join('').slice(0, 3) : '?'}
            </div>
          </div>
        </div>
      );
    }

    // Fallback placeholder
    return (
      <div style={{ position: "relative", display: "inline-block" }}>
        {/* Weekly Points Badge - Made Larger */}
        {clickable && (
          <div style={{
            position: "absolute",
            top: "-8px",
            right: "-8px",
            backgroundColor: team?.gameComplete 
              ? (team?.currentWeekPoints > 0 ? "#10b981" : "#6b7280")
              : "#f59e0b",
            color: "white",
            borderRadius: "50%",
            width: "28px", // Increased from 18px
            height: "28px", // Increased from 18px
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "12px", // Increased from 9px
            fontWeight: "700",
            zIndex: 10,
            border: "2px solid rgba(255, 255, 255, 0.3)",
            boxShadow: "0 2px 6px rgba(0, 0, 0, 0.2)"
          }}>
            {team?.gameComplete ? (team?.currentWeekPoints || 0) : "?"}
          </div>
        )}
        
        <div 
          style={{
            ...logoStyle,
            background: "white", // Changed to white
            color: "#1e293b", // Changed to dark color
            fontSize: size < 30 ? '10px' : '12px',
            fontWeight: '600'
          }}
          onClick={handleClick}
          onMouseEnter={(e) => {
            if (clickable) {
              e.currentTarget.style.transform = "scale(1.05)";
              e.currentTarget.style.boxShadow = "0 6px 20px rgba(59, 130, 246, 0.3)";
            }
          }}
          onMouseLeave={(e) => {
            if (clickable) {
              e.currentTarget.style.transform = "scale(1)";
              e.currentTarget.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.1)";
            }
          }}
          title={clickable ? `Click to view ${teamName} details` : teamName}
        >
          {teamName ? teamName.split(' ').map(word => word[0]).join('').slice(0, 3) : '?'}
        </div>
      </div>
    );
  };

  // Success Modal Component
  const SuccessModal = () => {
    if (!showSuccessModal) return null;

    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-white/95 backdrop-blur-lg rounded-2xl p-6 max-w-md w-full border border-white/20 shadow-2xl animate-pulse">
          <div className="text-center">
            <div className="text-4xl mb-4">✅</div>
            <h3 className="text-xl font-bold text-gray-900 mb-4">
              Success!
            </h3>
            <p className="text-gray-600 mb-6">
              {successMessage}
            </p>
            <button
              onClick={() => setShowSuccessModal(false)}
              className="w-full py-3 px-4 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors duration-200"
            >
              Got it!
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Move Modal Component
  const MoveModal = () => {
    if (!showMoveModal || !moveModalData) return null;

    const { movingTeam, toSection, availableTeams } = moveModalData;
    const isMovingToStarters = toSection === 'starters';

    // Helper function to format next game info
    const formatNextGame = (team) => {
      if (!team?.currentSeason?.nextOpponent) return "No game scheduled";
      
      const { nextOpponent, nextGameIsHome, nextOpponentSpread } = team.currentSeason;
      const prefix = nextGameIsHome ? "vs" : "@";
      const spread = nextOpponentSpread || "TBD";
      
      return `${prefix} ${nextOpponent} (${spread})`;
    };

    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-white/95 backdrop-blur-lg rounded-2xl p-6 max-w-md w-full border border-white/20 shadow-2xl">
          <h3 className="text-xl font-bold text-gray-900 mb-4 text-center">
            {isMovingToStarters ? 'Replace Starter' : 'Replace Bench Team'}
          </h3>
          
          <p className="text-center mb-4 text-gray-600">
            Which {isMovingToStarters ? 'starter' : 'bench team'} should {movingTeam.school} replace?
          </p>

          <div className="space-y-3 mb-6 max-h-60 overflow-y-auto">
            {availableTeams.map((team, index) => (
              team && (
                <button
                  key={index}
                  onClick={() => confirmMove(index)}
                  className="w-full p-4 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-lg transition-all duration-200 flex items-center justify-between shadow-lg hover:shadow-blue-500/25 transform hover:scale-105"
                >
                  <div className="text-left flex-1">
                    <div className="text-sm font-bold mb-1">
                      {team.school}
                    </div>
                    <div className="text-xs text-blue-100 mb-1">
                      {team.conference}
                    </div>
                    {/* Next Game Info */}
                    <div className="text-xs text-blue-200 font-medium">
                      {formatNextGame(team)}
                    </div>
                    {/* Optional: Game Date */}
                    {team.currentSeason?.nextGameDate && (
                      <div className="text-xs text-blue-300 mt-1">
                        {new Date(team.currentSeason.nextGameDate).toLocaleDateString('en-US', { 
                          month: 'short', 
                          day: 'numeric' 
                        })}
                      </div>
                    )}
                  </div>
                  <div className="text-blue-200 ml-2">
                    →
                  </div>
                </button>
              )
            ))}
          </div>

          <button
            onClick={() => setShowMoveModal(false)}
            className="w-full py-3 px-4 bg-gray-500 hover:bg-gray-600 text-white rounded-lg font-medium transition-colors duration-200"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  };

  const CutModal = () => {
    if (!showCutModal) return null;

    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-white/95 backdrop-blur-lg rounded-2xl p-6 max-w-md w-full border border-white/20 shadow-2xl">
          <h3 className="text-xl font-bold text-gray-900 mb-4 text-center">
            Cut {teamToCut?.team?.school}?
          </h3>
          
          <p className="text-center mb-6 text-gray-600">
            This will remove them from your lineup completely.
          </p>

          <div className="flex gap-3">
            <button
              onClick={() => setShowCutModal(false)}
              className="flex-1 py-3 px-4 bg-gray-500 hover:bg-gray-600 text-white rounded-lg font-medium transition-colors duration-200"
            >
              Cancel
            </button>
            <button
              onClick={confirmCut}
              className="flex-1 py-3 px-4 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors duration-200"
            >
              Cut Team
            </button>
          </div>
        </div>
      </div>
    );
  };

  const ScheduleGrid = () => {
    if (!showScheduleGrid) return null;

    const allMyTeams = [...starters, ...bench].filter(team => team !== null);

    if (scheduleLoading) {
      return (
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20 mb-6">
          <div className="flex items-center justify-center py-8">
            <div className="text-center">
              <div className="text-2xl mb-2 animate-spin">📅</div>
              <p className="text-white/80">Loading schedule...</p>
            </div>
          </div>
        </div>
      );
    }

    if (allMyTeams.length === 0) {
      return (
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20 mb-6">
          <p className="text-white/60 text-center py-8">
            Add teams to your lineup to see their schedule grid.
          </p>
        </div>
      );
    }

    return (
      <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20 mb-6">
        <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-max">
              <thead>
                <tr className="bg-white/10">
                  <th className="sticky left-0 bg-white/10 px-4 py-3 text-left text-white font-bold border-r border-white/20 min-w-[80px]">
                    Team
                  </th>
                  {weekNumbers.map(weekNum => (
                    <th 
                      key={weekNum} 
                      className="px-3 py-3 text-center text-white font-bold border-r border-white/10 min-w-[140px] text-sm"
                    >
                      Week {weekNum}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allMyTeams.map((team, teamIndex) => (
                  <tr 
                    key={team.school} 
                    className="border-b border-white/10 hover:bg-white/5 transition-colors duration-200"
                  >
                    <td className="sticky left-0 bg-white/10 px-4 py-3 border-r border-white/20">
                      <div className="flex items-center justify-center">
                        <TeamLogo teamName={team.school} size={36} clickable={false} />
                      </div>
                    </td>
                    {weekNumbers.map(weekNum => {
                      const gameInfo = getGameInfo(team.school, weekNum);
                      const gameDisplay = formatGameDisplay(gameInfo);
                      const isBye = gameDisplay === "BYE";
                      const isWin = gameDisplay.startsWith("W ");
                      const isLoss = gameDisplay.startsWith("L ");
                      
                      return (
                        <td 
                          key={weekNum}
                          className="px-3 py-3 border-r border-white/10 text-center"
                        >
                          <div className={`text-xs font-medium px-2 py-1 rounded ${
                            isBye 
                              ? 'text-gray-400 bg-gray-500/20' 
                              : isWin
                              ? 'text-green-300 bg-green-500/20'
                              : isLoss
                              ? 'text-red-300 bg-red-500/20'
                              : 'text-white bg-blue-500/20'
                          }`}>
                            {gameDisplay}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-4 text-xs text-white/60 text-center">
          💡 Scroll horizontally to see all weeks
        </div>
      </div>
    );
  };

  // Add this inside the component (temporarily for testing)
  useEffect(() => {
    // Make functions available globally for testing
    window.weeklyLineupUtils = weeklyLineupUtils;
    window.adminUtils = adminUtils;
  }, []);

  useEffect(() => {
    const fetchLineup = async () => {
      const currentUser = auth.currentUser;
      if (!currentUser) return;

      const memberRef = doc(db, "leagues", leagueId, "members", currentUser.uid);
      const memberSnap = await getDoc(memberRef);
      const memberData = memberSnap.data();

      // Add this line to store the user data for the avatar
      setUserData(memberData);

      const starterList = memberData?.lineup?.starters || [];
      const benchList = memberData?.lineup?.bench || [];

      setTeamName(memberData?.teamName || "Unnamed Squad");
      setSmackTalk(memberData?.smackTalk || "");
      setSquadPoints(memberData?.points || 0);

      // Fetch season info for roster lock
      const seasonRef = doc(db, "config", "season");
      const seasonSnap = await getDoc(seasonRef);
      const seasonData = seasonSnap.data();
      
      setRosterLockDate(seasonData?.rosterLockDate || "");
      setRosterLockTime(seasonData?.rosterLockTime || "");
      setCurrentWeek(seasonData?.currentWeek || "Preseason");

      const teamsSnap = await getDocs(collection(db, "teams"));
      const teamsMap = {};
      teamsSnap.forEach(doc => {
        const teamData = doc.data();
        if (teamData.school) {
          const normalize = (name) =>
            name
              ?.toLowerCase()
              .replace(/\s+/g, "-")
              .replace(/&/g, "")
              .replace(/[^a-z0-9\-]/g, "");

          teamsMap[normalize(teamData.school)] = {
            id: doc.id,
            ...teamData,
            logo: teamData.logos1 || teamData.logos2 || null,
            logos1: teamData.logos1 || null,
            logos2: teamData.logos2 || null,
            colors: teamData.colors || {},
            conference: teamData.conference || "Unknown",
            mascot: teamData.mascot || "",
            city: teamData.city || "",
            state: teamData.state || "",
            currentWeekPoints: teamData.currentSeason?.currentWeekPoints || null,
            gameComplete: teamData.currentSeason?.gameComplete || false,
            name: teamData.school,
            school: teamData.school
          };
        }
      });
      setAllTeams(teamsMap);

      // Create a reverse lookup map
      const schoolToTeamMap = {};
      Object.values(teamsMap).forEach(team => {
        if (team.school) {
          const normalizedSchool = team.school
            .toLowerCase()
            .replace(/\s+/g, "-")
            .replace(/&/g, "-")
            .replace(/[^a-z0-9\-]/g, "");
          schoolToTeamMap[normalizedSchool] = team;
        }
      });

      // Resolve teams using the normalized school names
      const startersResolved = starterList.map(schoolName => 
        schoolName ? schoolToTeamMap[schoolName] || null : null
      );
      const benchResolved = benchList.map(schoolName => 
        schoolName ? schoolToTeamMap[schoolName] || null : null
      );

      setStarters(startersResolved);
      setBench(benchResolved);
      setLoading(false);
    };

    fetchLineup();
  }, [leagueId]);

  useEffect(() => {
    if (showScheduleGrid && Object.keys(scheduleData).length === 0) {
      fetchScheduleData();
    }
  }, [showScheduleGrid]);

  const handleTeamClick = (teamName) => {
    navigate(`/${leagueId}/team/${encodeURIComponent(teamName)}`);
  };

  const handleSwap = (starterIndex, benchTeam) => {
    const starterTeam = starters[starterIndex];
    const newStarters = [...starters];
    const newBench = [...bench];

    newStarters[starterIndex] = benchTeam;
    const benchIndex = newBench.findIndex(t => t?.school === benchTeam.school);
    newBench[benchIndex] = starterTeam;

    setStarters(newStarters);
    setBench(newBench);

    const currentUser = auth.currentUser;
    if (!currentUser) return;

    const normalizeTeamName = (team) => {
      if (!team?.school) return null;
      return team.school
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/&/g, "")
        .replace(/[^a-z0-9\-]/g, "");
    };

    const memberRef = doc(db, "leagues", leagueId, "members", currentUser.uid);
    updateDoc(memberRef, {
      "lineup.starters": newStarters.map(t => normalizeTeamName(t)),
      "lineup.bench": newBench.map(t => normalizeTeamName(t))
    });
  };

  const moveToStarters = (benchTeam, benchIndex) => {
    const normalizeTeamName = (team) => {
      if (!team?.school) return null;
      return team.school
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/&/g, "")
        .replace(/[^a-z0-9\-]/g, "");
    };
    
    const emptyStarterIndex = starters.findIndex(t => t === null);
    if (emptyStarterIndex === -1) return;

    const newStarters = [...starters];
    const newBench = [...bench];

    newStarters[emptyStarterIndex] = benchTeam;
    newBench[benchIndex] = null;

    setStarters(newStarters);
    setBench(newBench);

    const currentUser = auth.currentUser;
    if (!currentUser) return;

    const memberRef = doc(db, "leagues", leagueId, "members", currentUser.uid);
    updateDoc(memberRef, {
      "lineup.starters": newStarters.map(t => normalizeTeamName(t)),
      "lineup.bench": newBench.map(t => normalizeTeamName(t))
    });
  };

  const moveToBench = (starterTeam, starterIndex) => {
    const normalizeTeamName = (team) => {
      if (!team?.school) return null;
      return team.school
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/&/g, "")
        .replace(/[^a-z0-9\-]/g, "");
    };
    
    const emptyBenchIndex = bench.findIndex(t => t === null);
    if (emptyBenchIndex === -1) return;

    const newStarters = [...starters];
    const newBench = [...bench];

    newStarters[starterIndex] = null;
    newBench[emptyBenchIndex] = starterTeam;

    setStarters(newStarters);
    setBench(newBench);

    const currentUser = auth.currentUser;
    if (!currentUser) return;

    const memberRef = doc(db, "leagues", leagueId, "members", currentUser.uid);
    updateDoc(memberRef, {
      "lineup.starters": newStarters.map(t => normalizeTeamName(t)),
      "lineup.bench": newBench.map(t => normalizeTeamName(t))
    });
  };

  const handleCutTeam = async (team, index, section) => {
    const normalizeTeamName = (team) => {
      if (!team?.school) return null;
      return team.school
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/&/g, "")
        .replace(/[^a-z0-9\-]/g, "");
    };

    const newStarters = [...starters];
    const newBench = [...bench];
    
    if (section === 'starters') {
      newStarters[index] = null;
    } else {
      newBench[index] = null;
    }
    
    setStarters(newStarters);
    setBench(newBench);
    
    const currentUser = auth.currentUser;
    if (!currentUser) return;

    const memberRef = doc(db, "leagues", leagueId, "members", currentUser.uid);
    await updateDoc(memberRef, {
      "lineup.starters": newStarters.map(t => normalizeTeamName(t)),
      "lineup.bench": newBench.map(t => normalizeTeamName(t))
    });

    // Log the cut for the news ticker
    try {
      // Get user's first name
      let firstName = "Unknown Manager";
      try {
        const userDoc = await getDoc(doc(db, "users", currentUser.uid));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          firstName = userData.firstName || userData.displayName || "Unknown Manager";
        }
      } catch (userError) {
        console.warn("Could not fetch user data for logging:", userError);
      }

      await logFreeAgentMove(leagueId, {
        userId: currentUser.uid,
        teamName: firstName, // Use firstName instead of teamName
        pickedUp: null,
        dropped: team.school,
        week: currentWeek,
        moveType: 'drop'
      });
    } catch (error) {
      console.error('Error logging move:', error);
      // Don't fail the whole operation if logging fails
    }

    // Show styled success modal instead of alert
    setSuccessMessage(`${team.school} has been cut from your lineup.`);
    setShowSuccessModal(true);
  };

  const handleSaveSmackTalk = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) return;

    setSmackTalkSaving(true);
    try {
      const memberRef = doc(db, "leagues", leagueId, "members", currentUser.uid);
      await updateDoc(memberRef, {
        smackTalk: smackTalk.trim()
      });
      setIsEditingSmackTalk(false);
      setSuccessMessage("Smack talk updated!");
      setShowSuccessModal(true);
    } catch (error) {
      console.error("Error saving smack talk:", error);
      setSuccessMessage("Failed to save smack talk. Please try again.");
      setShowSuccessModal(true);
    } finally {
      setSmackTalkSaving(false);
    }
  };

  const formatNextGame = (season) => {
    if (!season?.nextOpponent) return "—";
    const isHome = season.nextGameIsHome;
    const spread = season.nextOpponentSpreadDisplay ?? season.nextOpponentSpread ?? "TBD";
    const prefix = isHome === false ? "@" : isHome === true ? "vs" : "?";
    return `${prefix} ${season.nextOpponent} (${spread})`;
  };

  const formatRosterLockInfo = () => {
    if (!rosterLockDate || !rosterLockTime) return "";
    
    try {
      const dateParts = rosterLockDate.split('-');
      if (dateParts.length !== 3) {
        return `${rosterLockDate} at ${rosterLockTime}`;
      }
      
      const year = dateParts[0];
      const monthNum = parseInt(dateParts[1], 10);
      const day = parseInt(dateParts[2], 10);
      
      const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
      ];
      
      const monthName = monthNames[monthNum - 1];
      
      const cleanTime = rosterLockTime.trim().replace(/"/g, '');
      const timeParts = cleanTime.split(':');
      
      if (timeParts.length === 0) {
        return `${monthName} ${day} at ${cleanTime} EST`;
      }
      
      const hour = parseInt(timeParts[0], 10);
      
      if (isNaN(hour)) {
        return `${monthName} ${day} at ${cleanTime} EST`;
      }
      
      const isAM = hour < 12;
      const displayHour = hour === 0 ? 12 : (hour > 12 ? hour - 12 : hour);
      const ampm = isAM ? 'am' : 'pm';
      
      return `${monthName} ${day} at ${displayHour}${ampm} EST`;
      
    } catch (error) {
      console.error('Error formatting roster lock date:', error);
      return `${rosterLockDate} at ${rosterLockTime}`;
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

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-4 sm:left-10 w-48 sm:w-72 h-48 sm:h-72 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full blur-3xl animate-pulse"></div>
        </div>
        <div className="relative z-10 flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="text-4xl mb-4 animate-spin">🏈</div>
            <p className="text-xl text-white/80">Loading your lineup...</p>
          </div>
        </div>
      </div>
    );
  }

  const hasEmptyStarterSlots = starters.some(t => t === null);
  const hasEmptyBenchSlots = bench.some(t => t === null);

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

      {/* Header */}
      <div className="relative z-10 text-center mb-8 px-4 sm:px-6">
        {/* Team Avatar and Info */}
        <div className="flex flex-col items-center gap-4 mb-4">
          <UserAvatar member={userData} size={120} />
          
          <div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black leading-tight mb-2">
              <span className="bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
                {teamName}
              </span>
            </h1>
            <div className="text-2xl font-bold text-blue-400 mb-2">
              {squadPoints.toLocaleString()} Season Pts
            </div>
            <p className="text-lg sm:text-xl text-white/80">
              Current Week: {currentWeek}
            </p>
          </div>
        </div>
      </div>

      {/* Roster Lock Info */}
      {rosterLockDate && rosterLockTime && (
        <div className="relative z-10 mx-4 sm:mx-6 mb-6 bg-yellow-400/20 backdrop-blur-sm border border-yellow-400/30 rounded-xl p-4 text-center">
          <div className="text-yellow-400 font-semibold">
            ⏰ Roster locks on {formatRosterLockInfo()}
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 pb-32">
        
        {/* Smack Talk Section */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold text-white flex items-center gap-2">
              💬 Smack Talk
            </h3>
            <div className="flex gap-2">
              {!isEditingSmackTalk && (
                <button
                  onClick={() => setIsEditingSmackTalk(true)}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-200"
                >
                  Edit
                </button>
              )}
            </div>
          </div>

          {isEditingSmackTalk ? (
            <div>
              <textarea
                value={smackTalk}
                onChange={(e) => setSmackTalk(e.target.value.slice(0, 80))}
                placeholder="Say something to intimidate your opponents... (max 80 chars)"
                className="w-full min-h-[80px] p-4 bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl text-white placeholder-white/60 resize-none focus:outline-none focus:border-blue-400 transition-colors duration-200"
              />
              <div className="flex justify-between items-center mt-3">
                <span className={`text-sm ${smackTalk.length > 70 ? 'text-red-400' : 'text-white/60'}`}>
                  {smackTalk.length}/80 characters
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setIsEditingSmackTalk(false)}
                    className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg text-sm font-medium transition-colors duration-200"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveSmackTalk}
                    disabled={smackTalkSaving}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-500 text-white rounded-lg text-sm font-medium transition-colors duration-200"
                  >
                    {smackTalkSaving ? "Saving..." : "Save"}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div>
              {smackTalk.trim() ? (
                <div className="bg-gradient-to-r from-blue-500 to-purple-500 text-white px-4 py-3 rounded-2xl inline-block max-w-full relative">
                  {smackTalk}
                  <div className="absolute bottom-0 left-4 transform translate-y-full">
                    <div className="w-0 h-0 border-l-[6px] border-r-[6px] border-t-[6px] border-l-transparent border-r-transparent border-t-blue-500" />
                  </div>
                </div>
              ) : (
                <p className="text-white/60 italic">
                  No smack talk set. Click Edit to add some trash talk for your opponents to see!
                </p>
              )}
            </div>
          )}
        </div>
        
        {/* Schedule Grid Toggle */}
        <div className="mb-6">
          <button
            onClick={() => setShowScheduleGrid(!showScheduleGrid)}
            className="w-full bg-white/10 backdrop-blur-lg rounded-2xl p-4 border border-white/20 hover:bg-white/15 transition-all duration-200 flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <Calendar className="text-blue-400" size={24} />
              <span className="text-xl font-bold text-white">📅 Season Schedule Grid</span>
            </div>
            {showScheduleGrid ? (
              <ChevronUp className="text-white/60" size={24} />
            ) : (
              <ChevronDown className="text-white/60" size={24} />
            )}
          </button>
        </div>

        {/* Schedule Grid */}
        <ScheduleGrid />

        {/* WEEKLY LINEUP MANAGER - Replaces old starters/bench sections */}
        <WeeklyLineupManager
          leagueId={leagueId}
          userId={auth.currentUser?.uid}
          allTeams={allTeams}
          currentWeek={parseInt(currentWeek)}
          onTeamClick={handleTeamClick}
          TeamLogo={TeamLogo}
        />



{/* Free Agent Instructions */}
       <div className="bg-blue-500/20 backdrop-blur-sm border border-blue-400/30 rounded-xl p-4 mb-6">
         <div className="flex items-center gap-3 text-blue-300">
           <div className="text-2xl">💡</div>
           <div>
             <div className="font-semibold text-blue-200">Want to add new teams?</div>
             <div className="text-sm text-blue-300 mt-1">
               Cut a team to make room, or visit the{" "}
               <Link 
                 to={`/${leagueId}/free-agents`}
                 className="font-semibold text-blue-100 hover:text-white underline transition-colors duration-200"
               >
                 Free Agents page
               </Link>
               {" "}to browse and add available teams directly.
             </div>
           </div>
         </div>
       </div>

       {/* How Does Scoring Work Section */}
       <div className="bg-purple-500/20 backdrop-blur-sm border border-purple-400/30 rounded-xl p-4 mb-6">
         <div className="flex items-center gap-3 text-purple-300">
           <div className="text-2xl">📊</div>
           <div className="flex-1">
             <div className="font-semibold text-purple-200">How does scoring work?</div>
             <div className="text-sm text-purple-300 mt-1">
               Curious about how your teams earn points? Learn about the scoring system and strategy tips.
             </div>
           </div>
           <button
             onClick={() => setShowScoringModal(true)}
             className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-200 flex-shrink-0"
           >
             View Scoring
           </button>
         </div>
       </div>
     </div>

     {/* Scoring System Modal */}
     {showScoringModal && (
       <ScoringSystemModal 
         onClose={() => setShowScoringModal(false)}
       />
     )}

     {/* Success Modal */}
     <SuccessModal />

     {/* Cut Modal */}
     <CutModal />
     
     {/* Move Modal */}
     <MoveModal />
   </div>
 );
}

export default MyLineup;