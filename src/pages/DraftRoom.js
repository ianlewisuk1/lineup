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
import { useParams } from "react-router-dom";
import { deleteDoc } from "firebase/firestore";

function DraftRoom() {
  const { leagueId } = useParams();
  const [draftData, setDraftData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState(null);
  const [teamPick, setTeamPick] = useState("");
  const [userMap, setUserMap] = useState({});
  const [isLeagueAdmin, setIsLeagueAdmin] = useState(false); // 🆕 new state

  useEffect(() => {
    const fetchDraft = async () => {
      const currentUser = auth.currentUser;
      if (!currentUser) return;

      setUserId(currentUser.uid);

      // 🆕 Get league and check admin
      const leagueRef = doc(db, "leagues", leagueId);
      const leagueSnap = await getDoc(leagueRef);
      if (leagueSnap.exists()) {
        const leagueData = leagueSnap.data();
        setIsLeagueAdmin(leagueData.admin === currentUser.uid);
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


  if (loading || Object.keys(userMap).length === 0) {
    return <p>Loading draft room...</p>;
  }

  if (!draftData) {
    return (
      <div>
        <h2>Draft Room</h2>
        <p>No draft has been started yet.</p>
        {isLeagueAdmin && (
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
