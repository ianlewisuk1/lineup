import React, { useEffect, useState } from "react";
import { db, auth } from "../firebase/firebase";
import {
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  collection,
  getDocs,
  query,
  where
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

      const userRef = doc(db, "users", currentUser.uid);
      const userSnap = await getDoc(userRef);
      const leagueId = userSnap.data()?.leagueId;
      setLeagueId(leagueId);

      if (!leagueId) return;

      const q = query(collection(db, "users"), where("leagueId", "==", leagueId));
      const usersSnapshot = await getDocs(q);
      const nameMap = {};
      usersSnapshot.forEach(doc => {
        const data = doc.data();
        nameMap[doc.id] = data.name || data.displayName || data.email || "Unknown";
      });
      setUserMap(nameMap);

      const draftRef = doc(db, "leagues", leagueId, "meta", "draft");

      onSnapshot(draftRef, (snap) => {
        setDraftData(snap.data());
        setLoading(false);
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

    const draftRef = doc(db, "leagues", leagueId, "meta", "draft");
    await setDoc(draftRef, {
      ...draftData,
      selectedTeams: newSelected,
      availableTeams: newAvailable,
      currentPickIndex: newIndex
    });

    setTeamPick("");
  };

  if (loading || !draftData) return <p>Loading draft...</p>;

  const isMyTurn = draftData.draftOrder[draftData.currentPickIndex] === userId;

  return (
    <div>
      <h2>Draft Room</h2>
      <p><strong>League ID:</strong> {leagueId}</p>
      <p>It's {isMyTurn ? "your" : "someone else's"} turn</p>

      <h3>Available Teams</h3>
      <select value={teamPick} onChange={(e) => setTeamPick(e.target.value)}>
        <option value="">-- Select a Team --</option>
        {draftData.availableTeams.map((team) => (
          <option key={team} value={team}>{team}</option>
        ))}
      </select>
      <button onClick={handlePick} disabled={!isMyTurn || !teamPick}>Draft</button>

      <h3>Full Draft Board</h3>
      <DraftBoard draftData={draftData} userMap={userMap} />
    </div>
  );
}

export default DraftRoom;
