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

  const handleCreateLeague = async (e) => {
    e.preventDefault();
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("User not logged in");

      // 1. Create league document
      const leagueRef = await addDoc(collection(db, "leagues"), {
        name: leagueName,
        scoringType,
        members: [user.uid],
        createdAt: new Date(),
        createdBy: user.uid, // ✅ Save the creator
        admin: user.uid      // ✅ who manages it
      });

      // 2. Add user to their own `leagueIds`
      await updateDoc(doc(db, "users", user.uid), {
        leagueIds: arrayUnion(leagueRef.id)
      });

      // 3. Add user to the league's `members` subcollection
      await setDoc(doc(db, "leagues", leagueRef.id, "members", user.uid), {
        displayName: user.email, // Or use user.displayName if available
        lineup: {
          starters: [],
          bench: [],
          drafted: []
        }
      });

      alert("League created!");
    } catch (err) {
      alert("Error: " + err.message);
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
      <button type="submit">Create League</button>
    </form>
  );
}

export default CreateLeague;
