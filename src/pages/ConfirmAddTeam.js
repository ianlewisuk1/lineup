// src/pages/ConfirmAddTeam.js
import React from "react";
import { useParams, useNavigate } from "react-router-dom";
import { auth, db } from "../firebase/firebase";
import { doc, updateDoc, getDoc } from "firebase/firestore";
import LeagueNavBar from "../components/LeagueNavBar";

function ConfirmAddTeam() {
  const { leagueId, teamName } = useParams();
  const navigate = useNavigate();

  const handleConfirmAdd = async () => {
    const user = auth.currentUser;
    if (!user) return;

    const memberRef = doc(db, "leagues", leagueId, "members", user.uid);
    const memberSnap = await getDoc(memberRef);
    const data = memberSnap.data();
    const lineup = data.lineup || {};

    const starters = lineup.starters || [];
    const bench = lineup.bench || [];
    const currentRoster = [...starters, ...bench];

    if (currentRoster.length >= 7) return;

    const newStarters = starters.length < 5 ? [...starters, teamName] : starters;
    const newBench = starters.length < 5 ? bench : [...bench, teamName];

    await updateDoc(memberRef, {
      "lineup.starters": newStarters,
      "lineup.bench": newBench
    });

    navigate(`/${leagueId}/my-lineup`);
  };

  return (
    <div>
      <LeagueNavBar />
      <h2>Confirm Add</h2>
      <p>Do you want to add <strong>{teamName}</strong> to your roster?</p>
      <button onClick={handleConfirmAdd}>Yes, Add Team</button>
      <button onClick={() => navigate(-1)} style={{ marginLeft: "1rem" }}>
        Cancel
      </button>
    </div>
  );
}

export default ConfirmAddTeam;
