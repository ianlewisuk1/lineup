import React, { useState } from "react";
import { db } from "../firebase/firebase";
import { doc, getDoc, updateDoc, arrayUnion } from "firebase/firestore";
import { auth } from "../firebase/firebase";

function JoinLeague() {
  const [leagueId, setLeagueId] = useState("");

  const handleJoinLeague = async (e) => {
    e.preventDefault();
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("User not logged in");

      const leagueRef = doc(db, "leagues", leagueId);
      const leagueSnap = await getDoc(leagueRef);

      if (!leagueSnap.exists()) {
        alert("League not found.");
        return;
      }

      // Add user to league's members array
      await updateDoc(leagueRef, {
        members: arrayUnion(user.uid)
      });

      // Update user's leagueId
      await updateDoc(doc(db, "users", user.uid), {
        leagueId: leagueId
      });

      alert("Joined league successfully!");
    } catch (err) {
      alert("Error: " + err.message);
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
      <button type="submit">Join League</button>
    </form>
  );
}

export default JoinLeague;
