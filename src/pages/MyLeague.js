import React, { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { db, auth } from "../firebase/firebase";
import { collection, getDocs, doc, getDoc } from "firebase/firestore";
import { Trophy, Users, Star, TrendingUp, Settings, ChevronDown, ChevronUp, Calendar, Crown, Zap } from "lucide-react";
import BottomNavBar from "../components/BottomNavBar";
import ScoringSystemModal from "../components/ScoringSystemModal";
import RecentMovesWidget from '../components/RecentMovesWidget';

const normalize = (name) =>
  name
    ?.toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/&/g, "-")
    .replace(/[^a-z0-9\-]/g, "");

const canonicalizeTeam = (name) => {
  if (!name) return "";
  let s = String(name).toLowerCase();

  // unify common words
  s = s.replace(/\buniversity\b/g, "")
       .replace(/\bthe\b/g, "")
       .replace(/\bof\b/g, "")
       .replace(/\bat\b/g, "")
       .replace(/\bst[.\s]\b/g, "state ");   // "st.", "st " → "state "
  
  // remove parentheses and their contents
  s = s.replace(/\([^)]*\)/g, "");

  // collapse & strip punctuation/spaces/hyphens
  s = s.replace(/&/g, "and")
       .replace(/[^a-z0-9]+/g, "");          // keep only a-z0-9

  return s;
};

const getScheduleEntry = (scheduleData, name) => {
  if (!name) return undefined;
  return (
    scheduleData[name] ||
    scheduleData[name?.toLowerCase?.()] ||
    scheduleData[normalize(name)] ||
    scheduleData[`__canon__:${canonicalizeTeam(name)}`]
  );
};

// Toggle this to true only when you want diagnostics in the console
const DEBUG_BYE = false;

const debugByeCheck = (scheduleData, name) => {
  if (!DEBUG_BYE || !name) return;

  const keysTried = {
    exact: name,
    lower: name?.toLowerCase?.(),
    normalized: normalize(name),
    canonical: `__canon__:${canonicalizeTeam(name)}`
  };

  const hits = {
    exact: !!scheduleData[keysTried.exact],
    lower: !!scheduleData[keysTried.lower],
    normalized: !!scheduleData[keysTried.normalized],
    canonical: !!scheduleData[keysTried.canonical],
  };

  if (!hits.exact && !hits.lower && !hits.normalized && !hits.canonical) {
    // Only log when we'd mark it as a BYE
    console.warn(
      `[BYE DEBUG] No schedule match for "${name}". Tried:`,
      keysTried,
      " | hits: ",
      hits
    );
  }
};

// --- BYE detection helper (robust) ---
const isTeamOnBye = (name, scheduleData) => {
  const hasEntry = !!getScheduleEntry(scheduleData, name);
  if (!hasEntry) debugByeCheck(scheduleData, name);
  return !hasEntry;
};

function MyLeague() {
  const { leagueId } = useParams();
  const navigate = useNavigate();
  const [members, setMembers] = useState([]);
  const [allTeams, setAllTeams] = useState({});
  const [leagueName, setLeagueName] = useState("");
  const [maxManagers, setMaxManagers] = useState(8);
  const [currentWeek, setCurrentWeek] = useState("Preseason");
  const [loading, setLoading] = useState(true);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [showScoringModal, setShowScoringModal] = useState(false);
  
  // NEW: Weekly standings state
  const [selectedWeek, setSelectedWeek] = useState(null);
  const [viewMode, setViewMode] = useState('current'); // 'current' vs 'historical'
  const [weeklyStandings, setWeeklyStandings] = useState({});
  const [availableWeeks, setAvailableWeeks] = useState([]);
  const [standingsLoading, setStandingsLoading] = useState(false);
  
  // NEW: Schedule data for live game status
  const [scheduleData, setScheduleData] = useState({});
  const [scheduleLoading, setScheduleLoading] = useState(true);

  // NEW: Function to fetch schedule data for live game status
  const fetchScheduleData = async (weekNum) => {
  try {
    setScheduleLoading(true);
    
    // Fetch current week's games
    const gamesSnap = await getDocs(
      collection(db, "schedule", "2025", "weeks", weekNum.toString(), "games")
    );
    
    const gamesByTeam = {};
    
    gamesSnap.forEach(doc => {
      const game = doc.data();
      if (game.homeTeam && game.awayTeam) {
        // Create game data objects
        const homeData = {
          opponent: game.awayTeam,
          isHome: true,
          gameStatus: game.gameStatus || 'scheduled',
          gameComplete: game.gameComplete || false,
          homeScore: game.homeScore || 0,
          awayScore: game.awayScore || 0,
          hasLiveGame: game.gameStatus === 'in_progress'
        };
        
        const awayData = {
          opponent: game.homeTeam,
          isHome: false,
          gameStatus: game.gameStatus || 'scheduled',
          gameComplete: game.gameComplete || false,
          homeScore: game.homeScore || 0,
          awayScore: game.awayScore || 0,
          hasLiveGame: game.gameStatus === 'in_progress'
        };
        
        // Store with both original names AND lowercase names for reliable lookup
        gamesByTeam[game.homeTeam] = homeData;
        gamesByTeam[game.awayTeam] = awayData;
        gamesByTeam[game.homeTeam.toLowerCase()] = homeData;
        gamesByTeam[game.awayTeam.toLowerCase()] = awayData;

        // also store normalized + canonical keys for robust matching
        gamesByTeam[normalize(game.homeTeam)] = homeData;
        gamesByTeam[normalize(game.awayTeam)] = awayData;
        gamesByTeam[`__canon__:${canonicalizeTeam(game.homeTeam)}`] = homeData;
        gamesByTeam[`__canon__:${canonicalizeTeam(game.awayTeam)}`] = awayData;
      }
    });
    
    setScheduleData(gamesByTeam);
    console.log('Schedule data loaded:', Object.keys(gamesByTeam));
  } catch (error) {
    console.error("Error fetching schedule data:", error);
  } finally {
    setScheduleLoading(false);
  }
  };

  // NEW: Load available historical weeks
  const loadAvailableWeeks = async () => {
    try {
      const weeklyStandingsRef = collection(db, "leagues", leagueId, "weeklyStandings");
      const snapshot = await getDocs(weeklyStandingsRef);
      
      if (!snapshot.empty) {
        // Get a sample user's document to see which weeks exist
        const sampleDoc = snapshot.docs[0].data();
        const weeks = Object.keys(sampleDoc)
          .filter(key => key.startsWith('week'))
          .map(key => parseInt(key.replace('week', '')))
          .sort((a, b) => a - b);
        
        setAvailableWeeks(weeks);
        console.log('Available historical weeks:', weeks);
      }
    } catch (error) {
      console.error("Error loading available weeks:", error);
    }
  };

  // NEW: Load historical standings for a specific week
  const loadWeeklyStandings = async (week) => {
    if (weeklyStandings[week]) {
      return; // Already loaded
    }
    
    try {
      setStandingsLoading(true);
      
      const weeklyStandingsRef = collection(db, "leagues", leagueId, "weeklyStandings");
      const snapshot = await getDocs(weeklyStandingsRef);
      
      const weekStandings = [];
      
      snapshot.forEach(doc => {
        const userData = doc.data();
        const weekData = userData[`week${week}`];
        
        if (weekData) {
          weekStandings.push({
            id: doc.id,
            ...weekData
          });
        }
      });
      
      // Sort by rank
      weekStandings.sort((a, b) => (a.rank || 0) - (b.rank || 0));
      
      setWeeklyStandings(prev => ({
        ...prev,
        [week]: weekStandings
      }));
      
      console.log(`Loaded Week ${week} standings:`, weekStandings);
      
    } catch (error) {
      console.error(`Error loading Week ${week} standings:`, error);
    } finally {
      setStandingsLoading(false);
    }
  };

  // NEW: Week selector component
  const WeekSelector = () => {
    const getCurrentWeekNumber = () => {
      if (typeof currentWeek === 'number') return currentWeek;
      if (!currentWeek || typeof currentWeek !== 'string') return 1;
      const weekMatch = currentWeek.match(/\d+/);
      return weekMatch ? parseInt(weekMatch[0]) : 1;
    };

    const currentWeekNum = getCurrentWeekNumber();

    return (
      <div className="bg-white/10 backdrop-blur-lg rounded-xl p-3 border border-white/20 mb-6">
        <div className="flex flex-wrap gap-2 justify-center items-center">
          <span className="text-sm font-medium text-white/80 mr-2">Week:</span>
          
          {/* Current Live Week */}
          <button
            onClick={() => setViewMode('current')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
              viewMode === 'current'
                ? 'bg-green-600 text-white shadow-lg'
                : 'bg-white/20 text-white/80 hover:bg-white/30'
            }`}
          >
            {currentWeekNum} Live
          </button>

          {/* Historical Weeks */}
          {availableWeeks.map(week => (
            <button
              key={week}
              onClick={() => {
                setViewMode('historical');
                setSelectedWeek(week);
                loadWeeklyStandings(week);
              }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                viewMode === 'historical' && selectedWeek === week
                  ? 'bg-blue-600 text-white shadow-lg'
                  : 'bg-white/20 text-white/80 hover:bg-white/30'
              }`}
            >
              {week} Final
            </button>
          ))}
        </div>

        {/* Loading indicator */}
        {standingsLoading && (
          <div className="text-center mt-2">
            <div className="text-white/60 text-xs">Loading...</div>
          </div>
        )}
      </div>
    );
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        console.log("Using leagueId:", leagueId);

        // Fetch league info for name
        const leagueDoc = await getDoc(doc(db, "leagues", leagueId));
        if (leagueDoc.exists()) {
          const leagueData = leagueDoc.data();
          setLeagueName(leagueData.name || "League");
          setMaxManagers(leagueData.maxManagers || 8);
        }

        // Fetch current week from global config
        const configDoc = await getDoc(doc(db, "config", "season"));
        let weekData = "Preseason";
        if (configDoc.exists()) {
          weekData = configDoc.data().currentWeek || "Preseason";
          setCurrentWeek(weekData);
          
          // NEW: Fetch schedule data for current week
          if (weekData !== "Preseason") {
            const getCurrentWeekNumber = () => {
              if (typeof weekData === 'number') return weekData;
              if (!weekData || typeof weekData !== 'string') return 1;
              const weekMatch = weekData.match(/\d+/);
              return weekMatch ? parseInt(weekMatch[0]) : 1;
            };
            
            const weekNum = getCurrentWeekNumber();
            await fetchScheduleData(weekNum);
          } else {
            setScheduleLoading(false);
          }
        } else {
          setScheduleLoading(false);
        }

        // NEW: Load available historical weeks
        await loadAvailableWeeks();

        // Fetch all teams first to get team logos and current season data
        const teamsRef = collection(db, "teams");
        const teamsSnapshot = await getDocs(teamsRef);
        const teamsMap = {};
        teamsSnapshot.docs.forEach(doc => {
          const teamData = doc.data();
          if (teamData.school) {
            teamsMap[normalize(teamData.school)] = {
              logo: teamData.logos1 || teamData.logos2 || null,
              logos1: teamData.logos1 || null,
              logos2: teamData.logos2 || null,
              colors: teamData.colors || {},
              // Add additional team info for the card
              conference: teamData.conference || "Unknown",
              mascot: teamData.mascot || "",
              city: teamData.city || "",
              state: teamData.state || "",
              currentSeason: teamData.currentSeason || {}, // Include full currentSeason object
              gameComplete: teamData.currentSeason?.gameComplete || false,
              nextOpponentSpread: teamData.currentSeason?.nextOpponentSpread || null,
              name: teamData.school,  // ADD THIS LINE
              school: teamData.school // ADD THIS LINE
            };
          }
        });
        setAllTeams(teamsMap);

        // In your useEffect, right after you load the teams data
        console.log('🏈 All teams loaded:', Object.keys(teamsMap));
        console.log('🎯 Arizona entries:', Object.keys(teamsMap).filter(key => key.includes('arizona')));
        console.log('🔍 Arizona State team data:', teamsMap['arizona-state']);

        // Also log what normalize produces
        console.log('Normalize "Arizona State":', normalize('Arizona State'));
        console.log('Normalize "arizona-state":', normalize('arizona-state'));

        // Fetch league members with captain and trip play data
        const membersRef = collection(db, "leagues", leagueId, "members");
        const snapshot = await getDocs(membersRef);
        
        // Get current week number for captain data fetching
        const getCurrentWeekNumber = () => {
          if (typeof weekData === 'number') return weekData;
          if (!weekData || typeof weekData !== 'string') return 1;
          const weekMatch = weekData.match(/\d+/);
          return weekMatch ? parseInt(weekMatch[0]) : 1;
        };
        const currentWeekNum = getCurrentWeekNumber();
        
        const membersData = await Promise.all(
          snapshot.docs.map(async (memberDoc) => {
            const memberData = memberDoc.data();
            
            // Fetch user data for first name
            let firstName = "Unknown";
            try {
              if (memberDoc.id) {
                const userDoc = await getDoc(doc(db, "users", memberDoc.id));
                if (userDoc.exists()) {
                  const userData = userDoc.data();
                  firstName = userData.firstName || userData.displayName || "Unknown";
                }
              }
            } catch (userError) {
              console.warn("Could not fetch user data:", userError);
            }

            // Read captain from member document
            let captain = null;
            try {
              captain = memberData.lineup?.captain || null;
            } catch (captainError) {
              console.warn(`Could not fetch captain for user ${memberDoc.id}:`, captainError);
            }

            // Read trip play data from member document
            let tripPlayTeam = null;
            let hasTripPlay = false;
            let tripPlayUsedWeek = null;
            
            try {
              tripPlayTeam = memberData.lineup?.tripPlayTeam || null;
              hasTripPlay = memberData.hasTripPlay || false;
              tripPlayUsedWeek = memberData.tripPlayUsedWeek || null;
            } catch (tripPlayError) {
              console.warn(`Could not fetch trip play data for user ${memberDoc.id}:`, tripPlayError);
            }

            return {
              id: memberDoc.id,
              firstName,
              captain,
              tripPlayTeam,
              hasTripPlay,
              tripPlayUsedWeek,
              ...memberData
            };
          })
        );

        setMembers(membersData);

        // NEW: Debug - Check which teams from lineups are missing from schedule
        if (!scheduleLoading && Object.keys(scheduleData).length > 0) {
          const allLineupsTeams = new Set();
          membersData.forEach(member => {
            const lineup = member.lineup || {};
            const starters = Array.isArray(lineup.starters) ? lineup.starters : [];
            const bench = Array.isArray(lineup.bench) ? lineup.bench : [];
            [...starters, ...bench].forEach(teamName => {
              if (typeof teamName === 'string' && teamName.trim() !== '') {
                allLineupsTeams.add(teamName);
              }
            });
          });

            const inSchedule = (name) =>
              !!(
                scheduleData[name] ||
                scheduleData[name?.toLowerCase?.()] ||
                scheduleData[normalize(name)] ||
                scheduleData[`__canon__:${canonicalizeTeam(name)}`]
              );

            const teamsNotInSchedule = Array.from(allLineupsTeams).filter(name => !inSchedule(name));

          console.log('🏈 Schedule Debug for Week', getCurrentWeekNumber(), ':');
          console.log('   Teams in schedule:', Object.keys(scheduleData).filter(key => !key.includes('.')));
          console.log('   Teams in lineups:', Array.from(allLineupsTeams));
          
          if (teamsNotInSchedule.length > 0) {
            console.log('🚨 Teams in lineups but NOT in schedule (potential byes):');
            teamsNotInSchedule.forEach(teamName => {
              console.log(`   - "${teamName}"`);
            });
          } else {
            console.log('✅ All lineup teams found in schedule');
          }
        }

        setLoading(false);
      } catch (error) {
        console.error("Error fetching data:", error);
        setLoading(false);
        setScheduleLoading(false);
      }
    };

    fetchData();
  }, [leagueId]);

  const TeamLogo = ({ teamName, size = 32, clickable = false, isCaptain = false, isTripPlay = false }) => {

    const team = allTeams[normalize(teamName)];
    const logoUrl = team?.logo;
    const scheduleGame = getScheduleEntry(scheduleData, teamName);
    const hasWeekSchedule = !scheduleLoading && Object.keys(scheduleData || {}).length > 0;
    const byeThisWeek = viewMode === 'current' && hasWeekSchedule && isTeamOnBye(teamName, scheduleData);

    const handleClick = () => {
      if (clickable && teamName) {
        setSelectedTeam({
          name: teamName,
          ...team,
          isFlipped: false
        });
      }
    };

    const logoStyle = {
      width: size,
      height: size,
      borderRadius: "50%",
      overflow: "hidden",
      border: isCaptain ? "3px solid #fbbf24" : 
              isTripPlay ? "3px solid #06b6d4" : 
              "2px solid rgba(255, 255, 255, 0.3)",      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(255, 255, 255, 0.1)",
      cursor: clickable ? "pointer" : "default",
      transition: "all 0.3s ease",
      flexShrink: 0,
      boxShadow: isCaptain ? "0 4px 12px rgba(251, 191, 36, 0.3)" : 
                isTripPlay ? "0 4px 12px rgba(6, 182, 212, 0.3)" :
                "0 4px 12px rgba(0, 0, 0, 0.1)",      transform: "scale(1)",
      position: "relative",
      backdropFilter: "blur(10px)"
    };

    // Get current week number
    const getCurrentWeekNumber = () => {
      if (typeof currentWeek === 'number') return currentWeek;
      if (!currentWeek || typeof currentWeek !== 'string') return 1;
      const weekMatch = currentWeek.match(/\d+/);
      return weekMatch ? parseInt(weekMatch[0]) : 1;
    };
    const currentWeekNum = getCurrentWeekNumber();
    
    const getTeamDisplayState = () => {

      if (viewMode !== 'current') {
        return { 
          display: "?", 
          state: "historical", 
          color: "#6b7280",
          bgColor: "#374151",
          shouldPulse: false
        };
      }

      // BYE: no game entry this week
      if (byeThisWeek) {
        return { 
          display: "—",           
          state: "bye", 
          color: "#9ca3af",
          bgColor: "#4b5563",
          shouldPulse: false
        };
      }

      // First check schedule data (most reliable for current week)
      if (scheduleGame && !scheduleLoading) {
        const gameStatus = scheduleGame.gameStatus;
        const gameComplete = scheduleGame.gameComplete;
        const hasLiveGame = scheduleGame.hasLiveGame;
        
        // Get weekly points from team document
        let weeklyPoints = team?.currentSeason?.weeklyPoints?.[`week${currentWeekNum}`] || 0;

        // Apply captain and trip play bonuses for display (backend handles actual scoring)
        if (isCaptain && isTripPlay && weeklyPoints !== 0) {
          weeklyPoints *= 5; // 5x combo
        } else if (isCaptain && weeklyPoints !== 0) {
          weeklyPoints *= 2; // Captain 2x
        } else if (isTripPlay && weeklyPoints !== 0) {
          weeklyPoints *= 3; // Trip play 3x
        }

        // Determine status based on schedule data
        if (gameComplete === true || gameStatus === 'final') {
          return { 
            display: weeklyPoints, 
            state: "final", 
            color: isCaptain || isTripPlay ? "#fbbf24" : "#3b82f6", // Gold for multipliers, blue for others
            bgColor: isCaptain || isTripPlay ? "#f59e0b" : "#2563eb",
            shouldPulse: false
          };
        }
        
        // Game is currently in progress (based on schedule)
        if (gameStatus === 'in_progress' || hasLiveGame) {
          return { 
            display: weeklyPoints, 
            state: "live", 
            color: isCaptain || isTripPlay ? "#fbbf24" : "#10b981", // Gold for multipliers, green for others
            bgColor: isCaptain || isTripPlay ? "#f59e0b" : "#059669",
            shouldPulse: true
          };
        }
        
        // Game hasn't started yet but is scheduled
        return { 
          display: "?", 
          state: "unplayed", 
          color: "#6b7280",
          bgColor: "#374151",
          shouldPulse: false
        };
      }
      
      // Fallback to team document if no schedule data (shouldn't happen for current week)
      let weeklyPoints = team?.currentSeason?.weeklyPoints?.[`week${currentWeekNum}`] || 0;

      const gameComplete = team?.currentSeason?.gameComplete;
      const gameStatus = team?.currentSeason?.gameStatus;
      const hasLiveGame = team?.currentSeason?.hasLiveGame;
      
      // Apply captain and trip play bonuses for display (backend handles actual scoring)
      if (isCaptain && isTripPlay && weeklyPoints !== 0) {
        weeklyPoints *= 5; // 5x combo
      } else if (isCaptain && weeklyPoints !== 0) {
        weeklyPoints *= 2; // Captain 2x
      } else if (isTripPlay && weeklyPoints !== 0) {
        weeklyPoints *= 3; // Trip play 3x
      }
      
      if (gameComplete === true || gameStatus === 'final') {
        return { 
          display: weeklyPoints, 
          state: "final", 
          color: isCaptain || isTripPlay ? "#fbbf24" : "#3b82f6",
          bgColor: isCaptain || isTripPlay ? "#f59e0b" : "#2563eb",
          shouldPulse: false
        };
      }
      
      if (gameStatus === 'in_progress' || hasLiveGame || (weeklyPoints !== 0 && gameComplete === false)) {
        return { 
          display: weeklyPoints, 
          state: "live", 
          color: isCaptain || isTripPlay ? "#fbbf24" : "#10b981",
          bgColor: isCaptain || isTripPlay ? "#f59e0b" : "#059669",
          shouldPulse: true
        };
      }
      
      // Game hasn't started yet
      return { 
        display: "?", 
        state: "unplayed", 
        color: "#6b7280",
        bgColor: "#374151",
        shouldPulse: false
      };
    };

    const teamState = getTeamDisplayState();

    // Get the spread for display - use nextOpponentSpreadDisplay or calculate from nextOpponentSpread
    const getSpreadDisplay = () => {
      // Only show spread for current week
      if (viewMode !== 'current') return null;

      const spreadDisplay = team?.currentSeason?.nextOpponentSpreadDisplay;
      const spreadNum = team?.currentSeason?.nextOpponentSpread;
      
      // If we have a formatted display string, use it
      if (spreadDisplay && spreadDisplay !== "TBD") {
        return spreadDisplay;
      }
      
      // Otherwise format the number
      if (typeof spreadNum === 'number' && !isNaN(spreadNum)) {
        if (spreadNum === 0) return "PK";  // Pick 'em
        return spreadNum > 0 ? `+${spreadNum}` : `${spreadNum}`;
      }
      
      return null; // No spread available
    };

    const spreadDisplay = getSpreadDisplay();

    if (logoUrl) {
      return (
        <div style={{ position: "relative", display: "inline-block" }}>
          {/* Special 5X Combo Badge - appears when BOTH captain and trip play are active */}
          {isCaptain && isTripPlay && clickable ? (
            <div style={{
              position: "absolute",
              top: "-15px",
              right: "-10px",
              background: "linear-gradient(135deg, #fbbf24 0%, #06b6d4 50%, #8b5cf6 100%)",
              color: "white",
              borderRadius: "12px",
              width: "28px",
              height: "20px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "11px",
              fontWeight: "900",
              zIndex: 20,
              border: "2px solid rgba(255, 255, 255, 0.9)",
              boxShadow: "0 4px 12px rgba(0, 0, 0, 0.4), 0 0 15px rgba(251, 191, 36, 0.3)",
              animation: "pulse 2s infinite, glow 3s ease-in-out infinite alternate",
              textShadow: "0 1px 2px rgba(0, 0, 0, 0.8)",
              letterSpacing: "0.5px"
            }}>
              5X
            </div>
          ) : (
            <>
              {/* Captain Crown - only show if no trip play combo */}
              {isCaptain && clickable && (
                <div style={{
                  position: "absolute",
                  top: "-12px",
                  right: "-8px",
                  backgroundColor: "#fbbf24",
                  color: "#92400e",
                  borderRadius: "50%",
                  width: "18px",
                  height: "18px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "12px",
                  zIndex: 15,
                  border: "2px solid rgba(255, 255, 255, 0.8)",
                  boxShadow: "0 2px 6px rgba(0, 0, 0, 0.3)"
                }}>
                  👑
                </div>
              )}

              {/* Trip Play Lightning Badge - only show if no captain combo */}
              {isTripPlay && clickable && (
                <div style={{
                  position: "absolute",
                  top: "-12px",
                  right: "-8px",
                  backgroundColor: "#06b6d4",
                  color: "#083344",
                  borderRadius: "50%",
                  width: "18px",
                  height: "18px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "12px",
                  zIndex: 15,
                  border: "2px solid rgba(255, 255, 255, 0.9)",
                  boxShadow: "0 2px 6px rgba(0, 0, 0, 0.3), 0 0 8px rgba(6, 182, 212, 0.6)"
                }}>
                  ⚡
                </div>
              )}
            </>
          )}

          {/* Weekly Points Badge - Above logo with enhanced styling */}
          {clickable && (
            <div 
              className={teamState.shouldPulse ? "animate-pulse" : ""}
              style={{
                position: "absolute",
                top: "-8px",
                left: "50%",
                transform: "translateX(-50%)",
                backgroundColor: teamState.bgColor,
                color: "white",
                borderRadius: "50%",
                width: "18px",
                height: "18px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "9px",
                fontWeight: "700",
                zIndex: 10,
                border: "2px solid rgba(255, 255, 255, 0.3)",
                boxShadow: `0 2px 6px rgba(0, 0, 0, 0.2)${teamState.shouldPulse ? ', 0 0 10px ' + teamState.color + '40' : ''}`
              }}
            >
              {teamState.display}
            </div>
          )}

          {/* Spread Badge - Below logo */}
          {clickable && viewMode === 'current' && (            
            <div style={{
              position: "absolute",
              bottom: "-10px",  // Changed from -8px to -10px (moved down 2px)
              left: "50%",
              transform: "translateX(-50%)",
              backgroundColor: byeThisWeek
                ? "#6b7280"                                        // BYE (neutral gray)
                : !spreadDisplay
                  ? "#6b7280"                                      // TBD
                  : spreadDisplay.includes('-')
                    ? "#10b981"                                    // Favorite (green)
                    : spreadDisplay === "PK"
                      ? "#6366f1"                                  // Pick 'em (indigo) 
                      : "#ef4444",                                 // Underdog (red)
              color: "white",
              borderRadius: "8px",
              width: `${size}px`,           // Changed from minWidth: "28px" to match logo size
              height: "16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "8px",              // Changed from 9px to 8px (reduced by 1)
              fontWeight: "800",
              zIndex: 10,
              border: "1px solid rgba(255, 255, 255, 0.3)",
              boxShadow: "0 2px 6px rgba(0, 0, 0, 0.2)",
              padding: "0 6px",
              letterSpacing: "0.3px",
              textTransform: "uppercase"
            }}>
              {byeThisWeek ? "BYE" : (spreadDisplay || "TBD")}
            </div>
          )}

          <div 
            style={logoStyle}
            onClick={handleClick}
            onMouseEnter={(e) => {
              if (clickable) {
                e.currentTarget.style.transform = "scale(1.05)";
                e.currentTarget.style.boxShadow = isCaptain ? "0 6px 20px rgba(251, 191, 36, 0.5)" : "0 6px 20px rgba(59, 130, 246, 0.3)";
              }
            }}
            onMouseLeave={(e) => {
              if (clickable) {
                e.currentTarget.style.transform = "scale(1)";
                e.currentTarget.style.boxShadow = isCaptain ? "0 4px 12px rgba(251, 191, 36, 0.3)" : "0 4px 12px rgba(0, 0, 0, 0.1)";
              }
            }}
            title={clickable ? `Click to view ${teamName} details${isCaptain ? ' (Captain - 2x Points)' : ''}${isTripPlay ? ' (Trip Play - 3x Points)' : ''}${isCaptain && isTripPlay ? ' (5x Combo!)' : ''}` : teamName}
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
              color: 'white',
              textAlign: 'center',
              background: (isCaptain || isTripPlay) ? 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)' : 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)'
            }}>
              {teamName ? teamName.split(' ').map(word => word[0]).join('').slice(0, 3) : '?'}
            </div>
          </div>
        </div>
      );
    }

    // Fallback placeholder with team initials and gradient
    return (
      <div style={{ position: "relative", display: "inline-block" }}>
        {/* Captain Crown */}
        {isCaptain && clickable && (
          <div style={{
            position: "absolute",
            top: "-12px",
            right: "-8px",
            backgroundColor: "#fbbf24",
            color: "#92400e",
            borderRadius: "50%",
            width: "18px",
            height: "18px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "12px",
            zIndex: 15,
            border: "2px solid rgba(255, 255, 255, 0.8)",
            boxShadow: "0 2px 6px rgba(0, 0, 0, 0.3)"
          }}>
            👑
          </div>
        )}

        {/* Trip Play Lightning Badge */}
        {isTripPlay && clickable && (
          <div style={{
            position: "absolute",
            top: "-12px",
            left: "-8px",
            backgroundColor: "#06b6d4",
            color: "#083344",
            borderRadius: "50%",
            width: "18px",
            height: "18px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "12px",
            zIndex: 15,
            border: "2px solid rgba(255, 255, 255, 0.8)",
            boxShadow: "0 2px 6px rgba(0, 0, 0, 0.3)"
          }}>
            ⚡
          </div>
        )}

        {/* Combined 5x Badge for Captain + Trip Play */}
        {isCaptain && isTripPlay && clickable && (
          <div style={{
            position: "absolute",
            bottom: "-12px",
            left: "50%",
            transform: "translateX(-50%)",
            background: "linear-gradient(45deg, #fbbf24, #06b6d4)",
            color: "white",
            borderRadius: "8px",
            padding: "2px 6px",
            fontSize: "10px",
            fontWeight: "bold",
            zIndex: 16,
            border: "1px solid rgba(255, 255, 255, 0.3)",
            boxShadow: "0 2px 6px rgba(0, 0, 0, 0.3)"
          }}>
            5X
          </div>
        )}

        {/* Weekly Points Badge - Enhanced for fallback */}
        {clickable && (
          <div 
            className={teamState.shouldPulse ? "animate-pulse" : ""}
            style={{
              position: "absolute",
              top: "-8px",
              left: "50%",
              transform: "translateX(-50%)",
              backgroundColor: teamState.bgColor,
              color: "white",
              borderRadius: "50%",
              width: "18px",
              height: "18px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "9px",
              fontWeight: "700",
              zIndex: 10,
              border: "2px solid rgba(255, 255, 255, 0.3)",
              boxShadow: `0 2px 6px rgba(0, 0, 0, 0.2)${teamState.shouldPulse ? ', 0 0 10px ' + teamState.color + '40' : ''}`
            }}
          >
            {teamState.display}
          </div>
        )}

        {/* Spread Badge - Positioned above logo */}
        {clickable && spreadDisplay && (
          <div style={{
            position: "absolute",
            bottom: "-8px",
            left: "50%",
            transform: "translateX(-50%)",
            backgroundColor: spreadDisplay.includes('+') ? "#10b981" : // Underdog (green)
                           spreadDisplay === "PK" ? "#6366f1" :        // Pick 'em (indigo) 
                           "#ef4444",                                   // Favorite (red)
            color: "white",
            borderRadius: "10px",
            minWidth: "24px",
            height: "16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "8px",
            fontWeight: "700",
            zIndex: 10,
            border: "1px solid rgba(255, 255, 255, 0.3)",
            boxShadow: "0 2px 6px rgba(0, 0, 0, 0.2)",
            padding: "0 4px"
          }}>
            {spreadDisplay}
          </div>
        )}
        
        <div 
          style={{
            ...logoStyle,
            background: (isCaptain || isTripPlay) ? "linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)" : "linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)",
            color: "white",
            fontSize: size < 30 ? '10px' : '12px',
            fontWeight: '600'
          }}
          onClick={handleClick}
          onMouseEnter={(e) => {
            if (clickable) {
              e.currentTarget.style.transform = "scale(1.05)";
              e.currentTarget.style.boxShadow = (isCaptain || isTripPlay) ? "0 6px 20px rgba(251, 191, 36, 0.5)" : "0 6px 20px rgba(59, 130, 246, 0.3)";
            }
          }}
          onMouseLeave={(e) => {
            if (clickable) {
              e.currentTarget.style.transform = "scale(1)";
              e.currentTarget.style.boxShadow = (isCaptain || isTripPlay) ? "0 4px 12px rgba(251, 191, 36, 0.3)" : "0 4px 12px rgba(0, 0, 0, 0.1)";
            }
          }}
          title={clickable ? `Click to view ${teamName} details${isCaptain ? ' (Captain - 2x Points)' : ''}${isTripPlay ? ' (Trip Play - 3x Points)' : ''}${isCaptain && isTripPlay ? ' (5x Combo!)' : ''}` : teamName}
        >
          {teamName ? teamName.split(' ').map(word => word[0]).join('').slice(0, 3) : '?'}
        </div>
      </div>
    );
  };

// User Avatar Component for Rankings
  const UserAvatar = ({ member, size = 56, rankStyle, rank }) => {
    const avatarUrl = member.teamAvatar;
    
    // Handle custom uploaded images (URLs or base64) vs preset avatars
    const isCustomUpload = avatarUrl && (avatarUrl.startsWith('http') || avatarUrl.startsWith('data:'));
    
    return (
      <div className="relative">
        <div 
          className="rounded-full flex items-center justify-center font-bold text-lg flex-shrink-0 shadow-lg overflow-hidden border-2 border-white/30"
          style={{
            width: size,
            height: size,
            backgroundColor: rankStyle.backgroundColor,
            color: rankStyle.color
          }}
        >
          {avatarUrl ? (
            isCustomUpload ? (
              // Custom uploaded image (URL or base64)
              <img 
                src={avatarUrl} 
                alt={`${member.firstName}'s avatar`}
                className="w-full h-full object-cover"
                onError={(e) => {
                  // Fallback to initials if image fails to load
                  e.target.style.display = 'none';
                  e.target.nextSibling.style.display = 'flex';
                }}
              />
            ) : (
              // Preset numbered avatar
              <div className="w-full h-full bg-gradient-to-r from-purple-500 to-blue-500 text-white text-xs font-bold flex items-center justify-center">
                {['avatar1.png', 'avatar2.png', 'avatar3.png', 'avatar4.png', 'avatar5.png', 'avatar6.png', 'avatar7.png', 'avatar8.png'].indexOf(avatarUrl) + 1}
              </div>
            )
          ) : (
            // Fallback to user initials
            <div className="w-full h-full flex items-center justify-center text-sm font-bold">
              {member.firstName ? member.firstName.charAt(0).toUpperCase() : '?'}
            </div>
          )}
          
          {/* Fallback initials (hidden by default, shown if image fails) */}
          <div 
            className="w-full h-full flex items-center justify-center text-sm font-bold"
            style={{ display: 'none' }}
          >
            {member.firstName ? member.firstName.charAt(0).toUpperCase() : '?'}
          </div>
        </div>
        
        {/* Rank Number Badge */}
        {rank && (
          <div 
            className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shadow-lg border-2 border-white"
            style={{
              backgroundColor: rankStyle.backgroundColor,
              color: rankStyle.color
            }}
          >
            {rank}
          </div>
        )}
      </div>
    );
  };

// Enhanced Team Card Modal - Updated to show current week game
  const TeamCardModal = ({ team, onClose }) => {
    const [isFlipped, setIsFlipped] = useState(false);
    const [teamSchedule, setTeamSchedule] = useState([]);
    const [currentWeekGame, setCurrentWeekGame] = useState(null);
    const [loadingSchedule, setLoadingSchedule] = useState(true);

    // Get current week number for finding the right game
    const getCurrentWeekNumber = () => {
      if (typeof currentWeek === 'number') return currentWeek;
      if (!currentWeek || typeof currentWeek !== 'string') return 1;
      const weekMatch = currentWeek.match(/\d+/);
      return weekMatch ? parseInt(weekMatch[0]) : 1;
    };

    useEffect(() => {
      const fetchTeamSchedule = async () => {
        if (!team?.name) return;
        
        try {
          setLoadingSchedule(true);
          const scheduleData = [];
          const currentWeekNum = getCurrentWeekNumber();
          
          // Fetch schedule for 2025
          const weeksSnap = await getDocs(collection(db, "schedule", "2025", "weeks"));
          
          for (const weekDoc of weeksSnap.docs) {
            const weekNum = weekDoc.id;
            const gamesSnap = await getDocs(collection(db, "schedule", "2025", "weeks", weekNum, "games"));
            
            gamesSnap.forEach(gameDoc => {
              const game = gameDoc.data();
              // Check if this team is playing in this game
              if (game.homeTeam === team.name || game.awayTeam === team.name) {
                scheduleData.push({
                  ...game,
                  week: parseInt(weekNum),
                  gameId: gameDoc.id
                });
              }
            });
          }

          // Sort by week
          scheduleData.sort((a, b) => a.week - b.week);
          setTeamSchedule(scheduleData);

          // Find current week's game instead of next incomplete game
          const weekGame = scheduleData.find(game => game.week === currentWeekNum);
          setCurrentWeekGame(weekGame);
          
        } catch (error) {
          console.error("Error fetching team schedule:", error);
        } finally {
          setLoadingSchedule(false);
        }
      };

      fetchTeamSchedule();
    }, [team?.name, currentWeek]);

    // Fixed formatCurrentWeekGame function
    const formatCurrentWeekGame = (game, teamName) => {
      if (!game) return null;
      
      const isHome = game.homeTeam === teamName;
      const opponent = isHome ? game.awayTeam : game.homeTeam;
      const prefix = game.neutralSite ? "vs" : (isHome ? "vs" : "@");
      
      // Check if game is complete
      if (game.gameComplete) {
        const teamScore = isHome ? game.homeScore : game.awayScore;
        const opponentScore = isHome ? game.awayScore : game.homeScore;
        
        if (teamScore !== null && teamScore !== undefined && 
            opponentScore !== null && opponentScore !== undefined) {
          const won = teamScore > opponentScore;
          const result = won ? "W" : "L";
          
          // For completed games, show the original spread for reference
          let spreadDisplay = "";
          if (game.homeSpread && game.homeSpread !== "TBD") {
            const homeSpread = parseFloat(game.homeSpread);
            if (!isNaN(homeSpread)) {
              if (isHome) {
                // Home team: show their spread directly
                spreadDisplay = homeSpread > 0 ? ` (+${homeSpread})` : ` (${homeSpread})`;
              } else {
                // Away team: flip the spread
                const awaySpread = -homeSpread;
                spreadDisplay = awaySpread > 0 ? ` (+${awaySpread})` : ` (${awaySpread})`;
              }
            }
          }
          
          return {
            text: `${result} ${prefix} ${opponent} ${teamScore}-${opponentScore}${spreadDisplay}`,
            isComplete: true,
            won: won
          };
        }
      }
      
      // Game is upcoming - fix the spread display logic
      let spreadDisplay = "";
      if (game.homeSpread && game.homeSpread !== "TBD") {
        const homeSpread = parseFloat(game.homeSpread);
        if (!isNaN(homeSpread)) {
          if (isHome) {
            // Home team: show their spread directly
            spreadDisplay = homeSpread > 0 ? ` (+${homeSpread})` : ` (${homeSpread})`;
          } else {
            // Away team: flip the spread sign
            const awaySpread = -homeSpread;
            spreadDisplay = awaySpread > 0 ? ` (+${awaySpread})` : ` (${awaySpread})`;
          }
        }
      }
      
      return {
        text: `${prefix} ${opponent}${spreadDisplay}`,
        isComplete: false,
        won: null
      };
    };

    // Use correct field names (homeScore/awayScore instead of homePoints/awayPoints)
    const formatGameResult = (game, teamName) => {
      const isHome = game.homeTeam === teamName;
      const opponent = isHome ? game.awayTeam : game.homeTeam;
      
      // Use homeScore and awayScore (not homePoints/awayPoints)
      const teamScore = isHome ? game.homeScore : game.awayScore;
      const opponentScore = isHome ? game.awayScore : game.homeScore;
      
      // Only show result if game is complete AND we have valid scores
      if (game.gameComplete && 
          typeof teamScore === 'number' && 
          typeof opponentScore === 'number') {
        const won = teamScore > opponentScore;
        const result = won ? "W" : "L";
        return `${result} ${teamScore}-${opponentScore}`;
      }
      
      return null; // Future/incomplete game, no result
    };

    const formatOpponent = (game, teamName) => {
      const isHome = game.homeTeam === teamName;
      const opponent = isHome ? game.awayTeam : game.homeTeam;
      
      if (game.neutralSite) {
        return `vs ${opponent}`;
      }
      
      return isHome ? `vs ${opponent}` : `@ ${opponent}`;
    };

    const formatDate = (dateString) => {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', { 
        weekday: 'short', 
        month: 'short', 
        day: 'numeric' 
      });
    };

    if (!team) return null;

    const currentWeekGameInfo = formatCurrentWeekGame(currentWeekGame, team.name);
    const currentWeekNum = getCurrentWeekNumber();

    return (
      <div 
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(0, 0, 0, 0.8)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000,
          padding: "20px"
        }}
        onClick={onClose}
      >
        <div 
          style={{
            perspective: "1000px",
            width: "320px",
            height: "350px",
            margin: "0 auto",
            position: "relative"
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              transform: `translate(-50%, -50%) ${isFlipped ? "rotateY(180deg)" : "rotateY(0deg)"}`,
              width: "100%",
              height: "100%",
              transformStyle: "preserve-3d",
              transition: "transform 0.6s ease-in-out",
              cursor: "pointer"
            }}
            onClick={() => setIsFlipped(!isFlipped)}
          >
            {/* Front of Card - Current Week Game Info */}
            <div
              style={{
                position: "absolute",
                width: "100%",
                height: "100%",
                backfaceVisibility: "hidden",
                backgroundColor: "rgba(255, 255, 255, 0.1)",
                backdropFilter: "blur(20px)",
                borderRadius: "20px",
                boxShadow: "0 20px 40px rgba(0, 0, 0, 0.3)",
                border: "1px solid rgba(255, 255, 255, 0.2)",
                display: "flex",
                flexDirection: "column",
                padding: "20px",
                background: team.colors?.primary 
                  ? `linear-gradient(135deg, ${team.colors.primary}aa 0%, ${team.colors.secondary || team.colors.primary}aa 100%)`
                  : "linear-gradient(135deg, rgba(59, 130, 246, 0.8) 0%, rgba(139, 92, 246, 0.8) 100%)"
              }}
            >
              {/* Team Header */}
              <div style={{ textAlign: "center", marginBottom: "16px" }}>
                <div style={{
                  width: "50px",
                  height: "50px",
                  borderRadius: "50%",
                  overflow: "hidden",
                  border: "3px solid rgba(255, 255, 255, 0.3)",
                  margin: "0 auto 10px",
                  backgroundColor: "rgba(255, 255, 255, 0.1)",
                  backdropFilter: "blur(10px)"
                }}>
                  {team.logo ? (
                    <img 
                      src={team.logo}
                      alt={team.name}
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover"
                      }}
                    />
                  ) : (
                    <div style={{
                      width: "100%",
                      height: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "16px",
                      fontWeight: "700",
                      color: "white"
                    }}>
                      {team.name ? team.name.split(' ').map(word => word[0]).join('').slice(0, 3) : '?'}
                    </div>
                  )}
                </div>
                <h2 style={{
                  fontSize: "18px",
                  fontWeight: "700",
                  color: "white",
                  margin: "0 0 4px 0",
                  textShadow: "0 2px 4px rgba(0, 0, 0, 0.3)"
                }}>
                  {team.name}
                </h2>
                <p style={{
                  fontSize: "12px",
                  color: "rgba(255, 255, 255, 0.9)",
                  margin: 0,
                  textShadow: "0 1px 2px rgba(0, 0, 0, 0.3)"
                }}>
                  {team.conference}
                </p>
              </div>

              {/* Current Week Game Info */}
              <div style={{
                backgroundColor: "rgba(255, 255, 255, 0.95)",
                borderRadius: "12px",
                padding: "8px",
                flex: 1,
                display: "flex",
                flexDirection: "column"
              }}>
                <h3 style={{
                  fontSize: "14px",
                  fontWeight: "700",
                  color: "#1e293b",
                  margin: "0 0 6px 0",
                  textAlign: "center"
                }}>
                  Week {currentWeekNum} Game
                </h3>

                {loadingSchedule ? (
                  <div style={{ textAlign: "center", color: "#64748b", flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    Loading schedule...
                  </div>
                ) : currentWeekGameInfo ? (
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "6px" }}>
                    <div style={{ textAlign: "center" }}>
                      <div style={{
                        fontSize: "16px",
                        fontWeight: "700",
                        color: currentWeekGameInfo.isComplete 
                          ? (currentWeekGameInfo.won ? "#059669" : "#dc2626")  // Green for win, red for loss
                          : "#1e293b",  // Default for upcoming
                        marginBottom: "2px"
                      }}>
                        {currentWeekGameInfo.text}
                      </div>
                      <div style={{
                        fontSize: "10px",
                        color: "#64748b",
                        textTransform: "uppercase",
                        fontWeight: "600",
                        letterSpacing: "0.5px"
                      }}>
                        {currentWeekGameInfo.isComplete ? "FINAL" : "UPCOMING"}
                      </div>
                    </div>

                    {currentWeekGame && (
                      <div style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: "8px",
                        fontSize: "11px"
                      }}>
                        <div style={{ textAlign: "center" }}>
                          <div style={{ fontSize: "9px", fontWeight: "600", color: "#64748b", textTransform: "uppercase", marginBottom: "2px" }}>
                            Date
                          </div>
                          <div style={{ color: "#1e293b", fontWeight: "500" }}>
                            {formatDate(currentWeekGame.date)}
                          </div>
                        </div>

                        {currentWeekGame.venue && (
                          <div style={{ textAlign: "center" }}>
                            <div style={{ fontSize: "9px", fontWeight: "600", color: "#64748b", textTransform: "uppercase", marginBottom: "2px" }}>
                              Venue
                            </div>
                            <div style={{ color: "#1e293b", fontWeight: "500", fontSize: "10px" }}>
                              {currentWeekGame.venue}
                            </div>
                          </div>
                        )}

                        {currentWeekGame.conferenceGame && (
                          <div style={{
                            backgroundColor: "#fef3c7",
                            color: "#92400e",
                            padding: "3px 6px",
                            borderRadius: "6px",
                            fontSize: "9px",
                            fontWeight: "600",
                            textAlign: "center",
                            marginTop: "4px"
                          }}>
                            Conference Game
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ 
                    textAlign: "center", 
                    color: "#64748b", 
                    flex: 1, 
                    display: "flex", 
                    alignItems: "center", 
                    justifyContent: "center",
                    fontSize: "12px",
                    fontWeight: "600"
                  }}>
                    BYE
                  </div>
                )}
              </div>

              {/* Flip Indicator */}
              <div style={{
                textAlign: "center",
                fontSize: "10px",
                color: "rgba(255, 255, 255, 0.8)",
                marginTop: "10px",
                textShadow: "0 1px 2px rgba(0, 0, 0, 0.3)"
              }}>
                Click to view full schedule ↻
              </div>
            </div>

            {/* Back of Card - Full Schedule */}
            <div
              style={{
                position: "absolute",
                width: "100%",
                height: "100%",
                backfaceVisibility: "hidden",
                transform: "rotateY(180deg)",
                backgroundColor: "rgba(255, 255, 255, 0.95)",
                backdropFilter: "blur(20px)",
                borderRadius: "20px",
                boxShadow: "0 20px 40px rgba(0, 0, 0, 0.3)",
                border: "1px solid rgba(255, 255, 255, 0.2)",
                padding: "16px",
                display: "flex",
                flexDirection: "column",
                overflow: "hidden"
              }}
            >
              <h3 style={{
                fontSize: "16px",
                fontWeight: "700",
                color: "#1e293b",
                margin: "0 0 12px 0",
                textAlign: "center",
                borderBottom: "2px solid #e2e8f0",
                paddingBottom: "6px"
              }}>
                {team.name} Schedule
              </h3>

              <div style={{
                flex: 1,
                overflowY: "auto",
                marginBottom: "10px"
              }}>
                {loadingSchedule ? (
                  <div style={{ textAlign: "center", color: "#64748b", padding: "16px" }}>
                    Loading schedule...
                  </div>
                ) : teamSchedule.length === 0 ? (
                  <div style={{ textAlign: "center", color: "#64748b", padding: "16px" }}>
                    No schedule available
                  </div>
                ) : (
                  <div style={{ fontSize: "11px" }}>
                    {teamSchedule.map((game, index) => {
                      // Proper game result calculation
                      const formatGameResult = (game, teamName) => {
                        const isHome = game.homeTeam === teamName;
                        const opponent = isHome ? game.awayTeam : game.homeTeam;
                        
                        // Use homeScore and awayScore (correct field names)
                        const teamScore = isHome ? game.homeScore : game.awayScore;
                        const opponentScore = isHome ? game.awayScore : game.homeScore;
                        
                        // Only show result if game is complete AND we have valid scores
                        if (game.gameComplete && 
                            typeof teamScore === 'number' && 
                            typeof opponentScore === 'number') {
                          const won = teamScore > opponentScore;
                          const result = won ? "W" : "L";
                          return {
                            text: `${result} ${teamScore}-${opponentScore}`,
                            won: won
                          };
                        }
                        
                        return null; // Future/incomplete game
                      };

                      const gameResult = formatGameResult(game, team.name);

                      return (
                        <div key={index} style={{
                          padding: "6px 0",
                          borderBottom: index < teamSchedule.length - 1 ? "1px solid #f1f5f9" : "none",
                          display: "grid",
                          gridTemplateColumns: "auto 1fr auto",
                          gap: "6px",
                          alignItems: "center"
                        }}>
                          <div style={{
                            fontSize: "9px",
                            fontWeight: "600",
                            color: "#64748b",
                            textAlign: "center",
                            minWidth: "18px"
                          }}>
                            {game.week}
                          </div>
                          
                          <div>
                            <div style={{
                              fontWeight: "600",
                              color: "#1e293b",
                              fontSize: "12px",
                              marginBottom: "1px"
                            }}>
                              {formatOpponent(game, team.name)}
                            </div>
                            <div style={{
                              fontSize: "9px",
                              color: "#64748b"
                            }}>
                              {formatDate(game.date)}
                            </div>
                          </div>

                          <div style={{
                            textAlign: "right",
                            minWidth: "40px"
                          }}>
                            {gameResult ? (
                              <div style={{
                                fontSize: "10px",
                                fontWeight: "700",
                                color: gameResult.won ? "#059669" : "#dc2626"
                              }}>
                                {gameResult.text}
                              </div>
                            ) : (
                              <div style={{
                                fontSize: "9px",
                                color: "#64748b",
                                fontWeight: "500"
                              }}>
                                TBD
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div style={{
                fontSize: "10px",
                color: "#64748b",
                textAlign: "center"
              }}>
                Click to flip back ↻
              </div>
            </div>
          </div>
        </div>

        {/* Close button */}
        <button
          onClick={onClose}
          className="fixed top-5 right-5 w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm border border-white/30 text-white text-xl cursor-pointer flex items-center justify-center shadow-lg hover:bg-white/30 transition-all duration-300 z-[1001]"
        >
          ×
        </button>
      </div>
    );
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

  // FIXED: Helper function to check if a member has live games using schedule data
  const getMemberLiveStatus = (member) => {
    // Only check for live games in current view mode
    if (viewMode !== 'current') return false;

    const lineup = member.lineup || {};
    const starters = Array.isArray(lineup.starters) ? lineup.starters : [];
    const bench = Array.isArray(lineup.bench) ? lineup.bench : [];
    const allTeamsOwned = [...starters, ...bench].filter(team => 
      typeof team === 'string' && team.trim() !== ''
    );

    // NEW: Check schedule data first, then fallback to team documents
    return allTeamsOwned.some(teamName => {
      // First check schedule data (more reliable)
      const scheduleGame = getScheduleEntry(scheduleData, teamName);
      if (scheduleGame && !scheduleLoading) {
        return scheduleGame.gameStatus === 'in_progress' || scheduleGame.hasLiveGame;
      }

      const team = allTeams[normalize(teamName)];
      return team?.currentSeason?.gameStatus === 'in_progress' || team?.currentSeason?.hasLiveGame;
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-4 sm:left-10 w-48 sm:w-72 h-48 sm:h-72 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full blur-3xl animate-pulse"></div>
        </div>
        <div className="relative z-10 flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="text-4xl mb-4 animate-spin">🏆</div>
            <p className="text-xl text-white/80">Loading league standings...</p>
          </div>
        </div>
      </div>
    );
  }

  // NEW: Get display data based on view mode
  const getDisplayData = () => {
    if (viewMode === 'current') {
      // Current live standings
      return [...members].sort((a, b) => {
        const aPoints = a.points ?? 0;
        const bPoints = b.points ?? 0;
        if (bPoints !== aPoints) return bPoints - aPoints;
        
        const aWeeklyPoints = a.weeklyPoints ?? 0;
        const bWeeklyPoints = b.weeklyPoints ?? 0;
        return bWeeklyPoints - aWeeklyPoints;
      });
    } else {
      // Historical standings for selected week
      return weeklyStandings[selectedWeek] || [];
    }
  };

  const displayData = getDisplayData();

  // NEW: Get current week number for display
  const getCurrentWeekNumber = () => {
    if (typeof currentWeek === 'number') return currentWeek;
    if (!currentWeek || typeof currentWeek !== 'string') return 1;
    const weekMatch = currentWeek.match(/\d+/);
    return weekMatch ? parseInt(weekMatch[0]) : 1;
  };

  const currentWeekNum = getCurrentWeekNumber();

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
      <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 py-4 pb-32">
        
        {/* Header */}
        <div className="text-center mb-8">
          <div className="mb-4">
            <span className="inline-block text-4xl sm:text-5xl mb-2">🏆</span>
          </div>
          <div className="flex items-center justify-center gap-4 mb-2">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black leading-tight">
              <span className="bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
                {leagueName ? `${leagueName} Standings` : "League Standings"}
              </span>
            </h1>
            <Link
              to={`/${leagueId}/league-rules`}
              className="bg-white/10 backdrop-blur-sm border border-white/30 rounded-xl p-3 text-white/80 hover:text-white hover:bg-white/20 transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-white/20"
              title="League Rules & Settings"
            >
              <Settings size={24} />
            </Link>
          </div>
          <p className="text-lg sm:text-xl text-white/80">
            {viewMode === 'current' 
              ? `Live Standings - Week ${currentWeekNum}`
              : `Final Standings - Week ${selectedWeek}`
            }
          </p>
        </div>

        {/* NEW: Week Selector */}
        {(availableWeeks.length > 0 || currentWeekNum > 1) && <WeekSelector />}

        {/* Live Game Status Key - Only show for current week */}
        {viewMode === 'current' && (
          <div className="bg-white/10 backdrop-blur-lg rounded-xl p-3 border border-white/20 mb-6">
            <h3 className="text-sm font-semibold text-white/90 mb-3 text-center">Game Status Legend</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs text-white/70">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-gray-500 rounded-full flex items-center justify-center text-white text-xs font-bold">?</div>
                <span>Not Started</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-green-500 rounded-full animate-pulse flex items-center justify-center text-white text-xs font-bold">5</div>
                <span>Live Game</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center text-white text-xs font-bold">5</div>
                <span>Final</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-yellow-500 rounded-full flex items-center justify-center text-white text-xs font-bold">👑</div>
                <span>Captain (2x)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-cyan-500 rounded-full flex items-center justify-center text-white text-xs font-bold">⚡</div>
                <span>Trip Play (3x)</span>
              </div>
            </div>
          </div>
        )}

        {/* Recent Moves Widget - Only show for current week */}
        {viewMode === 'current' && <RecentMovesWidget leagueId={leagueId} />}

        {/* Condensed Leaderboard Summary */}
        {displayData.length > 0 && (
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-4 border border-white/20 mb-8">
            <h2 className="text-lg font-bold text-white mb-4 text-center">
              {viewMode === 'current' ? 'Quick Standings' : `Week ${selectedWeek} Final Results`}
            </h2>
            <div className="space-y-2">
            {displayData.map((member, idx) => {
              const getRankColor = (position) => {
                if (position === 0) return "text-yellow-400"; // Gold
                if (position === 1) return "text-gray-300"; // Silver
                if (position === 2) return "text-orange-400"; // Bronze
                return "text-white/80"; // Default
              };

              // Calculate playoff cutoff based on maxManagers
              const playoffSpots = maxManagers === 8 ? 4 : 6;
              const isPlayoffLine = idx === playoffSpots;
              const hasLiveGames = getMemberLiveStatus(member);
              const hasTripPlay = member.tripPlayTeam && viewMode === 'current';

              // Use rank from historical data or calculate for current
              const displayRank = viewMode === 'historical' ? member.rank : idx + 1;

              // Lightning Border Component for Trip Play
              const TripPlayBorder = ({ children }) => {
                if (!hasTripPlay) return children;
                
                return (
                  <div className="relative">
                    {/* Animated lightning border */}
                    <div className="absolute inset-0 rounded-lg overflow-hidden">
                      <div className="absolute inset-0 bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-500 animate-pulse opacity-30"></div>
                      <div className="absolute inset-[2px] bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 rounded-lg"></div>
                      
                      {/* Lightning animation effect */}
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-cyan-300 to-transparent opacity-50 animate-pulse"></div>
                      
                    {/* Single lightning bolt in top-left */}
                    <div className="absolute top-1 left-1 text-cyan-400 animate-bounce">⚡</div>
                    </div>
                    
                    {/* Content */}
                    <div className="relative z-10">
                      {children}
                    </div>
                  </div>
                );
              };

              const cardContent = (
                <div className={`relative flex items-center justify-between py-2 px-3 rounded-lg hover:bg-white/10 transition-colors duration-200 ${
                  viewMode === 'current' && idx < playoffSpots ? 'bg-green-400/10 border border-green-400/20' : 'bg-white/5'
                }`}>
                  {/* Rank and Team Name */}
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${getRankColor(displayRank - 1)}`}>
                      {displayRank}
                    </div>
                    <span className="text-white font-medium truncate">
                      {member.teamName || "Unnamed Team"}
                    </span>
                    {/* Live Games Indicator - Only for current view */}
                    {hasLiveGames && viewMode === 'current' && (
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                        <span className="text-xs text-green-400 font-medium">LIVE</span>
                      </div>
                    )}
                    {/* Captain Indicator - Only for current view */}
                    {member.captain && viewMode === 'current' && (
                      <div className="flex items-center gap-1">
                        <div className="text-xs text-yellow-400">👑</div>
                        <span className="text-xs text-yellow-400 font-medium">{member.captain}</span>
                      </div>
                    )}
                    {/* Trip Play Indicator - Only for current view */}
                    {hasTripPlay && (
                      <div className="flex items-center gap-1">
                        <div className="text-xs text-cyan-400">⚡</div>
                        <div className="text-center">
                          <div className="text-xs text-cyan-400 font-bold leading-none">3X</div>
                          <div className="text-[8px] text-cyan-400 font-medium leading-none">ACTIVE</div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Points */}
                  <div className="text-blue-400 font-bold text-lg">
                    {member.points ?? 0}
                  </div>
                </div>
              );

              return (
                <div key={`summary-${member.id}`}>
                  {/* Playoff Line Separator */}
                  {isPlayoffLine && viewMode === 'current' && (
                    <div className="flex items-center gap-3 py-3">
                      <div className="flex-1 h-px bg-gradient-to-r from-transparent via-red-400 to-transparent"></div>
                      <span className="text-red-400 text-xs font-semibold uppercase tracking-wider px-3 py-1 bg-red-400/10 rounded-full border border-red-400/30">
                        Playoff Line
                      </span>
                      <div className="flex-1 h-px bg-gradient-to-r from-red-400 via-transparent to-transparent"></div>
                    </div>
                  )}

                  <TripPlayBorder>
                    {cardContent}
                  </TripPlayBorder>
                </div>
              );
            })}
            </div>
          </div>
        )}

        {/* Scoring Modal - Only show for current week */}
        {viewMode === 'current' && (
          <div className="text-center mb-6">
            <button
              onClick={() => setShowScoringModal(true)}
              className="text-white/80 hover:text-white text-lg font-medium transition-colors duration-200 underline underline-offset-2 hover:underline-offset-4"
            >
              How does scoring work?
            </button>
          </div>
        )}

        {/* Standings Cards */}
        {displayData.length === 0 ? (
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-12 border border-white/20 text-center">
            <div className="text-4xl mb-4">👥</div>
            <p className="text-white/80 text-lg">
              {viewMode === 'current' 
                ? "No members found in this league."
                : `No standings data available for Week ${selectedWeek}.`
              }
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {displayData.map((member, idx) => {
              // For historical view, get lineup from snapshot data
              let lineup, starters, bench, allTeamsOwned;
              
              if (viewMode === 'historical') {
                // Historical data doesn't include lineup info in standings snapshot
                // We'll show minimal info for historical views
                lineup = { starters: [], bench: [] };
                starters = [];
                bench = [];
                allTeamsOwned = [];
              } else {
                // Current view - use live member data
                lineup = member.lineup || {};
                starters = Array.isArray(lineup.starters) ? lineup.starters : [];
                bench = Array.isArray(lineup.bench) ? lineup.bench : [];
                allTeamsOwned = [...starters, ...bench].filter(team => 
                  typeof team === 'string' && team.trim() !== ''
                );
              }
              
              const hasLiveGames = getMemberLiveStatus(member);

              // Determine rank styling
              const getRankStyle = (position) => {
                if (position === 0) return { 
                  backgroundColor: "#fbbf24", 
                  color: "#92400e",
                  showNumber: true,
                  icon: <Trophy size={12} className="text-yellow-800" />
                }; // Gold
                if (position === 1) return { 
                  backgroundColor: "#d1d5db", 
                  color: "#374151",
                  showNumber: true,
                  icon: <Star size={12} className="text-gray-700" />
                }; // Silver
                if (position === 2) return { 
                  backgroundColor: "#f97316", 
                  color: "white",
                  showNumber: true,
                  icon: <TrendingUp size={12} className="text-white" />
                }; // Bronze
                return { 
                  backgroundColor: "rgba(255, 255, 255, 0.2)", 
                  color: "white",
                  showNumber: true,
                  icon: null
                }; // Default
              };

              // Use rank from historical data or calculate for current
              const displayRank = viewMode === 'historical' ? member.rank : idx + 1;
              const rankStyle = getRankStyle(displayRank - 1);

              return (
                <div key={member.id} className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20 hover:bg-white/15 transition-all duration-300">
                  {/* Header: Rank, Team Name, Points */}
                  <div className="flex items-center mb-4">
                    {/* User Avatar with Rank */}
                    <UserAvatar member={member} size={56} rankStyle={rankStyle} rank={displayRank} />

                    {/* Team Info */}
                    <div className="flex-1 min-w-0 ml-4">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-base font-bold text-white truncate">
                          {member.teamName || "Unnamed Team"}
                        </h3>
                        {/* Enhanced Live Games Indicator for Manager - Only current view */}
                        {hasLiveGames && viewMode === 'current' && (
                          <div className="flex items-center gap-1 bg-green-500/20 px-2 py-1 rounded-full border border-green-400/30">
                            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                            <span className="text-xs text-green-300 font-medium">LIVE</span>
                          </div>
                        )}
                      </div>
                      <p className="text-white/70 flex items-center gap-2">
                        {member.firstName || "Unknown Manager"}
                      </p>
                    </div>

                    {/* Points & Weekly Score */}
                    <div className="text-right">
                      <div className="text-2xl font-black text-blue-400 leading-none">
                        {member.points ?? 0}
                      </div>
                      {viewMode === 'current' ? (
                        <>
                          <div className="text-xs text-white/60 mt-1">
                            {member.weeklyPoints ?? 0} Pts in Wk {currentWeekNum}
                          </div>
                          <div className="text-xs text-white/60 mt-1">
                            {member.freeAgentMoves ?? 0} FA moves
                          </div>
                          {/* Duplicate Week Display - smaller text */}
                          {member.duplicateWeek1 && (
                            <div className="text-[10px] text-purple-400 mt-1 font-medium">
                              {member.duplicateWeek1}
                            </div>
                          )}
                        </>
                      ) : (
                        <>
                          <div className="text-xs text-white/60 mt-1">
                            {member.weeklyPoints ?? 0} Pts in Week {selectedWeek}
                          </div>
                          <div className="text-xs text-orange-400 mt-1 font-medium">
                            Final Standing
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Team Roster - Only show for current view */}
                  {viewMode === 'current' && (
                    <div className="mt-6">
                      {/* Headers Row */}
                      <div className="flex gap-1 mb-3 relative">
                        {/* Starters Header */}
                        <div className="text-xs font-semibold text-green-400 uppercase tracking-wider flex items-center gap-1">
                          <Users size={12} />
                          Starters
                        </div>
                        
                        {/* Spacer to align bench header with 6th position */}
                        <div style={{ width: `${5 * 36 - 80}px` }}></div>
                        
                        {/* Bench Header - aligned with 6th team position */}
                        <div className="text-xs font-semibold text-orange-400 uppercase tracking-wider flex items-center gap-1">
                          <Star size={12} />
                          Bench
                        </div>
                      </div>
                      
                      {/* Teams Row */}
                      <div className="flex gap-1 justify-start flex-wrap">
                        {/* Starters */}
                        {starters.slice(0, 5).map((teamName, teamIdx) => (
                          <TeamLogo 
                            key={`starter-${teamIdx}`}
                            teamName={teamName} 
                            size={34} 
                            clickable={true}
                            isCaptain={member.captain === teamName}
                            isTripPlay={member.tripPlayTeam === teamName}
                          />
                        ))}
                        
                        {/* Empty starter slots */}
                        {Array.from({ length: Math.max(0, 5 - starters.length) }).map((_, emptyIdx) => (
                          <div key={`empty-starter-${emptyIdx}`} className="w-[34px] h-[34px] rounded-full border-2 border-dashed border-green-400/50 flex items-center justify-center bg-green-400/10 backdrop-blur-sm flex-shrink-0">
                            <div className="w-1.5 h-1.5 rounded-full bg-green-400/50" />
                          </div>
                        ))}

                        {/* Bench */}
                        {bench.slice(0, 2).map((teamName, teamIdx) => (
                          <TeamLogo 
                            key={`bench-${teamIdx}`}
                            teamName={teamName} 
                            size={34} 
                            clickable={true}
                            isCaptain={false} // Bench players can't be captain
                            isTripPlay={false} // Bench players can't have trip play
                          />
                        ))}
                        
                        {/* Empty bench slots */}
                        {Array.from({ length: Math.max(0, 2 - bench.length) }).map((_, emptyIdx) => (
                          <div key={`empty-bench-${emptyIdx}`} className="w-[34px] h-[34px] rounded-full border-2 border-dashed border-orange-400/50 flex items-center justify-center bg-orange-400/10 backdrop-blur-sm flex-shrink-0">
                            <div className="w-1.5 h-1.5 rounded-full bg-orange-400/50" />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Historical Week Summary - Only show for historical view */}
                  {viewMode === 'historical' && (
                    <div className="mt-6 bg-white/5 rounded-xl p-4">
                      <div className="text-center">
                        <div className="text-lg font-bold text-blue-400 mb-2">
                          Week {selectedWeek} Final Result
                        </div>
                        <div className="text-sm text-white/70">
                          Rank: {member.rank} • Points: {member.points} • Weekly: {member.weeklyPoints}
                        </div>
                        {member.snapshotAt && (
                          <div className="text-xs text-white/50 mt-2">
                            Finalized: {new Date(member.snapshotAt.toDate()).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Smack Talk Speech Bubble - Only show if exists and for current view */}
                  {member.smackTalk && member.smackTalk.trim() && viewMode === 'current' && (
                    <div className="mt-4 flex justify-start">
                      <div className="bg-gradient-to-r from-blue-500 to-purple-500 text-white px-4 py-2 rounded-2xl text-sm font-medium max-w-[80%] relative shadow-lg">
                        💬 {member.smackTalk}
                        {/* Speech bubble tail */}
                        <div className="absolute bottom-0 left-4 transform translate-y-full">
                          <div className="w-0 h-0 border-l-[6px] border-r-[6px] border-t-[6px] border-l-transparent border-r-transparent border-t-blue-500" />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Team Card Modal */}
      {selectedTeam && (
        <TeamCardModal 
          team={selectedTeam} 
          onClose={() => setSelectedTeam(null)} 
        />
      )}

      {/* Scoring System Modal */}
      {showScoringModal && (
        <ScoringSystemModal 
          onClose={() => setShowScoringModal(false)}
        />
      )}
    </div>
  );
}

export default MyLeague;