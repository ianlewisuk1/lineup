import React, { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { db, auth } from "../firebase/firebase";
import { collection, getDocs, doc, getDoc } from "firebase/firestore";
import { Trophy, Users, Star, TrendingUp, Settings } from "lucide-react";
import BottomNavBar from "../components/BottomNavBar";
import ScoringSystemModal from "../components/ScoringSystemModal";
import RecentMovesWidget from '../components/RecentMovesWidget';

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
        if (configDoc.exists()) {
          setCurrentWeek(configDoc.data().currentWeek || "Preseason");
        }

        // Fetch all teams first to get team logos
          const teamsRef = collection(db, "teams");
          const teamsSnapshot = await getDocs(teamsRef);
          const teamsMap = {};
          teamsSnapshot.docs.forEach(doc => {
            const teamData = doc.data();
            if (teamData.school) {
                const normalize = (name) =>
                  name
                    ?.toLowerCase()
                    .replace(/\s+/g, "-")
                    .replace(/&/g, "-")
                    .replace(/[^a-z0-9\-]/g, "");

                console.log("Normalized key for Texas A&M:", normalize("Texas A&M"));

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
                currentWeekPoints: teamData.currentSeason?.currentWeekPoints || null,
                gameComplete: teamData.currentSeason?.gameComplete || false,
                name: teamData.school,  // ADD THIS LINE
                school: teamData.school // ADD THIS LINE
              };
            }
          });
          setAllTeams(teamsMap);

        // Fetch league members
        const membersRef = collection(db, "leagues", leagueId, "members");
        const snapshot = await getDocs(membersRef);
        
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

            return {
              id: memberDoc.id,
              firstName,
              ...memberData
            };
          })
        );

        setMembers(membersData);
        setLoading(false);
      } catch (error) {
        console.error("Error fetching data:", error);
        setLoading(false);
      }
    };

    fetchData();
  }, [leagueId]);

  // Team logo component with flipping card functionality
  const TeamLogo = ({ teamName, size = 32, clickable = false }) => {

    const normalize = (name) =>
      name
        ?.toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/&/g, "-")
        .replace(/[^a-z0-9\-]/g, "");

    const team = allTeams[normalize(teamName)];
    const logoUrl = team?.logo;
    const [isFlipped, setIsFlipped] = useState(false);

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
      border: "2px solid rgba(255, 255, 255, 0.3)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(255, 255, 255, 0.1)",
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
          {/* Weekly Points Badge */}
          {clickable && (
            <div style={{
              position: "absolute",
              top: "-6px",
              right: "-6px",
              backgroundColor: team?.gameComplete 
                ? (team?.currentWeekPoints > 0 ? "#10b981" : "#6b7280")
                : "#f59e0b",
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
              color: 'white',
              textAlign: 'center',
              background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)'
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
        {/* Weekly Points Badge */}
        {clickable && (
          <div style={{
            position: "absolute",
            top: "-6px",
            right: "-6px",
            backgroundColor: team?.gameComplete 
              ? (team?.currentWeekPoints > 0 ? "#10b981" : "#6b7280")
              : "#f59e0b",
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
            boxShadow: "0 2px 6px rgba(0, 0, 0, 0.2)"
          }}>
            {team?.gameComplete ? (team?.currentWeekPoints || 0) : "?"}
          </div>
        )}
        
        <div 
          style={{
            ...logoStyle,
            background: "linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)",
            color: "white",
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

// User Avatar Component for Rankings
  const UserAvatar = ({ member, size = 48, rankStyle, rank }) => {
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
        
        {/* Icon overlay for top 3 positions */}
        {rankStyle.icon && (
          <div className="absolute -top-1 -right-1 bg-white rounded-full p-1 shadow-sm">
            {rankStyle.icon}
          </div>
        )}
      </div>
    );
  };

  // Enhanced Team Card Modal
  const TeamCardModal = ({ team, onClose }) => {
    const [isFlipped, setIsFlipped] = useState(false);
    const [teamSchedule, setTeamSchedule] = useState([]);
    const [nextGame, setNextGame] = useState(null);
    const [loadingSchedule, setLoadingSchedule] = useState(true);

    useEffect(() => {
      const fetchTeamSchedule = async () => {
        if (!team?.name) return;
        
        try {
          setLoadingSchedule(true);
          const scheduleData = [];
          
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

          // Find next game (first incomplete game)
          const upcomingGame = scheduleData.find(game => !game.gameComplete);
          setNextGame(upcomingGame);
          
        } catch (error) {
          console.error("Error fetching team schedule:", error);
        } finally {
          setLoadingSchedule(false);
        }
      };

      fetchTeamSchedule();
    }, [team?.name]);

    const formatGameResult = (game, teamName) => {
      const isHome = game.homeTeam === teamName;
      const opponent = isHome ? game.awayTeam : game.homeTeam;
      const teamScore = isHome ? game.homePoints : game.awayPoints;
      const opponentScore = isHome ? game.awayPoints : game.homePoints;
      
      if (game.gameComplete && teamScore !== null && opponentScore !== null) {
        const won = teamScore > opponentScore;
        const result = won ? "W" : "L";
        return `${result} ${teamScore}-${opponentScore}`;
      }
      
      return ""; // Future game, no result
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

    const getSpreadText = (game, teamName) => {
      if (!game.homeSpread && !game.awaySpread) return "Pick 'em";
      
      const isHome = game.homeTeam === teamName;
      const teamSpread = isHome ? game.homeSpread : game.awaySpread;
      
      if (!teamSpread) return "Pick 'em";
      
      const spread = parseFloat(teamSpread);
      if (spread > 0) return `+${spread}`;
      if (spread < 0) return `${spread}`;
      return "Pick 'em";
    };

    if (!team) return null;

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
            height: "400px",
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
            {/* Front of Card - Next Game Info */}
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
                padding: "24px",
                background: team.colors?.primary 
                  ? `linear-gradient(135deg, ${team.colors.primary}aa 0%, ${team.colors.secondary || team.colors.primary}aa 100%)`
                  : "linear-gradient(135deg, rgba(59, 130, 246, 0.8) 0%, rgba(139, 92, 246, 0.8) 100%)"
              }}
            >
              {/* Team Header */}
              <div style={{ textAlign: "center", marginBottom: "20px" }}>
                <div style={{
                  width: "60px",
                  height: "60px",
                  borderRadius: "50%",
                  overflow: "hidden",
                  border: "3px solid rgba(255, 255, 255, 0.3)",
                  margin: "0 auto 12px",
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
                      fontSize: "18px",
                      fontWeight: "700",
                      color: "white"
                    }}>
                      {team.name ? team.name.split(' ').map(word => word[0]).join('').slice(0, 3) : '?'}
                    </div>
                  )}
                </div>
                <h2 style={{
                  fontSize: "20px",
                  fontWeight: "700",
                  color: "white",
                  margin: "0 0 4px 0",
                  textShadow: "0 2px 4px rgba(0, 0, 0, 0.3)"
                }}>
                  {team.name}
                </h2>
                <p style={{
                  fontSize: "14px",
                  color: "rgba(255, 255, 255, 0.9)",
                  margin: 0,
                  textShadow: "0 1px 2px rgba(0, 0, 0, 0.3)"
                }}>
                  {team.conference}
                </p>
              </div>

              {/* Next Game Info */}
              <div style={{
                backgroundColor: "rgba(255, 255, 255, 0.95)",
                borderRadius: "12px",
                padding: "16px",
                flex: 1,
                display: "flex",
                flexDirection: "column"
              }}>
                <h3 style={{
                  fontSize: "16px",
                  fontWeight: "700",
                  color: "#1e293b",
                  margin: "0 0 12px 0",
                  textAlign: "center"
                }}>
                  Next Game
                </h3>

                {loadingSchedule ? (
                  <div style={{ textAlign: "center", color: "#64748b", flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    Loading schedule...
                  </div>
                ) : nextGame ? (
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "12px" }}>
                    <div style={{ textAlign: "center" }}>
                      <div style={{
                        fontSize: "18px",
                        fontWeight: "700",
                        color: "#1e293b",
                        marginBottom: "4px"
                      }}>
                        {formatOpponent(nextGame, team.name)}
                      </div>
                      <div style={{
                        fontSize: "12px",
                        color: "#64748b",
                        textTransform: "uppercase",
                        fontWeight: "600",
                        letterSpacing: "0.5px"
                      }}>
                        Week {nextGame.week}
                      </div>
                    </div>

                    <div style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "12px",
                      fontSize: "14px"
                    }}>
                      <div>
                        <div style={{ fontSize: "11px", fontWeight: "600", color: "#64748b", textTransform: "uppercase", marginBottom: "2px" }}>
                          Date
                        </div>
                        <div style={{ color: "#1e293b", fontWeight: "500" }}>
                          {formatDate(nextGame.date)}
                        </div>
                      </div>

                      <div>
                        <div style={{ fontSize: "11px", fontWeight: "600", color: "#64748b", textTransform: "uppercase", marginBottom: "2px" }}>
                          Venue
                        </div>
                        <div style={{ color: "#1e293b", fontWeight: "500" }}>
                          {nextGame.venue || "TBD"}
                        </div>
                      </div>

                      <div>
                        <div style={{ fontSize: "11px", fontWeight: "600", color: "#64748b", textTransform: "uppercase", marginBottom: "2px" }}>
                          Location
                        </div>
                        <div style={{ color: "#1e293b", fontWeight: "500" }}>
                          {nextGame.homeTeam === team.name ? "Home" : "Away"}
                        </div>
                      </div>

                      <div>
                        <div style={{ fontSize: "11px", fontWeight: "600", color: "#64748b", textTransform: "uppercase", marginBottom: "2px" }}>
                          Spread
                        </div>
                        <div style={{ 
                          color: "#1e293b", 
                          fontWeight: "600",
                          fontSize: "16px"
                        }}>
                          {getSpreadText(nextGame, team.name)}
                        </div>
                      </div>
                    </div>

                    {nextGame.conferenceGame && (
                      <div style={{
                        backgroundColor: "#fef3c7",
                        color: "#92400e",
                        padding: "6px 12px",
                        borderRadius: "6px",
                        fontSize: "12px",
                        fontWeight: "600",
                        textAlign: "center",
                        marginTop: "8px"
                      }}>
                        Conference Game
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
                    fontSize: "14px"
                  }}>
                    No upcoming games scheduled
                  </div>
                )}
              </div>

              {/* Flip Indicator */}
              <div style={{
                textAlign: "center",
                fontSize: "11px",
                color: "rgba(255, 255, 255, 0.8)",
                marginTop: "12px",
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
                padding: "20px",
                display: "flex",
                flexDirection: "column",
                overflow: "hidden"
              }}
            >
              <h3 style={{
                fontSize: "18px",
                fontWeight: "700",
                color: "#1e293b",
                margin: "0 0 16px 0",
                textAlign: "center",
                borderBottom: "2px solid #e2e8f0",
                paddingBottom: "8px"
              }}>
                {team.name} Schedule
              </h3>

              <div style={{
                flex: 1,
                overflowY: "auto",
                marginBottom: "12px"
              }}>
                {loadingSchedule ? (
                  <div style={{ textAlign: "center", color: "#64748b", padding: "20px" }}>
                    Loading schedule...
                  </div>
                ) : teamSchedule.length === 0 ? (
                  <div style={{ textAlign: "center", color: "#64748b", padding: "20px" }}>
                    No schedule available
                  </div>
                ) : (
                  <div style={{ fontSize: "12px" }}>
                    {teamSchedule.map((game, index) => (
                      <div key={index} style={{
                        padding: "8px 0",
                        borderBottom: index < teamSchedule.length - 1 ? "1px solid #f1f5f9" : "none",
                        display: "grid",
                        gridTemplateColumns: "auto 1fr auto",
                        gap: "8px",
                        alignItems: "center"
                      }}>
                        <div style={{
                          fontSize: "10px",
                          fontWeight: "600",
                          color: "#64748b",
                          textAlign: "center",
                          minWidth: "20px"
                        }}>
                          {game.week}
                        </div>
                        
                        <div>
                          <div style={{
                            fontWeight: "600",
                            color: "#1e293b",
                            fontSize: "13px",
                            marginBottom: "2px"
                          }}>
                            {formatOpponent(game, team.name)}
                          </div>
                          <div style={{
                            fontSize: "10px",
                            color: "#64748b"
                          }}>
                            {formatDate(game.date)} • {game.venue || "TBD"}
                          </div>
                        </div>

                        <div style={{
                          textAlign: "right",
                          minWidth: "50px"
                        }}>
                          {game.gameComplete ? (
                            <div style={{
                              fontSize: "11px",
                              fontWeight: "700",
                              color: formatGameResult(game, team.name).startsWith('W') ? "#059669" : "#dc2626"
                            }}>
                              {formatGameResult(game, team.name)}
                            </div>
                          ) : (
                            <div style={{
                              fontSize: "10px",
                              color: "#64748b",
                              fontWeight: "500"
                            }}>
                              {getSpreadText(game, team.name)}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{
                fontSize: "11px",
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

  // Sort by points descending
  const sortedMembers = [...members].sort((a, b) => {
    const aPoints = a.points ?? 0;
    const bPoints = b.points ?? 0;
    if (bPoints !== aPoints) return bPoints - aPoints;
    
    const aWeeklyPoints = a.weeklyPoints ?? 0;
    const bWeeklyPoints = b.weeklyPoints ?? 0;
    return bWeeklyPoints - aWeeklyPoints;
  });

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
            Current Week: {currentWeek}
          </p>
        </div>

        {/* Recent Moves Widget */}
        <RecentMovesWidget leagueId={leagueId} />

        {/* Condensed Leaderboard Summary */}
        {sortedMembers.length > 0 && (
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-4 border border-white/20 mb-8">
            <h2 className="text-lg font-bold text-white mb-4 text-center">Quick Standings</h2>
            <div className="space-y-2">
              {sortedMembers.map((member, idx) => {
                const getRankColor = (position) => {
                  if (position === 0) return "text-yellow-400"; // Gold
                  if (position === 1) return "text-gray-300"; // Silver
                  if (position === 2) return "text-orange-400"; // Bronze
                  return "text-white/80"; // Default
                };

                // Calculate playoff cutoff based on maxManagers
                const playoffSpots = maxManagers === 8 ? 4 : 6;
                const isPlayoffLine = idx === playoffSpots;

                return (
                  <div key={`summary-${member.id}`}>
                    {/* Playoff Line Separator */}
                    {isPlayoffLine && (
                      <div className="flex items-center gap-3 py-3">
                        <div className="flex-1 h-px bg-gradient-to-r from-transparent via-red-400 to-transparent"></div>
                        <span className="text-red-400 text-xs font-semibold uppercase tracking-wider px-3 py-1 bg-red-400/10 rounded-full border border-red-400/30">
                          Playoff Line
                        </span>
                        <div className="flex-1 h-px bg-gradient-to-r from-red-400 via-transparent to-transparent"></div>
                      </div>
                    )}

                    <div className={`flex items-center justify-between py-2 px-3 rounded-lg hover:bg-white/10 transition-colors duration-200 ${
                      idx < playoffSpots ? 'bg-green-400/10 border border-green-400/20' : 'bg-white/5'
                    }`}>
                      {/* Rank and Team Name */}
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${getRankColor(idx)}`}>
                          {idx + 1}
                        </div>
                        <span className="text-white font-medium truncate">
                          {member.teamName || "Unnamed Team"}
                        </span>
                        {/* Playoff indicator */}
                        {idx < playoffSpots && (
                          <div className="text-green-400 text-xs">🏆</div>
                        )}
                      </div>

                      {/* Points */}
                      <div className="text-blue-400 font-bold text-lg">
                        {member.points ?? 0}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Scoring Modal */}
        <div className="text-center mb-6">
          <button
            onClick={() => setShowScoringModal(true)}
            className="text-white/80 hover:text-white text-lg font-medium transition-colors duration-200 underline underline-offset-2 hover:underline-offset-4"
          >
            How does scoring work?
          </button>
        </div>


        {/* Standings Cards */}
        {sortedMembers.length === 0 ? (
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-12 border border-white/20 text-center">
            <div className="text-4xl mb-4">👥</div>
            <p className="text-white/80 text-lg">
              No members found in this league.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {sortedMembers.map((member, idx) => {
              const lineup = member.lineup || {};
              const starters = Array.isArray(lineup.starters) ? lineup.starters : [];
              const bench = Array.isArray(lineup.bench) ? lineup.bench : [];
              const allTeamsOwned = [...starters, ...bench].filter(team => 
                typeof team === 'string' && team.trim() !== ''
              );

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

              const rankStyle = getRankStyle(idx);

              return (
                <div key={member.id} className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20 hover:bg-white/15 transition-all duration-300">
                  {/* Header: Rank, Team Name, Points */}
                  <div className="flex items-center mb-4">
                    {/* User Avatar with Rank */}
                    <UserAvatar member={member} size={48} rankStyle={rankStyle} rank={idx + 1} />

                    {/* Team Info */}
                    <div className="flex-1 min-w-0 ml-4">  {/* Added ml-4 here */}
                      <h3 className="text-xl font-bold text-white mb-1 truncate">
                        {member.teamName || "Unnamed Team"}
                      </h3>
                      <p className="text-white/70">
                        {member.firstName || "Unknown Manager"}
                      </p>
                    </div>

                    {/* Points & Weekly Score */}
                    <div className="text-right">
                      <div className="text-2xl font-black text-blue-400 leading-none">
                        {member.points ?? 0}
                      </div>
                      <div className="text-xs text-white/60 mt-1">
                        {member.weeklyPoints ?? 0} in {currentWeek}
                      </div>
                      <div className="text-xs text-white/60 mt-1">
                        {member.freeAgentMoves ?? 0} FA moves
                      </div>
                    </div>
                  </div>

                  {/* Team Roster with Starters/Bench Separation */}
                  <div className="flex gap-2 items-start">
                    {/* Starters Section */}
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-green-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <Users size={12} />
                        Starters
                      </div>
                      <div className="flex gap-2 justify-start">
                        {/* Starters */}
                        {starters.slice(0, 5).map((teamName, teamIdx) => (
                          <TeamLogo 
                            key={`starter-${teamIdx}`}
                            teamName={teamName} 
                            size={34} 
                            clickable={true} 
                          />
                        ))}
                        
                        {/* Empty starter slots */}
                        {Array.from({ length: Math.max(0, 5 - starters.length) }).map((_, emptyIdx) => (
                          <div key={`empty-starter-${emptyIdx}`} className="w-[34px] h-[34px] rounded-full border-2 border-dashed border-green-400/50 flex items-center justify-center bg-green-400/10 backdrop-blur-sm flex-shrink-0">
                            <div className="w-1.5 h-1.5 rounded-full bg-green-400/50" />
                          </div>
                        ))}
                      </div>
                    </div>
                    
                    {/* Bench Section */}
                    <div className="flex-none">
                      <div className="text-xs font-semibold text-orange-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <Star size={12} />
                        Bench
                      </div>
                      <div className="flex gap-2">
                        {/* Bench */}
                        {bench.slice(0, 2).map((teamName, teamIdx) => (
                          <TeamLogo 
                            key={`bench-${teamIdx}`}
                            teamName={teamName} 
                            size={34} 
                            clickable={true} 
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
                  </div>

                  {/* Smack Talk Speech Bubble - Only show if exists */}
                  {member.smackTalk && member.smackTalk.trim() && (
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