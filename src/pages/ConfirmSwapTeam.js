// src/pages/ConfirmSwapTeam.js
import React from "react";
import { useParams, useNavigate } from "react-router-dom";
import { auth, db } from "../firebase/firebase";
import { doc, updateDoc, getDoc } from "firebase/firestore";
import LeagueNavBar from "../components/LeagueNavBar";

function ConfirmSwapTeam() {
  const { leagueId, addTeam, dropTeam } = useParams();
  const navigate = useNavigate();

  const handleConfirmSwap = async () => {
    const user = auth.currentUser;
    if (!user) return;

    const memberRef = doc(db, "leagues", leagueId, "members", user.uid);
    const memberSnap = await getDoc(memberRef);
    const data = memberSnap.data();
    const lineup = data.lineup || {};

    const currentRoster = lineup.currentRoster || [];
    const starters = lineup.starters || [];
    const bench = lineup.bench || [];

    if (!currentRoster.includes(dropTeam)) return;

    const newRoster = currentRoster.filter(t => t !== dropTeam).concat(addTeam);

    let newStarters = starters;
    let newBench = bench;

    if (starters.includes(dropTeam)) {
      newStarters = starters.map(t => (t === dropTeam ? addTeam : t));
    } else if (bench.includes(dropTeam)) {
      newBench = bench.map(t => (t === dropTeam ? addTeam : t));
    } else {
      newBench = [...bench, addTeam];
    }

    await updateDoc(memberRef, {
      "lineup.currentRoster": newRoster,
      "lineup.starters": newStarters,
      "lineup.bench": newBench
    });

    navigate(`/${leagueId}/my-lineup`);
  };

  return (
    <div>
      <LeagueNavBar />
      <h2>Confirm Swap</h2>
      <p>Swap <strong>{dropTeam}</strong> with <strong>{addTeam}</strong>?</p>
      <button onClick={handleConfirmSwap}>Yes, Confirm Swap</button>
      <button onClick={() => navigate(-1)} style={{ marginLeft: "1rem" }}>
        Cancel
      </button>
    </div>
  );
}

export default ConfirmSwapTeam;
