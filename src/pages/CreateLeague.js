import React, { useState } from "react";
import { db, auth } from "../firebase/firebase";
import {
  collection,
  addDoc,
  doc,
  setDoc,
  updateDoc,
  arrayUnion
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
    <form onSubmit={handleCreateLeague}>
      <h2>Create a League</h2>

      <input
        type="text"
        placeholder="League name"
        value={leagueName}
        onChange={(e) => setLeagueName(e.target.value)}
        required
      />

      <label>
        Number of Managers:
        <select
          value={maxManagers}
          onChange={(e) => setMaxManagers(Number(e.target.value))}
          required
        >
          <option value={8}>8</option>
          <option value={10}>10</option>
          <option value={12}>12</option>
        </select>
      </label>

      <label>
        Draft Type:
        <select
          value={draftType}
          onChange={(e) => setDraftType(e.target.value)}
        >
          <option value="manual">Manual Draft (Commissioner Enters Teams)</option>
          <option value="live">Live Draft</option>
        </select>
      </label>

      <label>
        Draft Order:
        <select
          value={draftOrderType}
          onChange={(e) => setDraftOrderType(e.target.value)}
        >
          <option value="random">Random Order (Determined at Draft Start)</option>
          <option value="admin">Commissioner Sets Order</option>
        </select>
      </label>

      {draftOrderType === "random" && (
        <div style={{ fontSize: "0.9em", color: "#666", margin: "0.5rem 0", padding: "0.5rem", backgroundColor: "#f8f9fa", borderRadius: "4px" }}>
          <strong>Random Order:</strong> Draft order will be randomly shuffled when the draft begins.
        </div>
      )}

      {draftOrderType === "admin" && (
        <div style={{ fontSize: "0.9em", color: "#666", margin: "0.5rem 0", padding: "0.5rem", backgroundColor: "#fff3cd", borderRadius: "4px" }}>
          <strong>Commissioner Sets Order:</strong> You'll be able to arrange the draft order before starting the draft.
        </div>
      )}

      {draftType === "live" && (
        <>
          <label>
            Draft Date:
            <input
              type="date"
              value={draftDate}
              onChange={(e) => setDraftDate(e.target.value)}
              min={getMinDraftDate()}
              max={getMaxDraftDate()}
              required
            />
          </label>

          <label>
            Draft Time:
            <input
              type="time"
              value={draftTime}
              onChange={(e) => setDraftTime(e.target.value)}
              required
            />
          </label>

          <div style={{ fontSize: "0.9em", color: "#666", margin: "0.5rem 0" }}>
            Draft must be scheduled at least 15 minutes from now.
          </div>

          <label>
            Time on Clock:
            <select
              value={timePerPick}
              onChange={(e) => setTimePerPick(e.target.value)}
              required
            >
              <option value="1">1 minute</option>
              <option value="2">2 minutes</option>
              <option value="5">5 minutes</option>
              <option value="10">10 minutes</option>
            </select>
          </label>
        </>
      )}

      {draftType === "manual" && (
        <div style={{ padding: "1rem", backgroundColor: "#f0f8ff", borderRadius: "4px", margin: "1rem 0" }}>
          <p><strong>Manual Draft:</strong> You can enter team lineups after league creation. The commissioner will manually input all drafted teams for each manager.</p>
        </div>
      )}

      <input
        type="text"
        placeholder="Your username (max 15 chars)"
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        maxLength={15}
        required
      />

      <input
        type="text"
        placeholder="Your team name (max 15 chars)"
        value={teamName}
        onChange={(e) => setTeamName(e.target.value)}
        maxLength={15}
        required
      />

      <button type="submit" disabled={loading}>
        {loading ? "Creating..." : "Create League"}
      </button>
    </form>
  );
}

export default CreateLeague;