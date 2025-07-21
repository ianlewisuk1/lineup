import React, { useState } from "react";
import { db } from "../firebase/firebase";
import { collection, addDoc } from "firebase/firestore";
import { auth } from "../firebase/firebase";
import { doc, updateDoc } from "firebase/firestore";
import { arrayUnion } from "firebase/firestore"; // if not already imported

function CreateLeague() {
  const [leagueName, setLeagueName] = useState("");
  const [scoringType, setScoringType] = useState("head_to_head");

  const handleCreateLeague = async (e) => {
    e.preventDefault();
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("User not logged in");

      const leagueRef = await addDoc(collection(db, "leagues"), {
        name: leagueName,
        scoringType,
        members: [user.uid],
        createdAt: new Date()
      });

      await updateDoc(doc(db, "users", user.uid), {
        leagueIds: arrayUnion(leagueRef.id) // ✅ appends league to user's list
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
