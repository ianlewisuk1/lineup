// src/pages/DraftRoom.js
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
  deleteDoc,
  serverTimestamp
} from "firebase/firestore";
import DraftBoard from "../components/DraftBoard";
import ManualDraftEntry from "../components/ManualDraftEntry";
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
  const [leagueData, setLeagueData] = useState(null);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [timerInterval, setTimerInterval] = useState(null);
  const [draftCountdown, setDraftCountdown] = useState(0);
  const [countdownInterval, setCountdownInterval] = useState(null);
  const [serverTimeOffset, setServerTimeOffset] = useState(0);

  useEffect(() => {
    const fetchDraft = async () => {
      const currentUser = auth.currentUser;
      if (!currentUser) return;

      setUserId(currentUser.uid);

      // Sync server time first
      await syncServerTime();

      // Fetch league data to check draft type
      const leagueRef = doc(db, "leagues", leagueId);
      const leagueSnap = await getDoc(leagueRef);
      if (leagueSnap.exists()) {
        const leagueInfo = leagueSnap.data();
        setLeagueData(leagueInfo);
        setIsLeagueAdmin(leagueInfo.admin === currentUser.uid);
        setMaxManagers(leagueInfo.maxManagers);
      }

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

      const draftRef = doc(db, "leagues", leagueId, "meta", "draft");
      onSnapshot(draftRef, (snap) => {
        const data = snap.data();
        setDraftData(data || null);
        setLoading(false);
      });
    };

    fetchDraft();
  }, [leagueId]);

  // Server time synchronization
  const syncServerTime = async () => {
    try {
      const before = Date.now();
      
      // Create a temporary document with server timestamp to get server time
      const tempRef = doc(db, "temp", "timeSync");
      await setDoc(tempRef, {
        timestamp: serverTimestamp()
      });
      
      const tempSnap = await getDoc(tempRef);
      const serverTime = tempSnap.data().timestamp.toDate().getTime();
      
      // Clean up temp document
      await deleteDoc(tempRef);
      
      const after = Date.now();
      const networkDelay = (after - before) / 2;
      const offset = serverTime - before - networkDelay;
      
      setServerTimeOffset(offset);
      console.log(`🕐 Server time synced. Offset: ${offset}ms`);
      
    } catch (error) {
      console.warn("Failed to sync server time, using local time:", error);
      setServerTimeOffset(0);
    }
  };

  // Get synchronized time
  const getSyncedTime = () => {
    return Date.now() + serverTimeOffset;
  };

  // Pre-draft countdown timer effect
  useEffect(() => {
    if (leagueData?.draftType === "live" && leagueData.draftDate && !draftData) {
      const draftStartTime = leagueData.draftDate.toDate().getTime();
      
      // Clear existing countdown
      if (countdownInterval) {
        clearInterval(countdownInterval);
      }

      const interval = setInterval(() => {
        const now = getSyncedTime(); // Use synced time instead of Date.now()
        const timeUntilDraft = draftStartTime - now;
        
        if (timeUntilDraft <= 0) {
          setDraftCountdown(0);
          clearInterval(interval);
          // Auto-start draft if admin and time is up
          const currentCount = Object.keys(userMap).length;
          const missing = maxManagers ? maxManagers - currentCount : 0;
          const isFull = missing === 0;
          
          if (isLeagueAdmin && isFull) {
            console.log("🚀 Draft time reached! Auto-starting...");
            handleStartDraft();
          }
        } else {
          setDraftCountdown(Math.ceil(timeUntilDraft / 1000)); // seconds
        }
      }, 1000);

      setCountdownInterval(interval);
      
      return () => clearInterval(interval);
    } else {
      // Clear countdown if not applicable
      if (countdownInterval) {
        clearInterval(countdownInterval);
        setCountdownInterval(null);
      }
      setDraftCountdown(0);
    }
  }, [leagueData?.draftDate, draftData, isLeagueAdmin, userMap, maxManagers, serverTimeOffset]);

  // Timer effect for live drafts
  useEffect(() => {
    if (draftData && leagueData?.draftType === "live" && !draftData.draftComplete) {
      const timePerPick = leagueData.timePerPick || 2; // minutes
      const pickStartTime = draftData.currentPickStartTime;
      
      if (pickStartTime) {
        const startTime = pickStartTime.toDate ? pickStartTime.toDate().getTime() : new Date(pickStartTime).getTime();
        const timeLimit = timePerPick * 60 * 1000; // convert to milliseconds
        
        // Clear existing timer
        if (timerInterval) {
          clearInterval(timerInterval);
        }

        const interval = setInterval(() => {
          const now = getSyncedTime(); // Use synced time
          const elapsed = now - startTime;
          const remaining = Math.max(0, timeLimit - elapsed);
          
          setTimeRemaining(Math.ceil(remaining / 1000)); // seconds
          
          if (remaining <= 0) {
            // Time's up - auto-pick best team
            handleAutoPick();
            clearInterval(interval);
          }
        }, 1000);

        setTimerInterval(interval);
        
        return () => clearInterval(interval);
      }
    } else {
      // Clear timer if not live draft or draft complete
      if (timerInterval) {
        clearInterval(timerInterval);
        setTimerInterval(null);
      }
      setTimeRemaining(0);
    }
  }, [draftData?.currentPickIndex, draftData?.currentPickStartTime, leagueData?.timePerPick]);

  // Helper function to get current picker using snake draft logic
  const getCurrentPicker = (draftOrder, currentPickIndex) => {
    if (!draftOrder || draftOrder.length === 0) return null;
    
    const totalManagers = draftOrder.length;
    const currentRound = Math.floor(currentPickIndex / totalManagers);
    const positionInRound = currentPickIndex % totalManagers;
    
    // For even rounds (0, 2, 4, 6): use normal order
    // For odd rounds (1, 3, 5): use reverse order
    if (currentRound % 2 === 0) {
      return draftOrder[positionInRound];
    } else {
      return draftOrder[totalManagers - 1 - positionInRound];
    }
  };

  const handleAutoPick = async () => {
    if (!draftData || draftData.draftComplete) return;

    const currentIndex = draftData.currentPickIndex;
    const draftOrder = draftData.draftOrder;
    
    // Use snake draft logic to get current picker
    const currentUid = getCurrentPicker(draftOrder, currentIndex);
    const availableTeamNames = draftData.availableTeams;
    
    if (!currentUid || availableTeamNames.length === 0) {
      console.error("Auto-pick failed - no current UID or no available teams");
      return;
    }

    try {
      // Fetch all teams to get their philMetricDraftRank scores
      const allTeamsSnap = await getDocs(collection(db, "teams"));
      
      // Create a map of team names to their philMetricDraftRank scores
      const teamRankings = {};
      allTeamsSnap.docs.forEach(doc => {
        const data = doc.data();
        if (data.school && data.philMetricDraftRank !== undefined) {
          teamRankings[data.school] = data.philMetricDraftRank;
        }
      });

      // Filter available teams and sort by philMetricDraftRank (lowest = best)
      const availableTeamsWithRanks = availableTeamNames
        .map(teamName => ({
          name: teamName,
          rank: teamRankings[teamName] || 999 // Default high rank if not found
        }))
        .sort((a, b) => a.rank - b.rank); // Sort ascending (lower rank = better)

      // Pick the best available team (lowest philMetricDraftRank)
      const bestTeam = availableTeamsWithRanks[0];
      
      console.log(`🤖 Auto-picking best available team: ${bestTeam.name} (rank: ${bestTeam.rank}) for ${userMap[currentUid]?.displayName}`);
      
      await performPick(bestTeam.name, currentUid, true);

    } catch (error) {
      console.error("Error in smart auto-pick, falling back to random:", error);
      
      // Fallback to random selection if something goes wrong
      const randomTeam = availableTeamNames[Math.floor(Math.random() * availableTeamNames.length)];
      await performPick(randomTeam, currentUid, true);
    }
  };

  const performPick = async (teamName, pickingUserId, isAutoPick = false) => {
    if (!draftData) return;

    // CRITICAL: Fetch fresh draft data before making any pick to prevent overwrites
    const draftRef = doc(db, "leagues", leagueId, "meta", "draft");
    const freshDraftSnap = await getDoc(draftRef);
    const freshDraftData = freshDraftSnap.data();
    
    if (!freshDraftData) {
      console.error("No fresh draft data found");
      return;
    }

    // Use fresh data for all calculations
    const alreadyPicked = freshDraftData.selectedTeams[pickingUserId] || [];
    if (alreadyPicked.length >= 7) return;

    // Verify this user should actually be picking right now
    const expectedCurrentPicker = getCurrentPicker(freshDraftData.draftOrder, freshDraftData.currentPickIndex);
    if (!isAutoPick && expectedCurrentPicker !== pickingUserId) {
      console.warn(`Pick rejected: Expected ${expectedCurrentPicker} but ${pickingUserId} tried to pick`);
      alert("It's not your turn! The draft may have updated. Please refresh the page.");
      return;
    }

    const newSelected = {
      ...freshDraftData.selectedTeams,
      [pickingUserId]: [...alreadyPicked, teamName]
    };

    const newAvailable = freshDraftData.availableTeams.filter(t => t !== teamName);
    const newIndex = freshDraftData.currentPickIndex + 1;

    const totalPicks = Object.values(newSelected).reduce((sum, picks) => sum + picks.length, 0);
    const totalRequiredPicks = freshDraftData.draftOrder.length * 7;
    const draftComplete = totalPicks >= totalRequiredPicks;

    const updateData = {
      selectedTeams: newSelected,
      availableTeams: newAvailable,
      currentPickIndex: newIndex,
      draftComplete
    };

    // Set new pick start time if not complete
    if (!draftComplete && leagueData?.draftType === "live") {
      updateData.currentPickStartTime = serverTimestamp();
    }

    await updateDoc(draftRef, updateData);

    // Update member lineup
    const memberRef = doc(db, "leagues", leagueId, "members", pickingUserId);
    await updateDoc(memberRef, {
      "lineup.drafted": arrayUnion(teamName)
    });

    if (draftComplete) {
      // Auto-complete the draft
      await completeDraft(newSelected);
    }

    if (isAutoPick) {
      console.log(`Auto-picked ${teamName} for ${userMap[pickingUserId]?.displayName}`);
    }
  };

  const completeDraft = async (selectedTeams) => {
    try {
      // Update all member lineups with starters and bench
      const updates = Object.entries(selectedTeams).map(async ([uid, teams]) => {
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

      // Mark league as draft complete
      await updateDoc(doc(db, "leagues", leagueId), {
        draftComplete: true
      });

      console.log("✅ Draft completed automatically!");

      // Show completion message and prompt to go to lineup
      setTimeout(() => {
        const goToLineup = window.confirm(
          "🎉 Draft Complete! 🎉\n\n" +
          "All teams have been drafted and your lineup has been set.\n\n" +
          "Would you like to go to your lineup page to review and manage your team?"
        );

        if (goToLineup) {
          // Navigate to lineup page - this will also refresh the navbar
          window.location.href = `/leagues/${leagueId}/lineup`;
        }
      }, 1000); // Small delay to let the final pick show in the UI

    } catch (err) {
      console.error("Error completing draft:", err);
    }
  };

  const handleStartDraftEarly = async () => {
    const timeLeft = formatCountdown(draftCountdown);
    const confirmEarly = window.confirm(
      `Are you sure you want to start the draft early?\n\n` +
      `Scheduled time: ${leagueData?.draftDate?.toDate().toLocaleString("en-US", {
        timeZone: "America/New_York",
        weekday: "long",
        month: "long", 
        day: "numeric",
        hour: "numeric", 
        minute: "2-digit",
        timeZoneName: "short"
      })}\n\n` +
      `Time remaining: ${timeLeft}\n\n` +
      `This will start the draft immediately for all managers.`
    );

    if (confirmEarly) {
      await handleStartDraft();
    }
  };

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

      const allTeamsSnap = await getDocs(collection(db, "teams"));

      const allTeams = allTeamsSnap.docs
        .map(doc => {
          const data = doc.data();
          if (!data.school || typeof data.school !== "string" || data.classification?.toLowerCase() !== "fbs") {
            console.warn("❌ Skipping invalid team:", data);
            return null;
          }
          return data;
        })
        .filter(Boolean);

      if (allTeams.length === 0) {
        alert("⚠️ No valid FBS teams with names found. Check your /teams collection in Firestore.");
        return;
      }

      const teamNames = allTeams.map(team => team.school);
      
      const managerOrder = Object.keys(userMap).filter(Boolean);
      
      console.log("✅ Manager order:", managerOrder);
      console.log("✅ Available FBS teams:", teamNames);

      const draftPayload = {
        draftOrder: managerOrder, // Keep simple manager list for DraftBoard compatibility
        currentPickIndex: 0,
        availableTeams: teamNames,
        selectedTeams: {},
        draftComplete: false,
        currentPickStartTime: serverTimestamp()
      };

      const draftRef = doc(db, "leagues", leagueId, "meta", "draft");
      await setDoc(draftRef, draftPayload);
      alert("Live draft started!");

    } catch (err) {
      console.error("❌ Failed to start draft:", err);
      alert("Error starting draft: " + err.message);
    }
  };

  const handleStartManualDraft = async () => {
    if (!leagueId || Object.keys(userMap).length === 0) return;

    try {
      const manualDraftPayload = {
        type: "manual",
        inProgress: true,
        managersCompleted: [],
        currentManager: null,
        teams: {},
        draftComplete: false
      };

      const draftRef = doc(db, "leagues", leagueId, "meta", "draft");
      await setDoc(draftRef, manualDraftPayload);
      alert("Manual draft entry started!");

    } catch (err) {
      console.error("❌ Failed to start manual draft:", err);
      alert("Error starting manual draft: " + err.message);
    }
  };

  const handleRestartDraft = async () => {
    const confirm = window.confirm("Are you sure you want to delete and restart the draft?");
    if (!confirm) return;

    try {
      // Clear timers
      if (timerInterval) {
        clearInterval(timerInterval);
        setTimerInterval(null);
      }
      if (countdownInterval) {
        clearInterval(countdownInterval);
        setCountdownInterval(null);
      }

      const draftRef = doc(db, "leagues", leagueId, "meta", "draft");
      await deleteDoc(draftRef);

      const leagueRef = doc(db, "leagues", leagueId);
      await updateDoc(leagueRef, {
        draftComplete: false
      });

      const membersRef = collection(db, "leagues", leagueId, "members");
      const membersSnap = await getDocs(membersRef);

      const resets = membersSnap.docs.map(async (docSnap) => {
        const memberRef = docSnap.ref;
        await updateDoc(memberRef, {
          "lineup.drafted": [],
          "lineup.starters": [],
          "lineup.bench": []
        });
      });

      await Promise.all(resets);

      alert("Draft has been reset. All member teams have been cleared.");
    } catch (err) {
      console.error("Failed to reset draft:", err);
      alert("Error resetting draft: " + err.message);
    }
  };

  const handlePick = async () => {
    if (!teamPick || !draftData) return;

    await performPick(teamPick, userId);
    setTeamPick("");
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatCountdown = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  };

  const currentCount = Object.keys(userMap).length;
  const missing = maxManagers ? maxManagers - currentCount : 0;
  const isFull = missing === 0;
  const isManualDraft = leagueData?.draftType === "manual";

  if (loading || Object.keys(userMap).length === 0) {
    return <p>Loading draft room...</p>;
  }

  // Manual Draft Flow
  if (isManualDraft) {
    if (!draftData) {
      return (
        <div>
          <LeagueNavBar />
          <h2>Draft Room - Manual Draft</h2>
          <p>Manual draft: Commissioner will enter team selections after offline draft.</p>

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
            <div>
              <p>All managers have joined. You can now enter the draft results.</p>
              <button onClick={handleStartManualDraft}>Enter Draft Results</button>
            </div>
          )}

          {!isLeagueAdmin && isFull && (
            <p>All managers have joined. Waiting for commissioner to enter draft results.</p>
          )}
        </div>
      );
    }

    // Manual draft in progress or complete - check if it's actually a manual draft
    if (draftData.type === "manual" || (draftData.inProgress !== undefined && draftData.teams !== undefined)) {
      return (
        <div>
          <LeagueNavBar />
          <h2>Draft Room - Manual Draft</h2>
          
          {isLeagueAdmin && (
            <button onClick={handleRestartDraft} style={{ marginTop: "1rem", color: "red" }}>
              Restart Draft
            </button>
          )}

          {draftData.draftComplete ? (
            <div>
              <p style={{ color: "green", fontWeight: "bold" }}>✅ Draft Complete!</p>
              <h3>Final Results</h3>
              {Object.entries(draftData.teams || {}).map(([uid, teams]) => (
                <div key={uid} style={{ marginBottom: "1rem", padding: "1rem", border: "1px solid #ddd" }}>
                  <h4>{userMap[uid]?.displayName} ({userMap[uid]?.teamName})</h4>
                  <p><strong>Starters:</strong> {teams.slice(0, 5).join(", ")}</p>
                  <p><strong>Bench:</strong> {teams.slice(5).join(", ")}</p>
                </div>
              ))}
            </div>
          ) : (
            <div>
              {isLeagueAdmin ? (
                <ManualDraftEntry 
                  leagueId={leagueId}
                  userMap={userMap}
                  draftData={draftData}
                />
              ) : (
                <div>
                  <p>Commissioner is entering draft results...</p>
                  <p>Progress: {(draftData.managersCompleted || []).length} of {Object.keys(userMap).length} managers completed</p>
                </div>
              )}
            </div>
          )}
        </div>
      );
    }
    
    // If we have draft data but it's not manual format, treat as if no draft started
    return (
      <div>
        <LeagueNavBar />
        <h2>Draft Room - Manual Draft</h2>
        <p>Manual draft: Commissioner will enter team selections after offline draft.</p>
        <p style={{ color: "red" }}>Found incompatible draft data. Please restart the draft.</p>
        
        {isLeagueAdmin && (
          <button onClick={handleRestartDraft} style={{ color: "red", marginTop: "1rem" }}>
            Clear Draft Data
          </button>
        )}
      </div>
    );
  }

  // Live Draft Flow (existing logic)
  if (!draftData) {
    return (
      <div>
        <LeagueNavBar />
        <h2>Draft Room - Live Draft</h2>
        
        {/* Pre-Draft Countdown */}
        {draftCountdown > 0 && (
          <div style={{ 
            padding: "1.5rem", 
            backgroundColor: "#e3f2fd", 
            border: "2px solid #2196f3", 
            borderRadius: "8px", 
            marginBottom: "1rem",
            textAlign: "center"
          }}>
            <h2 style={{ margin: "0 0 0.5rem 0", color: "#1976d2" }}>
              🚀 Draft starts in: {formatCountdown(draftCountdown)}
            </h2>
            <p style={{ margin: 0, color: "#1565c0" }}>
              Scheduled for: {leagueData?.draftDate?.toDate().toLocaleString("en-US", {
                timeZone: "America/New_York",
                weekday: "long",
                year: "numeric", 
                month: "long", 
                day: "numeric",
                hour: "numeric", 
                minute: "2-digit",
                timeZoneName: "short"
              })}
            </p>
            {draftCountdown <= 60 && (
              <p style={{ margin: "0.5rem 0 0 0", color: "#d32f2f", fontWeight: "bold" }}>
                ⚠️ Get ready! Draft starting soon!
              </p>
            )}
          </div>
        )}

        {draftCountdown === 0 && leagueData?.draftDate && (
          <div style={{ 
            padding: "1rem", 
            backgroundColor: "#c8e6c9", 
            border: "2px solid #4caf50", 
            borderRadius: "8px", 
            marginBottom: "1rem",
            textAlign: "center"
          }}>
            <h3 style={{ margin: "0", color: "#388e3c" }}>
              🎯 Draft time has arrived!
            </h3>
          </div>
        )}

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
          <div>
            <button onClick={draftCountdown > 0 ? handleStartDraftEarly : handleStartDraft}>
              {draftCountdown > 0 ? "Start Draft Early" : "Start Live Draft"}
            </button>
            {draftCountdown > 0 && (
              <p style={{ fontSize: "0.9em", color: "#666", marginTop: "0.5rem" }}>
                Or wait for automatic start when countdown reaches zero
              </p>
            )}
          </div>
        )}

        {!isLeagueAdmin && isFull && draftCountdown === 0 && (
          <p>All managers have joined. Waiting for commissioner to start the draft.</p>
        )}
      </div>
    );
  }

  const isMyTurn = draftData && draftData.draftOrder 
    ? getCurrentPicker(draftData.draftOrder, draftData.currentPickIndex) === userId 
    : false;
  
  const disableDrafting = draftData?.draftComplete || !isMyTurn;
  
  const currentUid = draftData && draftData.draftOrder
    ? getCurrentPicker(draftData.draftOrder, draftData.currentPickIndex)
    : null;
    
  const currentManager = currentUid ? userMap[currentUid] : null;

  return (
    <div>
      <LeagueNavBar />
      <h2>Draft Room - Live Draft</h2>
      <p><strong>League ID:</strong> {leagueId}</p>

      {isLeagueAdmin && draftData && (
        <button onClick={handleRestartDraft} style={{ marginTop: "1rem", color: "red" }}>
          Restart Draft
        </button>
      )}

      {draftData.draftComplete && (
        <p style={{ color: "green", fontWeight: "bold" }}>✅ Draft Complete!</p>
      )}

      {/* Timer Display */}
      {!draftData.draftComplete && timeRemaining > 0 && (
        <div style={{ 
          padding: "1rem", 
          backgroundColor: "#fff3cd", 
          border: "1px solid #ffeaa7", 
          borderRadius: "4px", 
          marginBottom: "1rem",
          textAlign: "center"
        }}>
          <h3 style={{ margin: "0 0 0.5rem 0", color: "#856404" }}>
            Time Remaining: {formatTime(timeRemaining)}
          </h3>
          {timeRemaining <= 30 && (
            <p style={{ margin: 0, color: "#d63031", fontWeight: "bold" }}>
              ⚠️ Auto-pick in {timeRemaining} seconds!
            </p>
          )}
        </div>
      )}

      {isMyTurn ? (
        <p>It's <strong>your</strong> turn</p>
      ) : currentManager ? (
        <p>It's <strong>{currentManager.displayName}</strong>'s turn</p>
      ) : (
        <p>Determining next pick...</p>
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