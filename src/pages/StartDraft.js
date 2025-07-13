import React, { useState, useEffect } from "react";
import { db, auth } from "../firebase/firebase";
import { doc, setDoc, getDoc, collection, query, where, getDocs } from "firebase/firestore";

function StartDraft() {
  const [message, setMessage] = useState("");

  const startDraft = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      setMessage("You must be logged in.");
      return;
    }

    try {
      // Get user's league ID
      const userRef = doc(db, "users", currentUser.uid);
      const userSnap = await getDoc(userRef);
      const leagueId = userSnap.data().leagueId;

      if (!leagueId) {
        setMessage("No league found for user.");
        return;
      }

      // Get all users in the league
      const q = query(collection(db, "users"), where("leagueId", "==", leagueId));
      const snapshot = await getDocs(q);
      const draftOrder = snapshot.docs.map((doc) => doc.id);

      // Snake draft prep (will be used later)
      const selectedTeams = {};
      draftOrder.forEach((uid) => {
        selectedTeams[uid] = [];
      });

      const teamsSnapshot = await getDocs(collection(db, "teams"));
      const availableTeams = teamsSnapshot.docs.map(doc => doc.data().School); // or use doc.id if you want the Firestore ID


      const draftData = {
        draftOrder,
        currentPickIndex: 0,
        selectedTeams,
        availableTeams
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
