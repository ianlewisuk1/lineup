import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { db } from "../firebase/firebase";
import { collection, getDocs, doc, getDoc } from "firebase/firestore";
import LeagueNavBar from "../components/LeagueNavBar";

function MyLeague() {
  const { leagueId } = useParams();
  const navigate = useNavigate();
  const [members, setMembers] = useState([]);
  const [allTeams, setAllTeams] = useState({});
  const [leagueName, setLeagueName] = useState("");
  const [currentWeek, setCurrentWeek] = useState("Preseason");
  const [loading, setLoading] = useState(true);
  const [selectedTeam, setSelectedTeam] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        console.log("Using leagueId:", leagueId);

        // Fetch league info for name
        const leagueDoc = await getDoc(doc(db, "leagues", leagueId));
        if (leagueDoc.exists()) {
          setLeagueName(leagueDoc.data().name || "League");
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
            teamsMap[teamData.school] = {
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
              gameComplete: teamData.currentSeason?.gameComplete || false
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
    const team = allTeams[teamName];
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
      border: "2px solid #ffffff",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#f1f5f9",
      cursor: clickable ? "pointer" : "default",
      transition: "all 0.3s ease",
      flexShrink: 0,
      boxShadow: "0 2px 4px rgba(0, 0, 0, 0.1)",
      transform: "scale(1)",
      position: "relative"
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
                ? (team?.currentWeekPoints > 0 ? "#059669" : "#6b7280")
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
              border: "2px solid white",
              boxShadow: "0 1px 3px rgba(0, 0, 0, 0.3)"
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
                e.currentTarget.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.2)";
              }
            }}
            onMouseLeave={(e) => {
              if (clickable) {
                e.currentTarget.style.transform = "scale(1)";
                e.currentTarget.style.boxShadow = "0 2px 4px rgba(0, 0, 0, 0.1)";
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
              background: 'linear-gradient(135deg, #1e40af 0%, #0ea5e9 100%)'
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
              ? (team?.currentWeekPoints > 0 ? "#059669" : "#6b7280")
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
            border: "2px solid white",
            boxShadow: "0 1px 3px rgba(0, 0, 0, 0.3)"
          }}>
            {team?.gameComplete ? (team?.currentWeekPoints || 0) : "?"}
          </div>
        )}
        
        <div 
          style={{
            ...logoStyle,
            background: "linear-gradient(135deg, #1e40af 0%, #0ea5e9 100%)",
            color: "white",
            fontSize: size < 30 ? '10px' : '12px',
            fontWeight: '600'
          }}
          onClick={handleClick}
          onMouseEnter={(e) => {
            if (clickable) {
              e.currentTarget.style.transform = "scale(1.05)";
              e.currentTarget.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.2)";
            }
          }}
          onMouseLeave={(e) => {
            if (clickable) {
              e.currentTarget.style.transform = "scale(1)";
              e.currentTarget.style.boxShadow = "0 2px 4px rgba(0, 0, 0, 0.1)";
            }
          }}
          title={clickable ? `Click to view ${teamName} details` : teamName}
        >
          {teamName ? teamName.split(' ').map(word => word[0]).join('').slice(0, 3) : '?'}
        </div>
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
          backgroundColor: "rgba(0, 0, 0, 0.7)",
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
                backgroundColor: "white",
                borderRadius: "20px",
                boxShadow: "0 20px 40px rgba(0, 0, 0, 0.3)",
                display: "flex",
                flexDirection: "column",
                padding: "24px",
                background: team.colors?.primary 
                  ? `linear-gradient(135deg, ${team.colors.primary} 0%, ${team.colors.secondary || team.colors.primary} 100%)`
                  : "linear-gradient(135deg, #1e40af 0%, #0ea5e9 100%)"
              }}
            >
              {/* Team Header */}
              <div style={{ textAlign: "center", marginBottom: "20px" }}>
                <div style={{
                  width: "60px",
                  height: "60px",
                  borderRadius: "50%",
                  overflow: "hidden",
                  border: "3px solid white",
                  margin: "0 auto 12px",
                  backgroundColor: "white"
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
                      color: "#1e40af"
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
                backgroundColor: "white",
                borderRadius: "20px",
                boxShadow: "0 20px 40px rgba(0, 0, 0, 0.3)",
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
          style={{
            position: "absolute",
            top: "20px",
            right: "20px",
            width: "40px",
            height: "40px",
            borderRadius: "50%",
            backgroundColor: "white",
            border: "none",
            fontSize: "20px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3)",
            zIndex: 1001
          }}
        >
          ×
        </button>
      </div>
    );
  };

  if (loading) {
    return (
      <div style={{ 
        padding: "20px", 
        textAlign: "center",
        color: "#64748b",
        fontSize: "16px"
      }}>
        Loading league standings...
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
    <div style={{ backgroundColor: "#f8fafc", minHeight: "100vh" }}>
      <LeagueNavBar />

      {/* Header */}
      <div style={{ 
        padding: "20px 16px 16px 16px",
        background: "linear-gradient(135deg, #1e40af 0%, #0ea5e9 100%)",
        color: "white"
      }}>
        <h1 style={{ 
          fontSize: "24px", 
          fontWeight: "700", 
          margin: "0 0 8px 0",
          textAlign: "center"
        }}>
          {leagueName ? `${leagueName} Standings` : "League Standings"}
        </h1>
        <p style={{
          fontSize: "14px",
          opacity: "0.9",
          textAlign: "center",
          margin: 0
        }}>
          {sortedMembers.length} managers competing
        </p>
      </div>

      {/* Standings Cards */}
      <div style={{ padding: "16px" }}>
        {sortedMembers.length === 0 ? (
          <div style={{
            backgroundColor: "white",
            borderRadius: "16px",
            padding: "40px 20px",
            textAlign: "center",
            boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)"
          }}>
            <p style={{ color: "#64748b", fontSize: "16px" }}>
              No members found in this league.
            </p>
          </div>
        ) : (
          sortedMembers.map((member, idx) => {
            const lineup = member.lineup || {};
            const starters = Array.isArray(lineup.starters) ? lineup.starters : [];
            const bench = Array.isArray(lineup.bench) ? lineup.bench : [];
            const allTeamsOwned = [...starters, ...bench].filter(team => 
              typeof team === 'string' && team.trim() !== ''
            );

            // Determine rank styling
            const getRankStyle = (position) => {
              if (position === 0) return { backgroundColor: "#ffd700", color: "#92400e" }; // Gold
              if (position === 1) return { backgroundColor: "#e5e7eb", color: "#374151" }; // Silver
              if (position === 2) return { backgroundColor: "#d97706", color: "white" }; // Bronze
              return { backgroundColor: "#64748b", color: "white" }; // Default
            };

            const rankStyle = getRankStyle(idx);

            return (
              <div key={member.id} style={{
                backgroundColor: "white",
                borderRadius: "12px",
                padding: "16px",
                marginBottom: "8px",
                boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
                border: "1px solid #e2e8f0"
              }}>
                {/* Header: Rank, Team Name, Points */}
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  marginBottom: "12px"
                }}>
                  {/* Rank Badge */}
                  <div style={{
                    width: "32px",
                    height: "32px",
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: "700",
                    fontSize: "14px",
                    marginRight: "12px",
                    flexShrink: 0,
                    ...rankStyle
                  }}>
                    {idx + 1}
                  </div>

                  {/* Team Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h3 style={{
                      fontSize: "18px",
                      fontWeight: "600",
                      color: "#1e293b",
                      margin: "0 0 2px 0",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap"
                    }}>
                      {member.teamName || "Unnamed Team"}
                    </h3>
                    <p style={{
                      fontSize: "14px",
                      color: "#64748b",
                      margin: 0
                    }}>
                      {member.firstName || "Unknown Manager"}
                    </p>
                  </div>

                  {/* Points & Weekly Score */}
                  <div style={{ textAlign: "right" }}>
                    <div style={{
                      fontSize: "18px",
                      fontWeight: "700",
                      color: "#1e40af",
                      lineHeight: 1
                    }}>
                      {member.points ?? 0}
                    </div>
                    <div style={{
                      fontSize: "11px",
                      color: "#64748b",
                      marginTop: "2px"
                    }}>
                      {member.weeklyPoints ?? 0} in {currentWeek}
                    </div>
                    <div style={{
                      fontSize: "11px",
                      color: "#64748b",
                      marginTop: "1px"
                    }}>
                      {member.freeAgentMoves ?? 0} FA moves
                    </div>
                  </div>
                </div>

                {/* Team Roster with Starters/Bench Separation */}
                <div style={{
                  display: "flex",
                  gap: "12px",
                  alignItems: "flex-start"
                }}>
                  {/* Starters Section */}
                  <div style={{ flex: 1 }}>
                    <div style={{
                      fontSize: "10px",
                      fontWeight: "600",
                      color: "#059669",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                      marginBottom: "6px",
                      textAlign: "left"
                    }}>
                      Starters
                    </div>
                    <div style={{
                      display: "flex",
                      gap: "3px",
                      justifyContent: "flex-start",
                      flexWrap: "wrap"
                    }}>
                      {/* Starters */}
                      {starters.slice(0, 5).map((teamName, teamIdx) => (
                        <TeamLogo 
                          key={`starter-${teamIdx}`}
                          teamName={teamName} 
                          size={32} 
                          clickable={true} 
                        />
                      ))}
                      
                      {/* Empty starter slots */}
                      {Array.from({ length: Math.max(0, 5 - starters.length) }).map((_, emptyIdx) => (
                        <div key={`empty-starter-${emptyIdx}`} style={{
                          width: "32px",
                          height: "32px",
                          borderRadius: "50%",
                          border: "2px dashed #059669",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: "#f0fdf4",
                          flexShrink: 0,
                          boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)"
                        }}>
                          <div style={{
                            width: "6px",
                            height: "6px",
                            borderRadius: "50%",
                            backgroundColor: "#059669"
                          }} />
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  {/* Bench Section */}
                  <div style={{ flex: "0 0 auto", minWidth: "60px" }}>
                    <div style={{
                      fontSize: "10px",
                      fontWeight: "600",
                      color: "#d97706",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                      marginBottom: "6px",
                      textAlign: "left"
                    }}>
                      Bench
                    </div>
                    <div style={{
                      display: "flex",
                      gap: "3px",
                      justifyContent: "flex-start"
                    }}>
                      {/* Bench */}
                      {bench.slice(0, 2).map((teamName, teamIdx) => (
                        <TeamLogo 
                          key={`bench-${teamIdx}`}
                          teamName={teamName} 
                          size={32} 
                          clickable={true} 
                        />
                      ))}
                      
                      {/* Empty bench slots */}
                      {Array.from({ length: Math.max(0, 2 - bench.length) }).map((_, emptyIdx) => (
                        <div key={`empty-bench-${emptyIdx}`} style={{
                          width: "32px",
                          height: "32px",
                          borderRadius: "50%",
                          border: "2px dashed #d97706",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: "#fffbeb",
                          flexShrink: 0,
                          boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)"
                        }}>
                          <div style={{
                            width: "6px",
                            height: "6px",
                            borderRadius: "50%",
                            backgroundColor: "#d97706"
                          }} />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Smack Talk Speech Bubble - Only show if exists */}
                {member.smackTalk && member.smackTalk.trim() && (
                  <div style={{
                    marginTop: "10px",
                    position: "relative",
                    display: "flex",
                    justifyContent: "flex-start"
                  }}>
                    <div style={{
                      backgroundColor: "#1e40af",
                      color: "white",
                      padding: "8px 12px",
                      borderRadius: "16px",
                      fontSize: "12px",
                      fontWeight: "500",
                      maxWidth: "80%",
                      wordWrap: "break-word",
                      position: "relative",
                      boxShadow: "0 2px 4px rgba(30, 64, 175, 0.3)"
                    }}>
                      💬 {member.smackTalk}
                      {/* Speech bubble tail */}
                      <div style={{
                        position: "absolute",
                        bottom: "-6px",
                        left: "16px",
                        width: 0,
                        height: 0,
                        borderLeft: "6px solid transparent",
                        borderRight: "6px solid transparent",
                        borderTop: "6px solid #1e40af"
                      }} />
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Team Card Modal */}
      {selectedTeam && (
        <TeamCardModal 
          team={selectedTeam} 
          onClose={() => setSelectedTeam(null)} 
        />
      )}

      {/* Bottom spacing for navigation */}
      <div style={{ height: "80px" }} />
    </div>
  );
}

export default MyLeague;