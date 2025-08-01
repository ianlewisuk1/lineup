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
import LeagueNavBar from "../components/LeagueNavBar";

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

  useEffect(() => {
    const fetchLineup = async () => {
      const currentUser = auth.currentUser;
      if (!currentUser) return;

      const memberRef = doc(db, "leagues", leagueId, "members", currentUser.uid);
      const memberSnap = await getDoc(memberRef);
      const memberData = memberSnap.data();

      const starterList = memberData?.lineup?.starters || [];
      const benchList = memberData?.lineup?.bench || [];

      setTeamName(memberData?.teamName || "Unnamed Squad");
      setSmackTalk(memberData?.smackTalk || "");

      const teamsSnap = await getDocs(collection(db, "teams"));
      const teamsMap = {};
      teamsSnap.forEach(doc => {
        const teamData = doc.data();
        if (teamData.school) {
          teamsMap[teamData.school] = {
            id: doc.id,
            ...teamData,
            logo: teamData.logos1 || teamData.logos2 || null,
            currentWeekPoints: teamData.currentSeason?.currentWeekPoints || null,
            gameComplete: teamData.currentSeason?.gameComplete || false,
            color: teamData.color || null
          };
        }
      });
      setAllTeams(teamsMap);

      const startersResolved = starterList.map(name => teamsMap[name] || null);
      const benchResolved = benchList.map(name => teamsMap[name] || null);

      setStarters(startersResolved);
      setBench(benchResolved);
      setLoading(false);
    };

    fetchLineup();
  }, [leagueId]);

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

    const memberRef = doc(db, "leagues", leagueId, "members", currentUser.uid);
    updateDoc(memberRef, {
      "lineup.starters": newStarters.map(t => t?.school || null),
      "lineup.bench": newBench.map(t => t?.school || null)
    });
  };

  const moveToStarters = (benchTeam, benchIndex) => {
    // Find first empty starter slot
    const emptyStarterIndex = starters.findIndex(t => t === null);
    if (emptyStarterIndex === -1) return; // No empty slots

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
      "lineup.starters": newStarters.map(t => t?.school || null),
      "lineup.bench": newBench.map(t => t?.school || null)
    });
  };

  const moveToBench = (starterTeam, starterIndex) => {
    // Find first empty bench slot
    const emptyBenchIndex = bench.findIndex(t => t === null);
    if (emptyBenchIndex === -1) return; // No empty slots

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
      "lineup.starters": newStarters.map(t => t?.school || null),
      "lineup.bench": newBench.map(t => t?.school || null)
    });
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
      alert("✅ Smack talk updated!");
    } catch (error) {
      console.error("Error saving smack talk:", error);
      alert("Failed to save smack talk. Please try again.");
    } finally {
      setSmackTalkSaving(false);
    }
  };

  const formatNextGame = (season) => {
    if (!season?.nextOpponent) return "—";
    const isHome = season.nextGameIsHome;
    const spread = season.nextOpponentSpread ?? "TBD";
    const prefix = isHome === false ? "@" : isHome === true ? "vs" : "?";
    return `${prefix} ${season.nextOpponent} (${spread})`;
  };

  // Team logo component
  const TeamCard = ({ team, showBadge = false }) => {
    const [expanded, setExpanded] = useState(false);

    if (!team) return null;

    const toggleExpanded = () => setExpanded((prev) => !prev);

    return (
      <div style={{
        flex: 1,
        padding: expanded ? "16px" : "12px",
        borderRadius: "8px",
        backgroundColor: "white",
        border: "1px solid rgba(0, 0, 0, 0.1)",
        position: "relative",
        boxShadow: "0 2px 4px rgba(0, 0, 0, 0.1)",
        transition: "all 0.2s ease"
      }}>
        {/* Weekly Points Badge */}
        {showBadge && (
          <div style={{
            position: "absolute",
            top: "12px",
            right: "12px",
            backgroundColor: team?.gameComplete 
              ? (team?.currentWeekPoints > 0 ? "#059669" : "#6b7280")
              : "#f59e0b",
            color: "white",
            borderRadius: "6px",
            padding: "4px 8px",
            fontSize: "12px",
            fontWeight: "700",
            boxShadow: "0 2px 4px rgba(0, 0, 0, 0.2)"
          }}>
            {team?.gameComplete ? (team?.currentWeekPoints || 0) : "?"} pts
          </div>
        )}

        {/* Main Team Info */}
        <div>
          <strong 
            onClick={() => handleTeamClick(team.school)}
            style={{ 
              cursor: "pointer", 
              color: "#1e293b", 
              textDecoration: "underline",
              fontSize: "18px",
              fontWeight: "700"
            }}
          >
            {team.school}
          </strong>
          <div style={{ color: "#64748b", fontSize: "13px", marginTop: "2px" }}>
            {team.conference}
          </div>
        </div>

        {/* Next Game */}
        <div style={{
          marginTop: "10px",
          padding: "6px 10px",
          backgroundColor: "#f8fafc",
          borderRadius: "6px",
          fontSize: "12px"
        }}>
          <span style={{ color: "#64748b", fontWeight: "500" }}>Next: </span>
          <span style={{ color: "#1e293b", fontWeight: "600" }}>
            {formatNextGame(team.currentSeason)}
          </span>
        </div>

        {/* Expanded Details */}
        {expanded && (
          <div style={{ 
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "8px", 
            marginTop: "10px",
            fontSize: "12px",
            paddingTop: "8px",
            borderTop: "1px solid #e2e8f0"
          }}>
            <div>
              <span style={{ color: "#64748b" }}>Record: </span>
              <span style={{ color: "#1e293b", fontWeight: "600" }}>
                {team.currentSeason?.record || "0-0"}
              </span>
            </div>
            <div>
              <span style={{ color: "#64748b" }}>ATS: </span>
              <span style={{ color: "#1e293b", fontWeight: "600" }}>
                {team.currentSeason?.atsRecord || "0-0"}
              </span>
            </div>
            <div>
              <span style={{ color: "#64748b" }}>Conf: </span>
              <span style={{ color: "#1e293b", fontWeight: "600" }}>
                {team.currentSeason?.confRecord || "0-0"}
              </span>
            </div>
            <div>
              <span style={{ color: "#64748b" }}>Points: </span>
              <span style={{ color: "#059669", fontWeight: "700" }}>
                {team.currentSeason?.gamePoints ?? 0}
              </span>
            </div>
          </div>
        )}

        {/* Toggle Button */}
        <button
          onClick={toggleExpanded}
          style={{
            position: "absolute",
            bottom: "8px",
            right: "8px",
            backgroundColor: "#e5e7eb",
            border: "none",
            borderRadius: "50%",
            width: "24px",
            height: "24px",
            fontSize: "14px",
            cursor: "pointer"
          }}
        >
          {expanded ? "▲" : "▼"}
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
        Loading your lineup...
      </div>
    );
  }

  const hasEmptyStarterSlots = starters.some(t => t === null);
  const hasEmptyBenchSlots = bench.some(t => t === null);

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
          {teamName}
        </h1>
        <p style={{
          fontSize: "14px",
          opacity: "0.9",
          textAlign: "center",
          margin: 0
        }}>
          My Lineup
        </p>
      </div>

      <div style={{ padding: "16px" }}>
        {/* Smack Talk Section */}
        <div style={{
          backgroundColor: "white",
          borderRadius: "16px",
          padding: "20px",
          marginBottom: "16px",
          boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
          border: "1px solid #e2e8f0"
        }}>
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "12px"
          }}>
            <h3 style={{
              fontSize: "18px",
              fontWeight: "600",
              color: "#1e293b",
              margin: 0
            }}>
              💬 Smack Talk
            </h3>
            {!isEditingSmackTalk && (
              <button
                onClick={() => setIsEditingSmackTalk(true)}
                style={{
                  backgroundColor: "#1e40af",
                  color: "white",
                  border: "none",
                  padding: "6px 12px",
                  borderRadius: "8px",
                  fontSize: "12px",
                  fontWeight: "500",
                  cursor: "pointer"
                }}
              >
                Edit
              </button>
            )}
          </div>

          {isEditingSmackTalk ? (
            <div>
              <textarea
                value={smackTalk}
                onChange={(e) => setSmackTalk(e.target.value.slice(0, 80))}
                placeholder="Say something to intimidate your opponents... (max 80 chars)"
                style={{
                  width: "100%",
                  minHeight: "60px",
                  padding: "12px",
                  border: "2px solid #e5e7eb",
                  borderRadius: "12px",
                  fontSize: "14px",
                  fontFamily: "inherit",
                  resize: "none",
                  boxSizing: "border-box"
                }}
                onFocus={(e) => e.target.style.borderColor = "#1e40af"}
                onBlur={(e) => e.target.style.borderColor = "#e5e7eb"}
              />
              <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: "8px"
              }}>
                <span style={{
                  fontSize: "12px",
                  color: smackTalk.length > 70 ? "#dc2626" : "#64748b"
                }}>
                  {smackTalk.length}/80 characters
                </span>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    onClick={() => {
                      setIsEditingSmackTalk(false);
                    }}
                    style={{
                      backgroundColor: "#6b7280",
                      color: "white",
                      border: "none",
                      padding: "8px 16px",
                      borderRadius: "8px",
                      fontSize: "14px",
                      cursor: "pointer"
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveSmackTalk}
                    disabled={smackTalkSaving}
                    style={{
                      backgroundColor: smackTalkSaving ? "#94a3b8" : "#059669",
                      color: "white",
                      border: "none",
                      padding: "8px 16px",
                      borderRadius: "8px",
                      fontSize: "14px",
                      cursor: smackTalkSaving ? "not-allowed" : "pointer"
                    }}
                  >
                    {smackTalkSaving ? "Saving..." : "Save"}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div>
              {smackTalk.trim() ? (
                <div style={{
                  backgroundColor: "#1e40af",
                  color: "white",
                  padding: "12px 16px",
                  borderRadius: "16px",
                  fontSize: "14px",
                  fontWeight: "500",
                  position: "relative",
                  display: "inline-block",
                  maxWidth: "100%",
                  wordWrap: "break-word"
                }}>
                  {smackTalk}
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
              ) : (
                <p style={{
                  color: "#64748b",
                  fontSize: "14px",
                  margin: 0,
                  fontStyle: "italic"
                }}>
                  No smack talk set. Click Edit to add some trash talk for your opponents to see!
                </p>
              )}
            </div>
          )}
        </div>

        {/* Starters Section */}
        <div style={{
          backgroundColor: "white",
          borderRadius: "16px",
          padding: "20px",
          marginBottom: "16px",
          boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
          border: "1px solid #e2e8f0"
        }}>
          <h3 style={{
            fontSize: "18px",
            fontWeight: "600",
            color: "#1e293b",
            margin: "0 0 16px 0"
          }}>
            🏈 Starters (5)
          </h3>
          
          {Array.from({ length: 5 }).map((_, idx) => {
            const team = starters[idx];
            return (
              <div
                key={idx}
                style={{
                  padding: "16px",
                  marginBottom: idx < 4 ? "8px" : 0,
                  borderRadius: "12px",
                  backgroundColor: team?.color || "#f8fafc",
                  border: team ? "1px solid #d1fae5" : "2px dashed #059669",
                  position: "relative",
                  minHeight: "100px",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "16px"
                }}
              >
                {team ? (
                  <div style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "12px",
                    width: "100%"
                  }}>
                    <TeamCard team={team} showBadge={true} />
                    
                    <div style={{ 
                      display: "flex", 
                      flexDirection: "column", 
                      gap: "6px",
                      alignItems: "flex-end",
                      flexShrink: 0
                    }}>
                      {hasEmptyBenchSlots && (
                        <button 
                          onClick={() => moveToBench(team, idx)}
                          style={{
                            backgroundColor: "#d97706",
                            color: "white",
                            border: "none",
                            padding: "8px 12px",
                            borderRadius: "6px",
                            fontSize: "12px",
                            cursor: "pointer",
                            fontWeight: "500"
                          }}
                        >
                          → Bench
                        </button>
                      )}
                      
                      <Link
                        to={`/cut/${leagueId}/${encodeURIComponent(team.school)}`}
                        style={{
                          backgroundColor: "#dc2626",
                          color: "white",
                          padding: "8px 12px",
                          textDecoration: "none",
                          borderRadius: "6px",
                          fontSize: "12px",
                          fontWeight: "500"
                        }}
                      >
                        ❌ Cut
                      </Link>
                    </div>
                  </div>
                ) : (
                  <div style={{ 
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "100%",
                    gap: "12px"
                  }}>
                    <Link
                      to={`/${leagueId}/free-agents`}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: "48px",
                        height: "48px",
                        backgroundColor: "#059669",
                        color: "white",
                        borderRadius: "50%",
                        textDecoration: "none",
                        fontSize: "24px",
                        fontWeight: "700",
                        boxShadow: "0 2px 8px rgba(5, 150, 105, 0.3)",
                        transition: "all 0.2s ease"
                      }}
                    >
                      +
                    </Link>
                    <div style={{
                      color: "#059669",
                      fontSize: "16px",
                      fontWeight: "600"
                    }}>
                      Add Team from Free Agents
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Bench Section */}
        <div style={{
          backgroundColor: "white",
          borderRadius: "16px",
          padding: "20px",
          marginBottom: "16px",
          boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
          border: "1px solid #e2e8f0"
        }}>
          <h3 style={{
            fontSize: "18px",
            fontWeight: "600",
            color: "#1e293b",
            margin: "0 0 16px 0"
          }}>
            🪑 Bench (2)
          </h3>
          
          {Array.from({ length: 2 }).map((_, idx) => {
            const team = bench[idx];
            return (
              <div
                key={idx}
                style={{
                  padding: "16px",
                  marginBottom: idx < 1 ? "8px" : 0,
                  borderRadius: "12px",
                  backgroundColor: team?.color || "#f8fafc",
                  border: team ? "1px solid #fed7aa" : "2px dashed #d97706",
                  position: "relative",
                  minHeight: "100px",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "16px"
                }}
              >
                {team ? (
                  <div style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "12px",
                    width: "100%"
                  }}>
                    <TeamCard team={team} showBadge={true} />
                    
                    <div style={{ 
                      display: "flex", 
                      flexDirection: "column", 
                      gap: "6px",
                      alignItems: "flex-end",
                      flexShrink: 0
                    }}>
                      {hasEmptyStarterSlots && (
                        <button 
                          onClick={() => moveToStarters(team, idx)}
                          style={{
                            backgroundColor: "#059669",
                            color: "white",
                            border: "none",
                            padding: "8px 12px",
                            borderRadius: "6px",
                            fontSize: "12px",
                            cursor: "pointer",
                            fontWeight: "500"
                          }}
                        >
                          → Starters
                        </button>
                      )}
                      
                      <Link
                        to={`/cut/${leagueId}/${encodeURIComponent(team.school)}`}
                        style={{
                          backgroundColor: "#dc2626",
                          color: "white",
                          padding: "8px 12px",
                          textDecoration: "none",
                          borderRadius: "6px",
                          fontSize: "12px",
                          fontWeight: "500"
                        }}
                      >
                        ❌ Cut
                      </Link>
                    </div>
                  </div>
                ) : (
                  <div style={{ 
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "100%",
                    gap: "12px"
                  }}>
                    <Link
                      to={`/${leagueId}/free-agents`}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: "48px",
                        height: "48px",
                        backgroundColor: "#d97706",
                        color: "white",
                        borderRadius: "50%",
                        textDecoration: "none",
                        fontSize: "24px",
                        fontWeight: "700",
                        boxShadow: "0 2px 8px rgba(217, 119, 6, 0.3)",
                        transition: "all 0.2s ease"
                      }}
                    >
                      +
                    </Link>
                    <div style={{
                      color: "#d97706",
                      fontSize: "16px",
                      fontWeight: "600"
                    }}>
                      Add Team from Free Agents
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom spacing for navigation */}
      <div style={{ height: "80px" }} />
    </div>
  );
}

export default MyLineup;