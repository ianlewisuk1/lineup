import React, { useEffect, useState } from "react";
import { db, auth } from "../firebase/firebase";
import {
  doc,
  getDoc,
  updateDoc,
  onSnapshot,
  collection,
  getDocs,
  arrayUnion,
  setDoc,
  deleteDoc
} from "firebase/firestore";
import DraftBoard from "../components/DraftBoard";
import { useParams } from "react-router-dom";
import LeagueNavBar from "../components/LeagueNavBar";

function DraftRoom() {
  const { leagueId } = useParams();
  const [draftData, setDraftData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState(null);
  const [teamPick, setTeamPick] = useState("");
  const [userMap, setUserMap] = useState({});
  const [isLeagueAdmin, setIsLeagueAdmin] = useState(false);
  const [maxManagers, setMaxManagers] = useState(null);

  useEffect(() => {
    const fetchDraft = async () => {
      const currentUser = auth.currentUser;
      if (!currentUser) return;

      setUserId(currentUser.uid);

      // Get league info
      const leagueRef = doc(db, "leagues", leagueId);
      const leagueSnap = await getDoc(leagueRef);
      if (leagueSnap.exists()) {
        const leagueData = leagueSnap.data();
        setIsLeagueAdmin(leagueData.admin === currentUser.uid);
        setMaxManagers(leagueData.maxManagers);
      }

      // Get league members
      const membersRef = collection(db, "leagues", leagueId, "members");
      const membersSnap = await getDocs(membersRef);

      const nameMap = {};
      membersSnap.forEach(doc => {
        const data = doc.data();
        nameMap[doc.id] = {
          displayName: data.displayName || data.email || "Unknown",
          teamName: data.teamName || "Unnamed Team"
        };
      });

      setUserMap(nameMap);

      // Listen to draft data
      const draftRef = doc(db, "leagues", leagueId, "meta", "draft");
      onSnapshot(draftRef, (snap) => {
        const data = snap.data();
        setDraftData(data || null);
        setLoading(false);
      });
    };

    fetchDraft();
  }, [leagueId]);

  const handleStartDraft = async () => {
    if (!leagueId || Object.keys(userMap).length === 0) return;

    try {
      const leagueRef = doc(db, "leagues", leagueId);
      const leagueSnap = await getDoc(leagueRef);
      if (!leagueSnap.exists()) {
        alert("League not found.");
        return;
      }

      const leagueData = leagueSnap.data();
      const expectedManagers = leagueData.maxManagers;
      const currentManagers = Object.keys(userMap).length;

      if (currentManagers < expectedManagers) {
        alert(`You need ${expectedManagers} managers to start the draft. Currently: ${currentManagers}`);
        return;
      }

      const draftOrder = Object.keys(userMap).filter(Boolean);
      const allTeamsSnap = await getDocs(collection(db, "teams"));
      const allTeams = allTeamsSnap.docs.map(doc => doc.data());

      const availableTeams = allTeams
        .filter(team => team.classification === "FBS" && typeof team.school === "string")
        .map(team => team.school);

      if (availableTeams.length === 0) {
        alert("⚠️ No valid FBS teams with names found.");
        return;
      }

      const draftPayload = {
        draftOrder,
        currentPickIndex: 0,
        availableTeams,
        selectedTeams: {},
        draftComplete: false
      };

      const draftRef = doc(db, "leagues", leagueId, "meta", "draft");
      await setDoc(draftRef, draftPayload);
      alert("Draft started!");

    } catch (err) {
      console.error("❌ Failed to start draft:", err);
      alert("Error starting draft: " + err.message);
    }
  };

  const handleRestartDraft = async () => {
    const confirm = window.confirm("Are you sure you want to delete and restart the draft?");
    if (!confirm) return;

    try {
      const draftRef = doc(db, "leagues", leagueId, "meta", "draft");
      await deleteDoc(draftRef);
      alert("Draft has been reset. You can now start a new draft.");
    } catch (err) {
      console.error("Failed to delete draft:", err);
      alert("Error resetting draft: " + err.message);
    }
  };

  const handleDraftSummary = async () => {
    if (!draftData || !leagueId || !draftData.selectedTeams) return;

    const updates = Object.entries(draftData.selectedTeams).map(async ([uid, teams]) => {
      const starters = teams.slice(0, 5);
      const bench = teams.slice(5);

      const memberRef = doc(db, "leagues", leagueId, "members", uid);
      await updateDoc(memberRef, {
        "lineup.drafted": teams,
        "lineup.starters": starters,
        "lineup.bench": bench
      });
    });

    await Promise.all(updates);
    alert("✅ Lineups updated with starters and bench!");
  };

  const handlePick = async () => {
    if (!teamPick || !draftData) return;

    const alreadyPicked = draftData.selectedTeams[userId] || [];
    if (alreadyPicked.length >= 7) {
      alert("You already have 7 teams drafted.");
      return;
    }

    const newSelected = {
      ...draftData.selectedTeams,
      [userId]: [...alreadyPicked, teamPick]
    };

    const newAvailable = draftData.availableTeams.filter(t => t !== teamPick);
    const newIndex = draftData.currentPickIndex + 1;

    const totalPicks = Object.values(newSelected).reduce((sum, picks) => sum + picks.length, 0);
    const totalRequiredPicks = draftData.draftOrder.length * 7;
    const draftComplete = totalPicks >= totalRequiredPicks;

    const draftRef = doc(db, "leagues", leagueId, "meta", "draft");

    await updateDoc(draftRef, {
      selectedTeams: newSelected,
      availableTeams: newAvailable,
      currentPickIndex: newIndex,
      draftComplete
    });

    const memberRef = doc(db, "leagues", leagueId, "members", userId);
    await updateDoc(memberRef, {
      "lineup.drafted": arrayUnion(teamPick)
    });

    setTeamPick("");
  };

  const currentCount = Object.keys(userMap).length;
  const missing = maxManagers ? maxManagers - currentCount : 0;
  const isFull = missing === 0;

  if (loading || Object.keys(userMap).length === 0) {
    return <p>Loading draft room...</p>;
  }

  if (!draftData) {
    return (
      <div>
        <h2>Draft Room</h2>
        <p>No draft has been started yet.</p>

        {!isFull && (
          <div style={{ color: "orange", marginBottom: "1rem" }}>
            <p>🟡 Waiting for {missing} more user(s) to join.</p>
            <p>Current members:</p>
            <ul>
              {Object.values(userMap).map((user, i) => (
                <li key={i}>{user.displayName}</li>
              ))}
            </ul>
          </div>
        )}

        {isLeagueAdmin && isFull && (
          <button onClick={handleStartDraft}>Start Draft</button>
        )}
      </div>
    );
  }

  const isMyTurn = draftData.draftOrder[draftData.currentPickIndex] === userId;
  const disableDrafting = draftData.draftComplete || !isMyTurn;
  const currentUid = draftData.draftOrder[draftData.currentPickIndex];
  const currentManager = userMap[currentUid];

  return (
    <div>
      <LeagueNavBar />
      <h2>Draft Room</h2>
      <p><strong>League ID:</strong> {leagueId}</p>

      {isLeagueAdmin && draftData && (
        <button onClick={handleRestartDraft} style={{ marginTop: "1rem", color: "red" }}>
          Restart Draft
        </button>
      )}

      {draftData.draftComplete && (
        <>
          <p style={{ color: "green", fontWeight: "bold" }}>✅ Draft Complete!</p>
          {isLeagueAdmin && (
            <button onClick={handleDraftSummary}>Complete Draft</button>
          )}
        </>
      )}

      {isMyTurn ? (
        <p>It's <strong>your</strong> turn</p>
      ) : (
        <p>
          It's <strong>{currentManager?.displayName}</strong>'s turn
        </p>
      )}

      <h3>Available Teams</h3>
      <select value={teamPick} onChange={(e) => setTeamPick(e.target.value)} disabled={disableDrafting}>
        <option value="">-- Select a Team --</option>
        {draftData.availableTeams.map((team) => (
          <option key={team} value={team}>{team}</option>
        ))}
      </select>
      <button onClick={handlePick} disabled={disableDrafting || !teamPick}>Draft</button>

      <h3>Full Draft Board</h3>
      <DraftBoard draftData={draftData} userMap={userMap} />
    </div>
  );
}

export default DraftRoom;
