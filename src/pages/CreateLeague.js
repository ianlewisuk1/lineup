import React, { useState, useEffect } from "react";
import { db, auth } from "../firebase/firebase";
import {
  collection,
  addDoc,
  doc,
  setDoc,
  updateDoc,
  arrayUnion,
  getDoc
} from "firebase/firestore";
import { useNavigate } from "react-router-dom";

function CreateLeague() {
  const navigate = useNavigate();

  const [leagueName, setLeagueName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [teamName, setTeamName] = useState("");
  const [maxManagers, setMaxManagers] = useState(8);
  const [draftType, setDraftType] = useState("manual");
  const [draftOrderType, setDraftOrderType] = useState("random");
  const [draftDate, setDraftDate] = useState("");
  const [draftTime, setDraftTime] = useState("");
  const [timePerPick, setTimePerPick] = useState("2");
  const [loading, setLoading] = useState(false);
  const [currentWeek, setCurrentWeek] = useState("Preseason");

  // Fetch current week on component mount
  useEffect(() => {
    const fetchCurrentWeek = async () => {
      try {
        const configDoc = await getDoc(doc(db, "config", "season"));
        if (configDoc.exists()) {
          const data = configDoc.data();
          setCurrentWeek(data.currentWeek || "Preseason");
        }
      } catch (error) {
        console.warn("Could not fetch current week:", error);
        setCurrentWeek("Preseason"); // fallback
      }
    };

    fetchCurrentWeek();
  }, []);

  // Allow today's date in the date picker (accounting for timezone)
  const getMinDraftDate = () => {
    const now = new Date();
    // Account for timezone offset to ensure today is always available
    const localOffset = now.getTimezoneOffset() * 60000; // offset in milliseconds
    const localDate = new Date(now.getTime() - localOffset);
    return localDate.toISOString().split("T")[0];
  };

  const getMaxDraftDate = () => {
    return "2025-08-20"; // Max date
  };

  const handleCreateLeague = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("User not logged in");

      if (!displayName.trim() || !teamName.trim()) {
        alert("Please enter both a display name and team name.");
        setLoading(false);
        return;
      }

      if (draftType === "live" && (!draftDate || !draftTime || !timePerPick)) {
        alert("Please select a draft date, time, and pick duration.");
        setLoading(false);
        return;
      }

      // Build league data
      const leagueData = {
        name: leagueName,
        createdAt: new Date(),
        createdBy: user.uid,
        admin: user.uid,
        maxManagers: maxManagers,
        draftComplete: false,
        draftType,
        draftOrderType,
        scoringType: "cumulative",
        members: [user.uid],
        currentWeek: currentWeek, // Store current week at creation time
      };

      if (draftType === "live") {
        // Parse the date and time components manually
        const [year, month, day] = draftDate.split('-').map(Number);
        const [hours, minutes] = draftTime.split(':').map(Number);
        
        // Create datetime object in local timezone
        const draftDateTime = new Date(year, month - 1, day, hours, minutes, 0);
        
        console.log("📅 Input date:", draftDate, "time:", draftTime);
        console.log("📅 Draft datetime (EDT):", draftDateTime.toLocaleString("en-US", {timeZone: "America/New_York"}));
        console.log("📅 Draft datetime stored:", draftDateTime);
        
        // Validate the datetime is at least 15 minutes in the future
        const now = new Date();
        const minTime = new Date(now.getTime() + 15 * 60 * 1000);
        
        console.log("📅 Now (EDT):", now.toLocaleString("en-US", {timeZone: "America/New_York"}));
        console.log("📅 Min time (EDT):", minTime.toLocaleString("en-US", {timeZone: "America/New_York"}));
        console.log("📅 Draft is valid:", draftDateTime >= minTime);
        
        if (draftDateTime < minTime) {
          alert("Draft must be scheduled at least 15 minutes in the future.");
          setLoading(false);
          return;
        }
        
        if (!isNaN(draftDateTime)) {
          leagueData.draftDate = draftDateTime;
        } else {
          console.warn("Invalid draftDate skipped");
        }

        const parsedPickTime = Number(timePerPick);
        if (!isNaN(parsedPickTime)) {
          leagueData.timePerPick = parsedPickTime;
        } else {
          console.warn("Invalid timePerPick skipped");
        }
      }

      console.log("📦 League data to save:", leagueData);

      const leagueRef = await addDoc(collection(db, "leagues"), leagueData);

      await updateDoc(doc(db, "users", user.uid), {
        leagueIds: arrayUnion(leagueRef.id)
      });

      // Create member document with consistent structure
      await setDoc(doc(db, "leagues", leagueRef.id, "members", user.uid), {
        displayName: displayName.trim(),
        teamName: teamName.trim(),
        email: user.email || "",
        lineup: {
          starters: [],
          bench: [],
          drafted: []
        },
        points: 0,
        weeklyPoints: 0,           // Current week's points (number)
        weeklyPointsHistory: {},   // Historical weekly points (object)
        freeAgentMoves: 0,         // Number of FA moves made
        smackTalk: "",             // Smack talk message for league standings
        joinedAt: new Date()
      });

      navigate("/home", {
        state: { message: "✅ League created successfully!" }
      });
    } catch (err) {
      alert("Error: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ 
      maxWidth: "500px", 
      margin: "0 auto", 
      padding: "20px",
      backgroundColor: "#f8fafc",
      minHeight: "100vh"
    }}>
      {/* Header */}
      <div style={{
        backgroundColor: "white",
        borderRadius: "16px",
        padding: "24px",
        marginBottom: "24px",
        boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
        textAlign: "center"
      }}>
        <h2 style={{
          fontSize: "24px",
          fontWeight: "700",
          color: "#1e40af",
          margin: "0 0 8px 0"
        }}>
          Create a League
        </h2>
        <p style={{
          fontSize: "14px",
          color: "#64748b",
          margin: 0
        }}>
          Current Week: <strong>{currentWeek}</strong>
        </p>
      </div>

      <form onSubmit={handleCreateLeague}>
        {/* League Settings Card */}
        <div style={{
          backgroundColor: "white",
          borderRadius: "16px",
          padding: "24px",
          marginBottom: "20px",
          boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)"
        }}>
          <h3 style={{
            fontSize: "18px",
            fontWeight: "600",
            color: "#1e293b",
            margin: "0 0 20px 0"
          }}>
            League Settings
          </h3>

          <div style={{ marginBottom: "20px" }}>
            <label style={{
              display: "block",
              fontSize: "14px",
              fontWeight: "500",
              color: "#374151",
              marginBottom: "6px"
            }}>
              League Name
            </label>
            <input
              type="text"
              placeholder="Enter league name"
              value={leagueName}
              onChange={(e) => setLeagueName(e.target.value)}
              required
              style={{
                width: "100%",
                padding: "12px 16px",
                border: "2px solid #e5e7eb",
                borderRadius: "12px",
                fontSize: "16px",
                backgroundColor: "white",
                transition: "border-color 0.2s ease",
                boxSizing: "border-box"
              }}
              onFocus={(e) => e.target.style.borderColor = "#1e40af"}
              onBlur={(e) => e.target.style.borderColor = "#e5e7eb"}
            />
          </div>

          <div style={{ marginBottom: "20px" }}>
            <label style={{
              display: "block",
              fontSize: "14px",
              fontWeight: "500",
              color: "#374151",
              marginBottom: "6px"
            }}>
              Number of Managers
            </label>
            <select
              value={maxManagers}
              onChange={(e) => setMaxManagers(Number(e.target.value))}
              required
              style={{
                width: "100%",
                padding: "12px 16px",
                border: "2px solid #e5e7eb",
                borderRadius: "12px",
                fontSize: "16px",
                backgroundColor: "white",
                boxSizing: "border-box"
              }}
            >
              <option value={8}>8 Managers</option>
              <option value={10}>10 Managers</option>
              <option value={12}>12 Managers</option>
            </select>
          </div>

          <div style={{ marginBottom: "20px" }}>
            <label style={{
              display: "block",
              fontSize: "14px",
              fontWeight: "500",
              color: "#374151",
              marginBottom: "6px"
            }}>
              Draft Type
            </label>
            <select
              value={draftType}
              onChange={(e) => setDraftType(e.target.value)}
              style={{
                width: "100%",
                padding: "12px 16px",
                border: "2px solid #e5e7eb",
                borderRadius: "12px",
                fontSize: "16px",
                backgroundColor: "white",
                boxSizing: "border-box"
              }}
            >
              <option value="manual">Manual Draft (Commissioner Enters Teams)</option>
              <option value="live">Live Draft</option>
            </select>
          </div>

          <div style={{ marginBottom: "20px" }}>
            <label style={{
              display: "block",
              fontSize: "14px",
              fontWeight: "500",
              color: "#374151",
              marginBottom: "6px"
            }}>
              Draft Order
            </label>
            <select
              value={draftOrderType}
              onChange={(e) => setDraftOrderType(e.target.value)}
              style={{
                width: "100%",
                padding: "12px 16px",
                border: "2px solid #e5e7eb",
                borderRadius: "12px",
                fontSize: "16px",
                backgroundColor: "white",
                boxSizing: "border-box"
              }}
            >
              <option value="random">Random Order (Determined at Draft Start)</option>
              <option value="admin">Commissioner Sets Order</option>
            </select>
          </div>

          {/* Info Cards */}
          {draftOrderType === "random" && (
            <div style={{
              backgroundColor: "#f0f9ff",
              border: "1px solid #0ea5e9",
              borderRadius: "12px",
              padding: "12px",
              marginBottom: "20px"
            }}>
              <p style={{
                fontSize: "14px",
                color: "#0c4a6e",
                margin: 0
              }}>
                <strong>Random Order:</strong> Draft order will be randomly shuffled when the draft begins.
              </p>
            </div>
          )}

          {draftOrderType === "admin" && (
            <div style={{
              backgroundColor: "#fffbeb",
              border: "1px solid #f59e0b",
              borderRadius: "12px",
              padding: "12px",
              marginBottom: "20px"
            }}>
              <p style={{
                fontSize: "14px",
                color: "#92400e",
                margin: 0
              }}>
                <strong>Commissioner Sets Order:</strong> You'll be able to arrange the draft order before starting the draft.
              </p>
            </div>
          )}
        </div>

        {/* Live Draft Settings */}
        {draftType === "live" && (
          <div style={{
            backgroundColor: "white",
            borderRadius: "16px",
            padding: "24px",
            marginBottom: "20px",
            boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)"
          }}>
            <h3 style={{
              fontSize: "18px",
              fontWeight: "600",
              color: "#1e293b",
              margin: "0 0 20px 0"
            }}>
              Live Draft Settings
            </h3>

            <div style={{ marginBottom: "20px" }}>
              <label style={{
                display: "block",
                fontSize: "14px",
                fontWeight: "500",
                color: "#374151",
                marginBottom: "6px"
              }}>
                Draft Date
              </label>
              <input
                type="date"
                value={draftDate}
                onChange={(e) => setDraftDate(e.target.value)}
                min={getMinDraftDate()}
                max={getMaxDraftDate()}
                required
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  border: "2px solid #e5e7eb",
                  borderRadius: "12px",
                  fontSize: "16px",
                  backgroundColor: "white",
                  boxSizing: "border-box"
                }}
              />
            </div>

            <div style={{ marginBottom: "20px" }}>
              <label style={{
                display: "block",
                fontSize: "14px",
                fontWeight: "500",
                color: "#374151",
                marginBottom: "6px"
              }}>
                Draft Time
              </label>
              <input
                type="time"
                value={draftTime}
                onChange={(e) => setDraftTime(e.target.value)}
                required
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  border: "2px solid #e5e7eb",
                  borderRadius: "12px",
                  fontSize: "16px",
                  backgroundColor: "white",
                  boxSizing: "border-box"
                }}
              />
            </div>

            <div style={{
              backgroundColor: "#fef3c7",
              border: "1px solid #f59e0b",
              borderRadius: "12px",
              padding: "12px",
              marginBottom: "20px"
            }}>
              <p style={{
                fontSize: "14px",
                color: "#92400e",
                margin: 0
              }}>
                Draft must be scheduled at least 15 minutes from now.
              </p>
            </div>

            <div style={{ marginBottom: "20px" }}>
              <label style={{
                display: "block",
                fontSize: "14px",
                fontWeight: "500",
                color: "#374151",
                marginBottom: "6px"
              }}>
                Time on Clock
              </label>
              <select
                value={timePerPick}
                onChange={(e) => setTimePerPick(e.target.value)}
                required
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  border: "2px solid #e5e7eb",
                  borderRadius: "12px",
                  fontSize: "16px",
                  backgroundColor: "white",
                  boxSizing: "border-box"
                }}
              >
                <option value="1">1 minute</option>
                <option value="2">2 minutes</option>
                <option value="5">5 minutes</option>
                <option value="10">10 minutes</option>
              </select>
            </div>
          </div>
        )}

        {/* Manual Draft Info */}
        {draftType === "manual" && (
          <div style={{
            backgroundColor: "#f0f8ff",
            border: "1px solid #0ea5e9",
            borderRadius: "16px",
            padding: "20px",
            marginBottom: "20px"
          }}>
            <h4 style={{
              fontSize: "16px",
              fontWeight: "600",
              color: "#0c4a6e",
              margin: "0 0 8px 0"
            }}>
              Manual Draft
            </h4>
            <p style={{
              fontSize: "14px",
              color: "#0c4a6e",
              margin: 0
            }}>
              You can enter team lineups after league creation. The commissioner will manually input all drafted teams for each manager.
            </p>
          </div>
        )}

        {/* Your Info Card */}
        <div style={{
          backgroundColor: "white",
          borderRadius: "16px",
          padding: "24px",
          marginBottom: "20px",
          boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)"
        }}>
          <h3 style={{
            fontSize: "18px",
            fontWeight: "600",
            color: "#1e293b",
            margin: "0 0 20px 0"
          }}>
            Your Information
          </h3>

          <div style={{ marginBottom: "20px" }}>
            <label style={{
              display: "block",
              fontSize: "14px",
              fontWeight: "500",
              color: "#374151",
              marginBottom: "6px"
            }}>
              Your Username (max 15 chars)
            </label>
            <input
              type="text"
              placeholder="Enter your username"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={15}
              required
              style={{
                width: "100%",
                padding: "12px 16px",
                border: "2px solid #e5e7eb",
                borderRadius: "12px",
                fontSize: "16px",
                backgroundColor: "white",
                transition: "border-color 0.2s ease",
                boxSizing: "border-box"
              }}
              onFocus={(e) => e.target.style.borderColor = "#1e40af"}
              onBlur={(e) => e.target.style.borderColor = "#e5e7eb"}
            />
          </div>

          <div style={{ marginBottom: "20px" }}>
            <label style={{
              display: "block",
              fontSize: "14px",
              fontWeight: "500",
              color: "#374151",
              marginBottom: "6px"
            }}>
              Your Team Name (max 15 chars)
            </label>
            <input
              type="text"
              placeholder="Enter your team name"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              maxLength={15}
              required
              style={{
                width: "100%",
                padding: "12px 16px",
                border: "2px solid #e5e7eb",
                borderRadius: "12px",
                fontSize: "16px",
                backgroundColor: "white",
                transition: "border-color 0.2s ease",
                boxSizing: "border-box"
              }}
              onFocus={(e) => e.target.style.borderColor = "#1e40af"}
              onBlur={(e) => e.target.style.borderColor = "#e5e7eb"}
            />
          </div>
        </div>

        {/* Submit Button */}
        <button 
          type="submit" 
          disabled={loading}
          style={{
            width: "100%",
            padding: "16px",
            backgroundColor: loading ? "#94a3b8" : "#1e40af",
            color: "white",
            border: "none",
            borderRadius: "12px",
            fontSize: "16px",
            fontWeight: "600",
            cursor: loading ? "not-allowed" : "pointer",
            transition: "all 0.2s ease",
            marginBottom: "20px"
          }}
          onMouseEnter={(e) => {
            if (!loading) {
              e.target.style.backgroundColor = "#1d4ed8";
              e.target.style.transform = "translateY(-1px)";
            }
          }}
          onMouseLeave={(e) => {
            if (!loading) {
              e.target.style.backgroundColor = "#1e40af";
              e.target.style.transform = "translateY(0)";
            }
          }}
        >
          {loading ? "Creating League..." : "Create League"}
        </button>
      </form>
    </div>
  );
}

export default CreateLeague;