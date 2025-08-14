import React, { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { auth, db } from "../firebase/firebase";
import {
  doc,
  getDoc,
  collection,
  getDocs,
  updateDoc,
  setDoc
} from "firebase/firestore";
import BottomNavBar from "../components/BottomNavBar";
import ScoringSystemModal from "../components/ScoringSystemModal";
import WeeklyLineupManager from "../components/WeeklyLineupManager";
import { Calendar, ChevronDown, ChevronUp } from "lucide-react";

function MyLineup() {
  const { leagueId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [teamName, setTeamName] = useState("");
  const [smackTalk, setSmackTalk] = useState("");
  const [isEditingSmackTalk, setIsEditingSmackTalk] = useState(false);
  const [smackTalkSaving, setSmackTalkSaving] = useState(false);
  const [allTeams, setAllTeams] = useState({});
  const [squadPoints, setSquadPoints] = useState(0);
  const [currentWeek, setCurrentWeek] = useState(1);
  const [showScoringModal, setShowScoringModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [showScheduleGrid, setShowScheduleGrid] = useState(false);
  const [scheduleData, setScheduleData] = useState({});
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [weekNumbers, setWeekNumbers] = useState([]);
  const [userData, setUserData] = useState(null);
  const [migrationNeeded, setMigrationNeeded] = useState(false);

  // User Avatar Component
  const UserAvatar = ({ member, size = 80 }) => {
    const avatarUrl = member?.teamAvatar;
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
              <img 
                src={avatarUrl} 
                alt="Team avatar"
                className="w-full h-full object-cover"
                onError={(e) => {
                  e.target.style.display = 'none';
                  e.target.nextSibling.style.display = 'flex';
                }}
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-r from-purple-500 to-blue-500 text-white text-xl font-bold flex items-center justify-center">
                {['avatar1.png', 'avatar2.png', 'avatar3.png', 'avatar4.png', 'avatar5.png', 'avatar6.png', 'avatar7.png', 'avatar8.png'].indexOf(avatarUrl) + 1}
              </div>
            )
          ) : (
            <div className="w-full h-full flex items-center justify-center text-xl font-bold">
              {teamName ? teamName.charAt(0).toUpperCase() : '?'}
            </div>
          )}
          
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

  // Team Logo Component
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
      backgroundColor: "white",
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
              color: '#1e293b',
              textAlign: 'center',
              background: 'white'
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
        
        <div 
          style={{
            ...logoStyle,
            background: "white",
            color: "#1e293b",
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

// Replace the ScheduleGrid component in MyLineup.js with this

// Replace the ScheduleGrid component in MyLineup.js with this

  const ScheduleGrid = () => {
    const [scheduleData, setScheduleData] = useState({});
    const [scheduleLoading, setScheduleLoading] = useState(false);

    // Load full season schedule data - hooks must be called unconditionally
    useEffect(() => {
      const loadFullSchedule = async () => {
        // Move the showScheduleGrid check inside the effect
        if (!showScheduleGrid || Object.keys(scheduleData).length > 0) return;
        
        setScheduleLoading(true);
        try {
          const allScheduleData = {};
          const weeks = Array.from({ length: 14 }, (_, i) => i + 1);
          
          // Load schedule for each week
          for (const week of weeks) {
            const gamesSnap = await getDocs(
              collection(db, "schedule", "2025", "weeks", week.toString(), "games")
            );
            
            const weekGames = [];
            gamesSnap.forEach(gameDoc => {
              const gameData = gameDoc.data();
              weekGames.push({
                homeTeam: gameData.homeTeam,
                awayTeam: gameData.awayTeam,
                date: gameData.date,
                gameComplete: gameData.gameComplete || false
              });
            });
            
            allScheduleData[week] = weekGames;
          }
          
          setScheduleData(allScheduleData);
        } catch (error) {
          console.error("Error loading schedule:", error);
        } finally {
          setScheduleLoading(false);
        }
      };

      loadFullSchedule();
    }, [showScheduleGrid]); // Remove scheduleData from dependencies to avoid infinite loop

    // Early return AFTER all hooks have been called
    if (!showScheduleGrid) return null;

    // Get current roster from member.lineup
    const currentLineup = userData?.lineup;
    const allRosterTeams = [
      ...(currentLineup?.starters || []),
      ...(currentLineup?.bench || [])
    ].filter(teamName => teamName !== null);

    // Resolve team names to team objects
    const rosterTeams = allRosterTeams.map(teamName => {
      const normalize = (name) =>
        name?.toLowerCase()
          .replace(/\s+/g, "-")
          .replace(/&/g, "")
          .replace(/[^a-z0-9\-]/g, "");
      
      return allTeams[normalize(teamName)];
    }).filter(team => team !== null);

    // Helper function to find team's game for a specific week
    const findTeamGame = (teamName, week) => {
      const weekGames = scheduleData[week] || [];
      return weekGames.find(game => 
        game.homeTeam === teamName || game.awayTeam === teamName
      );
    };

    // Helper function to get opponent info
    const getOpponentInfo = (teamName, week) => {
      const game = findTeamGame(teamName, week);
      if (!game) return null;
      
      const isHome = game.homeTeam === teamName;
      const opponent = isHome ? game.awayTeam : game.homeTeam;
      
      return {
        opponent: opponent,
        isHome: isHome,
        date: game.date,
        gameComplete: game.gameComplete
      };
    };

    const weeks = Array.from({ length: 14 }, (_, i) => i + 1);

    if (scheduleLoading) {
      return (
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20 mb-6">
          <div className="text-center">
            <div className="text-2xl mb-2 animate-spin">📅</div>
            <p className="text-white/80">Loading schedule data...</p>
          </div>
        </div>
      );
    }

    return (
      <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20 mb-6">
        <h3 className="text-xl font-bold text-white mb-4 text-center">
          📅 Your Roster's Season Schedule
        </h3>
        
        {rosterTeams.length === 0 ? (
          <p className="text-white/60 text-center py-8">
            Add some teams to your lineup to see their schedule here!
          </p>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-max">
              {/* Header Row */}
              <div className="flex gap-1 mb-2">
                <div className="w-32 text-white font-bold text-sm p-2 bg-white/20 rounded">
                  Team
                </div>
                {weeks.map(week => (
                  <div 
                    key={week} 
                    className={`w-20 text-white font-bold text-xs p-2 rounded text-center ${
                      week === currentWeek 
                        ? 'bg-blue-500' 
                        : 'bg-white/10'
                    }`}
                  >
                    W{week}
                  </div>
                ))}
              </div>
              
              {/* Team Rows */}
              {rosterTeams.map((team, teamIndex) => (
                <div key={team.school} className="flex gap-1 mb-1">
                  {/* Team Name Column */}
                  <div className="w-32 bg-white/5 rounded p-2 flex items-center">
                    <div className="flex items-center gap-2">
                      <TeamLogo teamName={team.school} size={20} clickable={false} />
                      <div>
                        <div className="text-white font-medium text-xs truncate">
                          {team.school.split(' ')[0]}
                        </div>
                        <div className="text-white/60 text-xs">
                          {team.currentSeason?.record || '0-0'}
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Week Columns */}
                  {weeks.map(week => {
                    const opponentInfo = getOpponentInfo(team.school, week);
                    
                    return (
                      <div 
                        key={week}
                        className={`w-20 rounded p-1 text-center min-h-[60px] flex flex-col justify-center ${
                          week === currentWeek ? 'ring-1 ring-blue-400' : ''
                        } ${
                          opponentInfo ? 'bg-white/5' : 'bg-gray-600/30'
                        }`}
                      >
                        {opponentInfo ? (
                          <div className="text-xs">
                            <div className="text-white font-medium mb-1">
                              {opponentInfo.isHome ? 'vs' : '@'}
                            </div>
                            <div className="text-white/80 truncate text-xs leading-tight">
                              {opponentInfo.opponent.split(' ').slice(0, 2).join(' ')}
                            </div>
                            {week === currentWeek && team.currentSeason?.nextOpponentSpreadDisplay && (
                              <div className="text-yellow-400 font-bold text-xs mt-1">
                                {team.currentSeason.nextOpponentSpreadDisplay}
                              </div>
                            )}
                            {opponentInfo.gameComplete && (
                              <div className="text-green-400 text-xs mt-1">✓</div>
                            )}
                          </div>
                        ) : (
                          <div className="text-gray-300 text-xs font-medium">
                            BYE
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
            
            {/* Legend */}
            <div className="mt-4 flex items-center justify-center gap-4 text-xs">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 bg-blue-500 rounded"></div>
                <span className="text-white/80">Current Week</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 bg-white/10 rounded"></div>
                <span className="text-white/80">Has Game</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 bg-gray-600 rounded"></div>
                <span className="text-white/80">BYE Week</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 bg-green-400 rounded"></div>
                <span className="text-white/80">Completed</span>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // Migration function
  const runMigration = async () => {
    try {
      const userId = auth.currentUser?.uid;
      
      if (!userId) {
        console.error('❌ No user logged in');
        return;
      }
      
      console.log('🔄 Starting migration for user:', userId);
      
      // Check if migration already done
      const weeklyLineupsRef = doc(db, "leagues", leagueId, "weeklyLineups", userId);
      const weeklySnap = await getDoc(weeklyLineupsRef);
      
      if (weeklySnap.exists()) {
        console.log('✅ Migration already completed');
        setMigrationNeeded(false);
        return;
      }
      
      // Get current member data
      const memberRef = doc(db, "leagues", leagueId, "members", userId);
      const memberSnap = await getDoc(memberRef);
      const memberData = memberSnap.data();
      
      if (memberData?.lineup) {
        console.log('📋 Found existing lineup:', memberData.lineup);
        
        const weeklyLineups = {};
        
        // Initialize all weeks (1-14)
        for (let week = 1; week <= 14; week++) {
          weeklyLineups[`week${week}`] = {
            starters: Array(5).fill(null),
            bench: Array(2).fill(null),
            lockedAt: null
          };
        }
        
        // Copy current lineup to current week
        weeklyLineups[`week${currentWeek}`] = {
          starters: memberData.lineup.starters || Array(5).fill(null),
          bench: memberData.lineup.bench || Array(2).fill(null),
          lockedAt: null
        };
        
        // Save to new collection
        await setDoc(weeklyLineupsRef, weeklyLineups);
        
        console.log('✅ Migration completed successfully!');
        console.log('📊 Week 1 lineup:', weeklyLineups.week1);
        
        setMigrationNeeded(false);
        setSuccessMessage("Migration completed! Your teams have been moved to the new weekly format.");
        setShowSuccessModal(true);
        
        // Refresh the page to load new data
        setTimeout(() => {
          window.location.reload();
        }, 2000);
        
      } else {
        console.log('❌ No existing lineup found to migrate');
        setMigrationNeeded(false);
      }
      
    } catch (error) {
      console.error('❌ Migration failed:', error);
      setSuccessMessage("Migration failed. Please try again or contact support.");
      setShowSuccessModal(true);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      const currentUser = auth.currentUser;
      if (!currentUser) return;

      try {
        // Get user/member data
        const memberRef = doc(db, "leagues", leagueId, "members", currentUser.uid);
        const memberSnap = await getDoc(memberRef);
        const memberData = memberSnap.data();

        setUserData(memberData);
        setTeamName(memberData?.teamName || "Unnamed Squad");
        setSmackTalk(memberData?.smackTalk || "");
        setSquadPoints(memberData?.points || 0);

        // Check if migration is needed
        const weeklyLineupsRef = doc(db, "leagues", leagueId, "weeklyLineups", currentUser.uid);
        const weeklySnap = await getDoc(weeklyLineupsRef);
        
        if (!weeklySnap.exists() && memberData?.lineup) {
          console.log('🔧 Migration needed - old lineup format detected');
          setMigrationNeeded(true);
        }

        // Get season info with better currentWeek parsing
        const seasonRef = doc(db, "config", "season");
        const seasonSnap = await getDoc(seasonRef);
        const seasonData = seasonSnap.data();
        
        // Handle both "Preseason" and "Week X" formats
        const weekString = seasonData?.currentWeek || "1";
        let weekNumber;

        if (weekString === "Preseason") {
          weekNumber = 1; // Default to week 1 for preseason
        } else {
          const weekMatch = weekString.toString().match(/\d+/);
          weekNumber = weekMatch ? parseInt(weekMatch[0]) : 1;
        }

        console.log("Parsed week:", weekString, "→", weekNumber);
        setCurrentWeek(weekNumber);

        // Load all teams with proper structure
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

        console.log("Teams loaded:", Object.keys(teamsMap).length);
        console.log("Sample teams:", Object.keys(teamsMap).slice(0, 5));

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

      {/* Main Content */}
      <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 pb-32">
        
        {/* MIGRATION BUTTON - TEMPORARY */}
        {migrationNeeded && (
          <div className="bg-red-500/20 backdrop-blur-sm border border-red-400/30 rounded-xl p-4 mb-6">
            <div className="flex items-center gap-3 text-red-300">
              <div className="text-2xl">🔧</div>
              <div className="flex-1">
                <div className="font-semibold text-red-200">One-Time Migration Needed</div>
                <div className="text-sm text-red-300 mt-1">
                  Click to migrate your lineup data to the new weekly format.
                </div>
              </div>
              <button
                onClick={runMigration}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-200 flex-shrink-0"
              >
                Run Migration
              </button>
            </div>
          </div>
        )}

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
              <span className="text-xl font-bold text-white">📅 Season Schedule Overview</span>
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

    {/* WEEKLY LINEUP MANAGER */}
    <div className="mb-6">
      <WeeklyLineupManager
        leagueId={leagueId}
        userId={auth.currentUser?.uid}
        allTeams={allTeams}
        currentWeek={currentWeek}
        onTeamClick={handleTeamClick}
        TeamLogo={TeamLogo}
        userDisplayName={userData?.firstName || "Unknown"}
      />
    </div>

        {/* Free Agent Instructions */}
        <div className="bg-blue-500/20 backdrop-blur-sm border border-blue-400/30 rounded-xl p-4 mb-6">
          <div className="flex items-center gap-3 text-blue-300">
            <div className="text-2xl">💡</div>
            <div>
              <div className="font-semibold text-blue-200">Want to add new teams?</div>
              <div className="text-sm text-blue-300 mt-1">
                Visit the{" "}
                <Link 
                  to={`/${leagueId}/free-agents`}
                  className="font-semibold text-blue-100 hover:text-white underline transition-colors duration-200"
                >
                  Free Agents page
                </Link>
                {" "}to browse and add available teams for the current week.
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
    </div>
  );
}

export default MyLineup;