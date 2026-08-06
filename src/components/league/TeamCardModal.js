import React, { useState, useEffect } from "react";
import { supabase } from "../../supabase/supabase";
import { SEASON_YEAR } from "../../utils/season";
import { getCurrentWeekNumber } from "../../utils/leagueUtils";
import { teamLogoUrl } from "../../utils/teamLogo";

const TeamCardModal = ({ team, onClose, currentWeek }) => {
  const [isFlipped, setIsFlipped] = useState(false);
  const [teamSchedule, setTeamSchedule] = useState([]);
  const [currentWeekGame, setCurrentWeekGame] = useState(null);
  const [loadingSchedule, setLoadingSchedule] = useState(true);

  useEffect(() => {
    const fetchTeamSchedule = async () => {
      if (!team?.name) return;

      try {
        setLoadingSchedule(true);
        const scheduleData = [];
        const currentWeekNum = getCurrentWeekNumber(currentWeek);

        // Fetch schedule for 2025
        const { data: gamesData } = await supabase.from("games").select("*").eq("year", SEASON_YEAR);

        for (const game of (gamesData || [])) {
          const weekNum = game.week;
          // Check if this team is playing in this game
          if (game.home_team === team.name || game.away_team === team.name) {
            scheduleData.push({
              ...game,
              homeTeam: game.home_team,
              awayTeam: game.away_team,
              week: parseInt(weekNum),
              gameId: game.id
            });
          }
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
  const currentWeekNum = getCurrentWeekNumber(currentWeek);

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
                backdropFilter: "blur(10px)",
                position: "relative"
              }}>
                {/* Initials sit underneath and show through when the logo file is missing */}
                <div style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "16px",
                  fontWeight: "700",
                  color: "white"
                }}>
                  {team.name ? team.name.split(' ').map(word => word[0]).join('').slice(0, 3) : '?'}
                </div>
                <img
                  src={teamLogoUrl(team.name)}
                  alt={team.name}
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    objectFit: "cover"
                  }}
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
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
                    const getGameResult = (g, tName) => {
                      const isHome = g.homeTeam === tName;

                      // Use homeScore and awayScore (correct field names)
                      const teamScore = isHome ? g.homeScore : g.awayScore;
                      const opponentScore = isHome ? g.awayScore : g.homeScore;

                      // Only show result if game is complete AND we have valid scores
                      if (g.gameComplete &&
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

                    const gameResult = getGameResult(game, team.name);

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

export default TeamCardModal;
