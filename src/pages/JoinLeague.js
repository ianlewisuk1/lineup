import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { db, auth } from "../firebase/firebase";
import {
  doc,
  getDoc,
  updateDoc,
  setDoc,
  arrayUnion
} from "firebase/firestore";
import { Users, ArrowLeft, UserPlus, Trophy, AlertCircle } from "lucide-react";

function JoinLeague() {
  const navigate = useNavigate();

  const [leagueId, setLeagueId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [teamName, setTeamName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleJoinLeague = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const user = auth.currentUser;
      if (!user) throw new Error("User not logged in");

      if (!displayName.trim() || !teamName.trim()) {
        setError("Please enter a username and team name.");
        setLoading(false);
        return;
      }

      if (displayName.length > 15 || teamName.length > 15) {
        setError("Username and team name must be 15 characters or fewer.");
        setLoading(false);
        return;
      }

      const leagueRef = doc(db, "leagues", leagueId);
      const leagueSnap = await getDoc(leagueRef);
      if (!leagueSnap.exists()) {
        setError("League not found. Please check the League ID.");
        setLoading(false);
        return;
      }

      // ✅ Guard against joining the same league twice
      const memberRef = doc(db, "leagues", leagueId, "members", user.uid);
      const memberSnap = await getDoc(memberRef);
      if (memberSnap.exists()) {
        setError("You are already a member of this league.");
        setLoading(false);
        return;
      }

      // Add user to league's members array
      await updateDoc(leagueRef, {
        members: arrayUnion(user.uid)
      });

      // Add leagueId to user's profile
      await updateDoc(doc(db, "users", user.uid), {
        leagueIds: arrayUnion(leagueId)
      });

      // Create member document with consistent structure
      await setDoc(memberRef, {
        displayName: displayName.trim(),
        teamName: teamName.trim(),
        email: user.email || "",
        joinedAt: new Date(),
        lineup: {
          starters: [],
          bench: [],
          currentRoster: []
        },
        points: 0,
        weeklyPoints: 0,           // Current week's points (number)
        weeklyPointsHistory: {},   // Historical weekly points (object)
        freeAgentMoves: 0          // Number of FA moves made
      }, { merge: true });

      setSuccess("Successfully joined the league!");
      setTimeout(() => {
        navigate(`/${leagueId}/draft-room`);
      }, 1500);
    } catch (err) {
      setError("Error: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ backgroundColor: "#f8fafc", minHeight: "100vh", width: "100%", overflowX: "hidden" }}>
      {/* Header */}
      <div style={{ 
        padding: "20px 16px 16px 16px",
        background: "linear-gradient(135deg, #059669 0%, #10b981 100%)",
        color: "white"
      }}>
        <div style={{ maxWidth: "100%", width: "100%" }}>
          <button 
            onClick={() => navigate(-1)} 
            style={{ 
              display: "flex",
              alignItems: "center",
              gap: "8px",
              marginBottom: "16px", 
              padding: "8px 16px",
              backgroundColor: "rgba(255,255,255,0.2)",
              color: "white",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
              fontSize: "14px",
              fontWeight: "500",
              transition: "all 0.2s ease"
            }}
            onMouseEnter={(e) => e.target.style.backgroundColor = "rgba(255,255,255,0.3)"}
            onMouseLeave={(e) => e.target.style.backgroundColor = "rgba(255,255,255,0.2)"}
          >
            <ArrowLeft size={16} />
            Back
          </button>

          <h1 style={{ 
            fontSize: "clamp(24px, 5vw, 32px)", 
            fontWeight: "700", 
            margin: "0 0 8px 0",
            display: "flex",
            alignItems: "center",
            gap: "12px",
            flexWrap: "wrap"
          }}>
            <Users size={32} />
            Join a League
          </h1>
          
          <p style={{
            fontSize: "clamp(14px, 3vw, 18px)",
            opacity: "0.9",
            margin: 0
          }}>
            Enter your league details to join the competition
          </p>
        </div>
      </div>

      <div style={{ padding: "20px 16px", width: "100%", boxSizing: "border-box" }}>
        <div style={{ maxWidth: "500px", margin: "0 auto" }}>
          {/* Success Message */}
          {success && (
            <div style={{ 
              padding: "16px", 
              backgroundColor: "#ecfdf5", 
              border: "2px solid #10b981", 
              borderRadius: "12px", 
              color: "#065f46",
              marginBottom: "24px",
              boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
              display: "flex",
              alignItems: "center",
              gap: "12px"
            }}>
              <Trophy size={20} />
              <div style={{ fontWeight: "600" }}>{success}</div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div style={{ 
              padding: "16px", 
              backgroundColor: "#fef2f2", 
              border: "2px solid #ef4444", 
              borderRadius: "12px", 
              color: "#991b1b",
              marginBottom: "24px",
              boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
              display: "flex",
              alignItems: "center",
              gap: "12px"
            }}>
              <AlertCircle size={20} />
              <div style={{ fontWeight: "600" }}>{error}</div>
            </div>
          )}

          {/* Main Form Card */}
          <div style={{
            backgroundColor: "white",
            borderRadius: "16px",
            padding: "32px",
            boxShadow: "0 4px 6px rgba(0,0,0,0.07)",
            border: "1px solid #e5e7eb"
          }}>
            <div style={{ textAlign: "center", marginBottom: "32px" }}>
              <div style={{
                width: "80px",
                height: "80px",
                borderRadius: "50%",
                backgroundColor: "#f0fdf4",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 16px auto",
                border: "3px solid #10b981"
              }}>
                <UserPlus size={40} style={{ color: "#059669" }} />
              </div>
              
              <h2 style={{ 
                fontSize: "24px", 
                fontWeight: "600", 
                color: "#1e293b",
                margin: "0 0 8px 0"
              }}>
                Ready to Join?
              </h2>
              <p style={{ 
                color: "#64748b", 
                fontSize: "16px",
                margin: 0,
                lineHeight: "1.5"
              }}>
                Fill out the form below to join your fantasy league
              </p>
            </div>

            <form onSubmit={handleJoinLeague} style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
              {/* League ID Input */}
              <div>
                <label style={{ 
                  display: "block", 
                  marginBottom: "8px", 
                  fontSize: "14px", 
                  fontWeight: "600",
                  color: "#374151"
                }}>
                  League ID *
                </label>
                <input
                  type="text"
                  placeholder="Enter the League ID you received"
                  value={leagueId}
                  onChange={(e) => setLeagueId(e.target.value)}
                  required
                  style={{
                    width: "100%",
                    padding: "16px",
                    border: "2px solid #e5e7eb",
                    borderRadius: "12px",
                    fontSize: "16px",
                    fontFamily: "inherit",
                    backgroundColor: "white",
                    transition: "all 0.2s ease",
                    boxSizing: "border-box"
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = "#059669";
                    e.target.style.boxShadow = "0 0 0 3px rgba(5, 150, 105, 0.1)";
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = "#e5e7eb";
                    e.target.style.boxShadow = "none";
                  }}
                />
                <p style={{ 
                  fontSize: "12px", 
                  color: "#64748b", 
                  margin: "6px 0 0 0" 
                }}>
                  Ask the league commissioner for this ID
                </p>
              </div>

              {/* Display Name Input */}
              <div>
                <label style={{ 
                  display: "block", 
                  marginBottom: "8px", 
                  fontSize: "14px", 
                  fontWeight: "600",
                  color: "#374151"
                }}>
                  Your Username *
                </label>
                <input
                  type="text"
                  placeholder="How others will see you"
                  value={displayName}
                  maxLength={15}
                  onChange={(e) => setDisplayName(e.target.value)}
                  required
                  style={{
                    width: "100%",
                    padding: "16px",
                    border: "2px solid #e5e7eb",
                    borderRadius: "12px",
                    fontSize: "16px",
                    fontFamily: "inherit",
                    backgroundColor: "white",
                    transition: "all 0.2s ease",
                    boxSizing: "border-box"
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = "#059669";
                    e.target.style.boxShadow = "0 0 0 3px rgba(5, 150, 105, 0.1)";
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = "#e5e7eb";
                    e.target.style.boxShadow = "none";
                  }}
                />
                <p style={{ 
                  fontSize: "12px", 
                  color: "#64748b", 
                  margin: "6px 0 0 0" 
                }}>
                  {displayName.length}/15 characters
                </p>
              </div>

              {/* Team Name Input */}
              <div>
                <label style={{ 
                  display: "block", 
                  marginBottom: "8px", 
                  fontSize: "14px", 
                  fontWeight: "600",
                  color: "#374151"
                }}>
                  Team Name *
                </label>
                <input
                  type="text"
                  placeholder="Name your fantasy team"
                  value={teamName}
                  maxLength={15}
                  onChange={(e) => setTeamName(e.target.value)}
                  required
                  style={{
                    width: "100%",
                    padding: "16px",
                    border: "2px solid #e5e7eb",
                    borderRadius: "12px",
                    fontSize: "16px",
                    fontFamily: "inherit",
                    backgroundColor: "white",
                    transition: "all 0.2s ease",
                    boxSizing: "border-box"
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = "#059669";
                    e.target.style.boxShadow = "0 0 0 3px rgba(5, 150, 105, 0.1)";
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = "#e5e7eb";
                    e.target.style.boxShadow = "none";
                  }}
                />
                <p style={{ 
                  fontSize: "12px", 
                  color: "#64748b", 
                  margin: "6px 0 0 0" 
                }}>
                  {teamName.length}/15 characters
                </p>
              </div>

              {/* Submit Button */}
              <button 
                type="submit" 
                disabled={loading || !leagueId.trim() || !displayName.trim() || !teamName.trim()}
                style={{
                  width: "100%",
                  padding: "16px",
                  backgroundColor: loading || !leagueId.trim() || !displayName.trim() || !teamName.trim() ? "#9ca3af" : "#059669",
                  color: "white",
                  border: "none",
                  borderRadius: "12px",
                  fontSize: "16px",
                  fontWeight: "600",
                  cursor: loading || !leagueId.trim() || !displayName.trim() || !teamName.trim() ? "not-allowed" : "pointer",
                  transition: "all 0.2s ease",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  marginTop: "8px"
                }}
                onMouseEnter={(e) => {
                  if (!loading && leagueId.trim() && displayName.trim() && teamName.trim()) {
                    e.target.style.backgroundColor = "#047857";
                    e.target.style.transform = "translateY(-1px)";
                    e.target.style.boxShadow = "0 4px 12px rgba(5, 150, 105, 0.3)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!loading && leagueId.trim() && displayName.trim() && teamName.trim()) {
                    e.target.style.backgroundColor = "#059669";
                    e.target.style.transform = "translateY(0px)";
                    e.target.style.boxShadow = "none";
                  }
                }}
              >
                {loading ? (
                  <>
                    <div style={{
                      width: "20px",
                      height: "20px",
                      border: "2px solid rgba(255,255,255,0.3)",
                      borderTop: "2px solid white",
                      borderRadius: "50%",
                      animation: "spin 1s linear infinite"
                    }} />
                    Joining League...
                  </>
                ) : (
                  <>
                    <UserPlus size={20} />
                    Join League
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Info Card */}
          <div style={{
            backgroundColor: "#f0f9ff",
            borderRadius: "12px",
            padding: "20px",
            marginTop: "24px",
            border: "1px solid #bae6fd"
          }}>
            <h3 style={{ 
              fontSize: "16px", 
              fontWeight: "600", 
              color: "#0369a1",
              margin: "0 0 12px 0",
              display: "flex",
              alignItems: "center",
              gap: "8px"
            }}>
              <AlertCircle size={18} />
              Need Help?
            </h3>
            <ul style={{ 
              color: "#0284c7", 
              fontSize: "14px",
              margin: 0,
              paddingLeft: "20px",
              lineHeight: "1.6"
            }}>
              <li>Ask your league commissioner for the League ID</li>
              <li>Choose a unique username that others will recognize</li>
              <li>Pick a creative team name - you can change it later</li>
              <li>Both username and team name are limited to 15 characters</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Bottom spacing */}
      <div style={{ height: "80px" }} />

      {/* Add spinning animation */}
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

export default JoinLeague;