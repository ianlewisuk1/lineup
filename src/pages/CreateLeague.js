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

function CreateLeague() {
  const [leagueName, setLeagueName] = useState("");
  const [scoringType, setScoringType] = useState("head_to_head");
  const [displayName, setDisplayName] = useState("");
  const [teamName, setTeamName] = useState("");
  const [maxManagers, setMaxManagers] = useState(8); // ✅ new state
  const [loading, setLoading] = useState(false);

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

      const leagueRef = await addDoc(collection(db, "leagues"), {
        name: leagueName,
        scoringType,
        members: [user.uid],
        createdAt: new Date(),
        createdBy: user.uid,
        admin: user.uid,
        maxManagers: maxManagers // ✅ saved to Firestore
      });

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

      alert("League created!");
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

      <select
        value={scoringType}
        onChange={(e) => setScoringType(e.target.value)}
      >
        <option value="head_to_head">Head-to-Head</option>
        <option value="cumulative">Cumulative</option>
      </select>

      {/* ✅ New dropdown for max managers */}
      <label>
        Max Managers:
        <select
          value={maxManagers}
          onChange={(e) => setMaxManagers(Number(e.target.value))}
        >
          <option value={8}>8</option>
          <option value={10}>10</option>
          <option value={12}>12</option>
        </select>
      </label>

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
