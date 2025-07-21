import React, { useState } from "react";
import { db, auth } from "../firebase/firebase";
import {
  doc,
  getDoc,
  updateDoc,
  setDoc,
  arrayUnion
} from "firebase/firestore";

function JoinLeague() {
  const [leagueId, setLeagueId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [teamName, setTeamName] = useState("");
  const [loading, setLoading] = useState(false);

  const handleJoinLeague = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("User not logged in");

      if (!displayName.trim() || !teamName.trim()) {
        alert("Please enter a username and team name.");
        setLoading(false);
        return;
      }

      if (displayName.length > 15 || teamName.length > 15) {
        alert("Username and team name must be 15 characters or fewer.");
        setLoading(false);
        return;
      }

      const leagueRef = doc(db, "leagues", leagueId);
      const leagueSnap = await getDoc(leagueRef);
      if (!leagueSnap.exists()) {
        alert("League not found.");
        setLoading(false);
        return;
      }

      // Add user to league's members array
      await updateDoc(leagueRef, {
        members: arrayUnion(user.uid)
      });

      // Update user's leagueId
      await updateDoc(doc(db, "users", user.uid), {
        leagueIds: arrayUnion(leagueId)
      });

      // Set league-specific member info
      await setDoc(doc(db, "leagues", leagueId, "members", user.uid), {
        displayName: displayName.trim(),
        teamName: teamName.trim(),
        email: user.email || "", // safe fallback
        lineup: [],
        joinedAt: new Date()
      }, { merge: true });

      alert("Joined league successfully!");
    } catch (err) {
      alert("Error: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleJoinLeague}>
      <h2>Join a League</h2>

      <input
        type="text"
        placeholder="Enter League ID"
        value={leagueId}
        onChange={(e) => setLeagueId(e.target.value)}
        required
      />

      <input
        type="text"
        placeholder="Your username (max 15 chars)"
        value={displayName}
        maxLength={15}
        onChange={(e) => setDisplayName(e.target.value)}
        required
      />

      <input
        type="text"
        placeholder="Your team name (max 15 chars)"
        value={teamName}
        maxLength={15}
        onChange={(e) => setTeamName(e.target.value)}
        required
      />

      <button type="submit" disabled={loading}>
        {loading ? "Joining..." : "Join League"}
      </button>
    </form>
  );
}

export default JoinLeague;
