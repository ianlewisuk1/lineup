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
  const [draftType, setDraftType] = useState("simulated");
  const [draftDate, setDraftDate] = useState("");
  const [timePerPick, setTimePerPick] = useState("2");
  const [loading, setLoading] = useState(false);

  const getMinDraftDate = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split("T")[0];
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

      if (draftType === "live" && (!draftDate || !timePerPick)) {
        alert("Please select both a draft date and pick time.");
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
        scoringType: "cumulative",
        members: [user.uid],
      };

      if (draftType === "live") {
        const parsedDate = new Date(draftDate);
        if (!isNaN(parsedDate)) {
          leagueData.draftDate = parsedDate;
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

      await setDoc(doc(db, "leagues", leagueRef.id, "members", user.uid), {
        displayName: displayName.trim(),
        teamName: teamName.trim(),
        email: user.email || "",
        lineup: {
          starters: [],
          bench: [],
          drafted: []
        },
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
          <option value="simulated">Simulated Draft</option>
          <option value="live">Live Draft</option>
        </select>
      </label>

      {draftType === "live" && (
        <>
          <label>
            Draft Date (between tomorrow and August 20):
            <input
              type="date"
              value={draftDate}
              onChange={(e) => setDraftDate(e.target.value)}
              min={getMinDraftDate()}
              max="2025-08-20"
              required
            />
          </label>

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
