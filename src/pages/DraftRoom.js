import React, { useEffect, useState } from "react";
import { db, auth } from "../firebase/firebase";
import {
  doc,
  getDoc,
  updateDoc,
  onSnapshot,
  collection,
  getDocs
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
      if (!currentUser) {
        console.log("No user");
        return;
      }

      setUserId(currentUser.uid);

      // Step 1: Get the league ID
      const userRef = doc(db, "users", currentUser.uid);
      const userSnap = await getDoc(userRef);
      const leagueId = userSnap.data()?.leagueId;
      setLeagueId(leagueId);
      if (!leagueId) return;

      // Step 2: Get league members
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

      console.log("✅ userMap built:", nameMap); // Debugging
      setUserMap(nameMap);

      // Step 3: Only after userMap is ready, listen to draft
      const draftRef = doc(db, "leagues", leagueId, "meta", "draft");
      onSnapshot(draftRef, (snap) => {
      const data = snap.data();
      if (data) {
        setDraftData(data);
        setLoading(false);
      }
});

    };

    fetchDraft();
  }, []);

  const handlePick = async () => {
    if (!teamPick || !draftData) return;

    const newSelected = { ...draftData.selectedTeams };
    newSelected[userId] = [...(newSelected[userId] || []), teamPick];

    const newAvailable = draftData.availableTeams.filter(t => t !== teamPick);
    const newIndex = draftData.currentPickIndex + 1;

    // ✅ Draft completion logic
    const totalPicks = Object.values(newSelected).reduce((sum, picks) => sum + picks.length, 0);
    const totalRequiredPicks = 3; //draftData.draftOrder.length * 7;
    const draftComplete = totalPicks >= totalRequiredPicks;

    const draftRef = doc(db, "leagues", leagueId, "meta", "draft");

    await updateDoc(draftRef, {
      selectedTeams: newSelected,
      availableTeams: newAvailable,
      currentPickIndex: newIndex,
      draftComplete
    });

    setTeamPick("");
  };

  if (loading || !draftData || Object.keys(userMap).length === 0) {
    return <p>Loading draft...</p>;
  }

  console.log("👤 Logged-in userId:", userId);
  console.log("🎯 Current pick userId:", draftData.draftOrder[draftData.currentPickIndex]);


  const isMyTurn = draftData.draftOrder[draftData.currentPickIndex] === userId;
  const disableDrafting = draftData.draftComplete || !isMyTurn;
  const currentUid = draftData.draftOrder[draftData.currentPickIndex];
  const currentManager = userMap[currentUid];

  return (
    <div>
      <h2>Draft Room</h2>
      <p><strong>League ID:</strong> {leagueId}</p>

      {draftData.draftComplete && (
        <p style={{ color: "green", fontWeight: "bold" }}>✅ Draft Complete!</p>
      )}

      {isMyTurn ? (
        <p>It's <strong>your</strong> turn</p>
      ) : (
        <p>
          It's <strong>
            {currentManager?.displayName}
          </strong>'s turn
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
