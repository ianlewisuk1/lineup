import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { auth, db } from "../firebase/firebase";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import LeagueNavBar from "../components/LeagueNavBar";

function ConfirmCut() {
  const { leagueId, teamName } = useParams();
  const [teamData, setTeamData] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchTeam = async () => {
      const teamRef = doc(db, "teams", teamName);
      const teamSnap = await getDoc(teamRef);
      if (teamSnap.exists()) {
        setTeamData(teamSnap.data());
      }
      setLoading(false);
    };

    fetchTeam();
  }, [teamName]);

  const handleConfirm = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) return;

    const memberRef = doc(db, "leagues", leagueId, "members", currentUser.uid);
    const memberSnap = await getDoc(memberRef);
    const data = memberSnap.data();
    const lineup = data.lineup || {};

    const newRoster = (lineup.currentRoster || []).filter(t => t !== teamName);
    const newStarters = (lineup.starters || []).filter(t => t !== teamName);
    const newBench = (lineup.bench || []).filter(t => t !== teamName);

    await updateDoc(memberRef, {
      "lineup.currentRoster": newRoster,
      "lineup.starters": newStarters,
      "lineup.bench": newBench
    });

    navigate(`/${leagueId}/my-lineup`);
  };

  const handleCancel = () => {
    navigate(`/${leagueId}/my-lineup`);
  };

  if (loading) return <p>Loading team info...</p>;

  return (
    <div>
      <LeagueNavBar />
      <h2>Confirm Cut</h2>
      <p>Are you sure you want to cut <strong>{teamName}</strong> from your roster?</p>

      {teamData && (
        <div style={{ padding: "1rem", border: "1px solid #ccc", marginBottom: "1rem" }}>
          <strong>{teamData.school}</strong> ({teamData.conference})<br />
          Record: {teamData.currentSeason?.record}<br />
          Next Opponent: {teamData.currentSeason?.nextOpponent} ({teamData.currentSeason?.nextOpponentSpread})<br />
          Game Points: {teamData.currentSeason?.gamePoints ?? 0}
        </div>
      )}

      <button onClick={handleConfirm} style={{ marginRight: "1rem", background: "#f44336", color: "white" }}>
        Yes, cut them
      </button>
      <button onClick={handleCancel}>
        Cancel
      </button>
    </div>
  );
}

export default ConfirmCut;
