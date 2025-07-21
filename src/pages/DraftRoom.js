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
  setDoc
} from "firebase/firestore";
import DraftBoard from "../components/DraftBoard";

function DraftRoom() {
  const [draftData, setDraftData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [leagueId, setLeagueId] = useState(null);
  const [userId, setUserId] = useState(null);
  const [teamPick, setTeamPick] = useState("");
  const [userMap, setUserMap] = useState({});

  useEffect(() => {
    const fetchDraft = async () => {
      const currentUser = auth.currentUser;
      if (!currentUser) return;

      setUserId(currentUser.uid);

      const userRef = doc(db, "users", currentUser.uid);
      const userSnap = await getDoc(userRef);
      const leagueId = userSnap.data()?.leagueId;
      setLeagueId(leagueId);
      if (!leagueId) return;

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
        if (data) {
          setDraftData(data);
          setLoading(false);
        } else {
          setDraftData(null);
          setLoading(false);
        }
      });
    };

    fetchDraft();
  }, []);

const handleStartDraft = async () => {
  if (!leagueId || Object.keys(userMap).length === 0) return;

  const draftOrder = Object.keys(userMap).filter(Boolean);

  const allTeamsSnap = await getDocs(collection(db, "teams"));

  // Full raw team data for debugging
  const allTeams = allTeamsSnap.docs.map(doc => doc.data());
  console.log("📄 All Fetched Teams:", allTeams);

  // Filter to valid FBS teams with defined names
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

  console.log("📦 Final Draft Payload:", draftPayload);

  const draftRef = doc(db, "leagues", leagueId, "meta", "draft");

  try {
    await setDoc(draftRef, draftPayload);
    alert("Draft started!");
  } catch (err) {
    console.error("❌ Failed to set draft:", err);
    alert("Error creating draft: " + err.message);
  }
};


  const handleDraftSummary = async () => {
    if (!draftData || !leagueId || !draftData.selectedTeams) return;

    const updates = Object.entries(draftData.selectedTeams).map(async ([uid, teams]) => {
      const memberRef = doc(db, "leagues", leagueId, "members", uid);
      await updateDoc(memberRef, {
        "lineup.drafted": teams
      });
    });

    await Promise.all(updates);
    alert("Lineups updated based on final draft!");
  };

  const handlePick = async () => {
    if (!teamPick || !draftData) return;

    const newSelected = { ...draftData.selectedTeams };
    newSelected[userId] = [...(newSelected[userId] || []), teamPick];

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

  if (loading || Object.keys(userMap).length === 0) {
    return <p>Loading draft room...</p>;
  }

  if (!draftData) {
    return (
      <div>
        <h2>Draft Room</h2>
        <p>No draft has been started yet.</p>
        <button onClick={handleStartDraft}>Start Draft</button>
      </div>
    );
  }

  const isMyTurn = draftData.draftOrder[draftData.currentPickIndex] === userId;
  const disableDrafting = draftData.draftComplete || !isMyTurn;
  const currentUid = draftData.draftOrder[draftData.currentPickIndex];
  const currentManager = userMap[currentUid];

  return (
    <div>
      <h2>Draft Room</h2>
      <p><strong>League ID:</strong> {leagueId}</p>

      {draftData.draftComplete && (
        <>
          <p style={{ color: "green", fontWeight: "bold" }}>✅ Draft Complete!</p>
          <button onClick={handleDraftSummary}>Complete Draft</button>
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
