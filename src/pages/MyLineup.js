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
  const [swapTarget, setSwapTarget] = useState(null);
  const [smackTalk, setSmackTalk] = useState("");
  const [isEditingSmackTalk, setIsEditingSmackTalk] = useState(false);
  const [smackTalkSaving, setSmackTalkSaving] = useState(false);

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
      const allTeams = {};
      teamsSnap.forEach(doc => {
        allTeams[doc.data().school] = {
          id: doc.id,
          ...doc.data()
        };
      });

      const startersResolved = starterList.map(name => allTeams[name] || null);
      const benchResolved = benchList.map(name => allTeams[name] || null);

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
    setSwapTarget(null);

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
          marginBottom: "20px",
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
                      // Reset to original value if they cancel
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
          marginBottom: "20px",
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
                  borderBottom: idx < 4 ? "1px solid #f1f5f9" : "none",
                  backgroundColor: "#f0fdf4",
                  marginBottom: idx < 4 ? "12px" : 0,
                  borderRadius: "12px",
                  position: "relative",
                  minHeight: "80px"
                }}
              >
                {team ? (
                  <>
                    <div style={{ paddingRight: "100px" }}>
                      <strong 
                        onClick={() => handleTeamClick(team.school)}
                        style={{ 
                          cursor: "pointer", 
                          color: "#1e40af", 
                          textDecoration: "underline",
                          fontSize: "16px",
                          fontWeight: "600"
                        }}
                      >
                        {team.school}
                      </strong>
                      <span style={{ color: "#64748b", marginLeft: "8px" }}>
                        ({team.conference})
                      </span>
                      <div style={{ fontSize: "14px", color: "#374151", marginTop: "4px" }}>
                        Record: {team.currentSeason?.record} | Conf: {team.currentSeason?.confRecord}
                      </div>
                      <div style={{ fontSize: "14px", color: "#374151" }}>
                        Next: {formatNextGame(team.currentSeason)}
                      </div>
                      <div style={{ fontSize: "14px", color: "#059669", fontWeight: "600", marginTop: "2px" }}>
                        Points: {team.currentSeason?.gamePoints ?? 0}
                      </div>
                    </div>
                    
                    <div style={{ position: "absolute", right: "16px", top: "16px", display: "flex", flexDirection: "column", gap: "8px" }}>
                      <button 
                        onClick={() => setSwapTarget(swapTarget === idx ? null : idx)}
                        style={{
                          backgroundColor: "#0ea5e9",
                          color: "white",
                          border: "none",
                          padding: "6px 12px",
                          borderRadius: "6px",
                          fontSize: "12px",
                          cursor: "pointer",
                          minWidth: "60px"
                        }}
                      >
                        {swapTarget === idx ? "Cancel" : "↕️ Swap"}
                      </button>
                      <Link
                        to={`/cut/${leagueId}/${encodeURIComponent(team.school)}`}
                        style={{
                          backgroundColor: "#dc2626",
                          color: "white",
                          border: "none",
                          padding: "6px 12px",
                          textDecoration: "none",
                          borderRadius: "6px",
                          fontSize: "12px",
                          textAlign: "center",
                          minWidth: "60px"
                        }}
                      >
                        ❌ Cut
                      </Link>
                    </div>
                    
                    {swapTarget === idx && (
                      <div style={{ 
                        marginTop: "12px", 
                        padding: "12px", 
                        backgroundColor: "#ffffff",
                        borderRadius: "8px",
                        border: "1px solid #e2e8f0"
                      }}>
                        <strong style={{ fontSize: "14px", color: "#374151" }}>Select a bench team to swap with:</strong>
                        <div style={{ marginTop: "8px", display: "flex", flexDirection: "column", gap: "4px" }}>
                          {bench.filter(Boolean).map(benchTeam => (
                            <button 
                              key={benchTeam.id}
                              onClick={() => handleSwap(idx, benchTeam)}
                              style={{
                                backgroundColor: "#f97316",
                                color: "white",
                                border: "none",
                                padding: "8px 12px",
                                borderRadius: "6px",
                                fontSize: "14px",
                                cursor: "pointer",
                                textAlign: "left"
                              }}
                            >
                              {benchTeam.school} ({benchTeam.conference})
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ 
                    color: "#9ca3af", 
                    fontStyle: "italic",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    height: "60px",
                    fontSize: "14px"
                  }}>
                    Empty Starter Slot
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
          marginBottom: "20px",
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
                  borderBottom: idx < 1 ? "1px solid #f1f5f9" : "none",
                  backgroundColor: "#fffbeb",
                  marginBottom: idx < 1 ? "12px" : 0,
                  borderRadius: "12px",
                  minHeight: "80px",
                  position: "relative"
                }}
              >
                {team ? (
                  <>
                    <div style={{ paddingRight: "80px" }}>
                      <strong 
                        onClick={() => handleTeamClick(team.school)}
                        style={{ 
                          cursor: "pointer", 
                          color: "#1e40af", 
                          textDecoration: "underline",
                          fontSize: "16px",
                          fontWeight: "600"
                        }}
                      >
                        {team.school}
                      </strong>
                      <span style={{ color: "#64748b", marginLeft: "8px" }}>
                        ({team.conference})
                      </span>
                      <div style={{ fontSize: "14px", color: "#374151", marginTop: "4px" }}>
                        Record: {team.currentSeason?.record} | Conf: {team.currentSeason?.confRecord}
                      </div>
                      <div style={{ fontSize: "14px", color: "#374151" }}>
                        Next: {formatNextGame(team.currentSeason)}
                      </div>
                      <div style={{ fontSize: "14px", color: "#059669", fontWeight: "600", marginTop: "2px" }}>
                        Points: {team.currentSeason?.gamePoints ?? 0}
                      </div>
                    </div>
                    
                    <Link
                      to={`/cut/${leagueId}/${encodeURIComponent(team.school)}`}
                      style={{
                        position: "absolute",
                        right: "16px",
                        top: "16px",
                        backgroundColor: "#dc2626",
                        color: "white",
                        border: "none",
                        padding: "6px 12px",
                        cursor: "pointer",
                        textDecoration: "none",
                        borderRadius: "6px",
                        fontSize: "12px",
                        textAlign: "center"
                      }}
                    >
                      ❌ Cut
                    </Link>
                  </>
                ) : (
                  <div style={{ 
                    color: "#9ca3af", 
                    fontStyle: "italic",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    height: "60px",
                    fontSize: "14px"
                  }}>
                    Empty Bench Slot
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