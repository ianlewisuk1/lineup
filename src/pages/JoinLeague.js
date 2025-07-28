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

function JoinLeague() {
  const navigate = useNavigate();

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

      // ✅ Guard against joining the same league twice
      const memberRef = doc(db, "leagues", leagueId, "members", user.uid);
      const memberSnap = await getDoc(memberRef);
      if (memberSnap.exists()) {
        alert("You are already a member of this league.");
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

      // Create the member document for this league
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
        weeklyPoints: {}
      }, { merge: true });

      alert("Joined league successfully!");
      navigate(`/${leagueId}/draft-room`);
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
