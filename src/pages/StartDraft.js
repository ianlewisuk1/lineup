import React, { useState } from "react";
import { db, auth } from "../firebase/firebase";
import {
  doc,
  setDoc,
  getDoc,
  collection,
  query,
  where,
  getDocs
} from "firebase/firestore";

function StartDraft() {
  const [message, setMessage] = useState("");

  const startDraft = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      setMessage("You must be logged in.");
      return;
    }

    try {
      // Step 1: Get user's league ID
      const userRef = doc(db, "users", currentUser.uid);
      const userSnap = await getDoc(userRef);
      const leagueId = userSnap.data().leagueId;

      if (!leagueId) {
        setMessage("No league found for user.");
        return;
      }

      // Step 2: Get all users in the league
      const q = query(collection(db, "users"), where("leagueId", "==", leagueId));
      const snapshot = await getDocs(q);
      const draftOrder = snapshot.docs.map((doc) => doc.id);

      // Step 3: Get member info from league/members
      const membersSnap = await getDocs(collection(db, "leagues", leagueId, "members"));
      const teamNames = {};
      membersSnap.forEach((doc) => {
        const data = doc.data();
        teamNames[doc.id] = data.teamName || "Unnamed Team";
      });

      // Step 4: Prep selectedTeams map
      const selectedTeams = {};
      draftOrder.forEach((uid) => {
        selectedTeams[uid] = [];
      });

      // Step 5: Get list of available FBS teams
      const teamsSnapshot = await getDocs(collection(db, "teams"));
      const availableTeams = teamsSnapshot.docs
        .map((doc) => doc.data())
        .filter((team) => team.Classification?.toLowerCase() === "fbs")
        .map((team) => team.School);

      // Step 6: Write draft data
      const draftData = {
        draftOrder,
        currentPickIndex: 0,
        selectedTeams,
        availableTeams,
        teamNames // ✅ newly added
      };

      await setDoc(doc(db, "leagues", leagueId, "meta", "draft"), draftData);
      setMessage("✅ Draft initialized!");
    } catch (err) {
      console.error(err);
      setMessage("Error: " + err.message);
    }
  };

  return (
    <div>
      <h2>Start Draft</h2>
      <button onClick={startDraft}>Initialize Draft</button>
      <p>{message}</p>
    </div>
  );
}

export default StartDraft;
