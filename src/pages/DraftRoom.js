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
import { useParams, useNavigate, Link } from "react-router-dom";
import BottomNavBar from "../components/BottomNavBar";

function DraftRoom() {
  const { leagueId } = useParams();
  const navigate = useNavigate();
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
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [allTeams, setAllTeams] = useState ({});
  const [userFirstNames, setUserFirstNames] = useState({});

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
      const firstNameMap = {};

      // Fetch both member data and user first names
      await Promise.all(
        membersSnap.docs.map(async (memberDoc) => {
          const data = memberDoc.data();
          nameMap[memberDoc.id] = {
            displayName: data.displayName || data.email || "Unknown",
            teamName: data.teamName || "Unnamed Team"
          };

          // Fetch first name from user document
          try {
            const userDoc = await getDoc(doc(db, "users", memberDoc.id));
            
            if (userDoc.exists()) {
              const userData = userDoc.data();
              firstNameMap[memberDoc.id] = userData.firstName || userData.displayName || "Unknown";
            } else {
              firstNameMap[memberDoc.id] = data.displayName || "Unknown";
            }
          } catch (error) {
            firstNameMap[memberDoc.id] = data.displayName || "Unknown";
          }
        })
      );

      setUserMap(nameMap);
      setUserFirstNames(firstNameMap);

      const teamsSnap = await getDocs(collection(db, "teams"));
        const teamDataMap = {};

        teamsSnap.forEach(doc => {
          teamDataMap[doc.id] = doc.data();
        });

        setAllTeams(teamDataMap);

      const draftRef = doc(db, "leagues", leagueId, "meta", "draft");
      onSnapshot(draftRef, (snap) => {
        const data = snap.data();
        const newDraftData = data || null;
        
        // Check if draft just completed
        if (newDraftData?.draftComplete && (!draftData || !draftData.draftComplete)) {
          setShowCompletionModal(true);
        }
        
        setDraftData(newDraftData);
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
            // ✅ CLEAR INTERVAL FIRST to prevent multiple calls
            clearInterval(interval);
            setTimerInterval(null);
            
            // Time's up - auto-pick best team
            handleAutoPick();
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

    // ✅ RACE CONDITION PROTECTION: Prevent multiple autopicks
    if (window.autoPickInProgress) {
      console.log("🚫 Auto-pick already in progress, skipping...");
      return;
    }
    
    window.autoPickInProgress = true;

    try {
      const currentIndex = draftData.currentPickIndex;
      const draftOrder = draftData.draftOrder;
      
      // Use snake draft logic to get current picker
      const currentUid = getCurrentPicker(draftOrder, currentIndex);
      const availableTeamIds = draftData.availableTeams; // These are document IDs
      
      if (!currentUid || availableTeamIds.length === 0) {
        console.error("Auto-pick failed - no current UID or no available teams");
        return;
      }

      // ✅ CHECK: Make sure user doesn't already have 7 teams
      const currentUserTeams = draftData.selectedTeams[currentUid] || [];
      if (currentUserTeams.length >= 7) {
        console.log(`🚫 User ${currentUid} already has 7 teams, skipping auto-pick`);
        return;
      }

      // ✅ FIXED: Use allTeams state instead of fetching again, and use document IDs
      const teamRankings = {};
      
      // Map document IDs to their philMetricDraftRank scores using allTeams state
      availableTeamIds.forEach(teamId => {
        const teamData = allTeams[teamId];
        if (teamData && teamData.philMetricDraftRank !== undefined) {
          teamRankings[teamId] = teamData.philMetricDraftRank;
        }
      });

      // Filter available teams and sort by philMetricDraftRank (lowest = best)
      const availableTeamsWithRanks = availableTeamIds
        .map(teamId => ({
          id: teamId,
          rank: teamRankings[teamId] || 999 // Default high rank if not found
        }))
        .sort((a, b) => a.rank - b.rank); // Sort ascending (lower rank = better)

      // Pick the best available team (lowest philMetricDraftRank)
      const bestTeam = availableTeamsWithRanks[0];
      const teamData = allTeams[bestTeam.id];
      const teamDisplayName = teamData?.school || bestTeam.id;
      
      console.log(`🤖 Auto-picking best available team: ${teamDisplayName} (rank: ${bestTeam.rank}) for ${userMap[currentUid]?.displayName}`);
      
      // ✅ Use the document ID (bestTeam.id) for the pick
      await performPick(bestTeam.id, currentUid, true);

    } catch (error) {
      console.error("Error in smart auto-pick, falling back to random:", error);
      
      // Fallback to random selection if something goes wrong
      const availableTeamIds = draftData.availableTeams;
      if (availableTeamIds.length > 0) {
        const randomTeam = availableTeamIds[Math.floor(Math.random() * availableTeamIds.length)];
        await performPick(randomTeam, getCurrentPicker(draftData.draftOrder, draftData.currentPickIndex), true);
      }
    } finally {
      // ✅ CLEANUP: Always clear the flag
      window.autoPickInProgress = false;
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

    // ✅ DUPLICATE CHECK: Prevent same team being picked twice by same user
    if (alreadyPicked.includes(teamName)) {
      console.warn(`Team ${teamName} already picked by ${pickingUserId}. Skipping duplicate.`);
      return;
    }

    // ✅ AVAILABILITY CHECK: Make sure team is still available
    if (!freshDraftData.availableTeams.includes(teamName)) {
      console.warn(`Team ${teamName} is no longer available. Skipping.`);
      return;
    }

    // Verify this user should actually be picking right now
    const expectedCurrentPicker = getCurrentPicker(freshDraftData.draftOrder, freshDraftData.currentPickIndex);
    if (!isAutoPick && expectedCurrentPicker !== pickingUserId) {
      console.warn(`Pick rejected: Expected ${expectedCurrentPicker} but ${pickingUserId} tried to pick`);
      alert("It's not your turn! The draft may have updated. Please refresh the page.");
      return;
    }

    // ✅ FIXED: Use teamName directly without transformation
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

    console.log(`✅ Making pick: ${teamName} for ${userMap[pickingUserId]?.displayName} (Pick ${newIndex})`);

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

    // ✅ FIXED: Properly filter for FBS teams and use their document IDs
    const teamNames = allTeamsSnap.docs
      .filter(doc => {
        const data = doc.data();
        return data.school && 
              typeof data.school === "string" && 
              data.classification?.toLowerCase() === "fbs";
      })
      .map(doc => doc.id); // Use the document ID (which should match school name)

    if (teamNames.length === 0) {
      alert("⚠️ No valid FBS teams found. Check your /teams collection in Firestore.");
      return;
    }
    
    // ✅ Use custom draft order if admin set it, otherwise use random order
    let managerOrder;
    
    if (leagueData.draftOrderType === "admin" && leagueData.customDraftOrder && leagueData.customDraftOrder.length > 0) {
      // Use the custom order set by admin
      managerOrder = leagueData.customDraftOrder;
      console.log("✅ Using admin-set draft order:", managerOrder);
    } else if (leagueData.draftOrderType === "random") {
      // Randomize the order
      managerOrder = Object.keys(userMap).filter(Boolean).sort(() => Math.random() - 0.5);
      console.log("✅ Using randomized draft order:", managerOrder);
    } else {
      // Fallback to current userMap order
      managerOrder = Object.keys(userMap).filter(Boolean);
      console.log("✅ Using fallback draft order:", managerOrder);
    }
    
    console.log("✅ Manager order:", managerOrder);
    console.log("✅ Available FBS teams:", teamNames);

    const draftPayload = {
      draftOrder: managerOrder,
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

      // Close completion modal if open
      setShowCompletionModal(false);

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

  const handleGoToLineup = () => {
    setShowCompletionModal(false);
    navigate(`/${leagueId}/my-lineup`);
  };

  const handleCloseModal = () => {
    setShowCompletionModal(false);
  };

  const handleLogout = async () => {
    if (window.confirm("Are you sure you want to log out?")) {
      try {
        await auth.signOut();
        navigate("/");
      } catch (err) {
        console.error("Logout error:", err);
      }
    }
  };

  const currentCount = Object.keys(userMap).length;
  const missing = maxManagers ? maxManagers - currentCount : 0;
  const isFull = missing === 0;
  const isManualDraft = leagueData?.draftType === "manual";

  if (loading || Object.keys(userMap).length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-4 sm:left-10 w-48 sm:w-72 h-48 sm:h-72 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full blur-3xl animate-pulse"></div>
        </div>
        <div className="relative z-10 flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="text-4xl mb-4 animate-spin">⚡</div>
            <p className="text-xl text-white/80">Loading league...</p>
          </div>
        </div>
      </div>
    );
  }

// Manual Draft Flow
if (isManualDraft) {
  if (!draftData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white">
        {/* Animated Background Elements */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-4 sm:left-10 w-48 sm:w-72 h-48 sm:h-72 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute bottom-20 right-4 sm:right-10 w-56 sm:w-96 h-56 sm:h-96 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full blur-3xl animate-pulse delay-1000"></div>
        </div>

        <BottomNavBar leagueId={leagueId} isDraftComplete={false} />

        {/* Navigation */}
        <nav className="relative z-10 flex justify-between items-center p-4 sm:p-6 lg:p-8">
          <Link to="/home" className="flex items-center space-x-3">
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-r from-purple-500 to-blue-500 rounded-lg flex items-center justify-center font-bold text-lg sm:text-xl">
              L
            </div>
            <span className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
              Lineup
            </span>
          </Link>
          <div className="flex items-center space-x-4">
            <button 
              onClick={handleLogout}
              className="px-4 py-2 text-sm sm:text-base text-white/80 hover:text-white transition-colors duration-300 font-medium"
            >
              Logout
            </button>
          </div>
        </nav>

        {/* Main Content */}
            <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 py-4 pb-24">
            <div className="text-center mb-8">
            <div className="mb-4">
              <span className="inline-block text-4xl sm:text-5xl mb-2">📝</span>
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black mb-2 leading-tight">
              <span className="bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
                Draft Room
              </span>
            </h1>
            <p className="text-xl sm:text-2xl font-semibold text-white mb-4">
              {leagueData?.name || "Unnamed League"}
            </p>
            <p className="text-lg sm:text-xl text-white/80">
              Manual Draft • {Object.keys(userMap).length} managers joined
            </p>
            <p className="text-sm sm:text-base text-white/60">
              Commissioner will enter draft results after offline draft
            </p>
          </div>

          {/* League Status */}
          {!isFull ? (
            <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 sm:p-8 border border-white/20 mb-8">
              <div className="text-center mb-6">
                <div className="text-3xl mb-4">👥</div>
                <h3 className="text-xl sm:text-2xl font-bold text-white mb-4">
                  Waiting for Players
                </h3>
                <div className="bg-amber-500/20 border border-amber-400/30 rounded-xl p-4 mb-6">
                  <p className="text-amber-200 font-semibold text-lg">
                    🟡 Waiting for {missing} more manager{missing !== 1 ? 's' : ''} to join
                  </p>
                </div>
              </div>

              <h4 className="text-lg font-bold text-white mb-4">
                Current Members ({Object.keys(userMap).length}/{maxManagers})
              </h4>

              <div className="grid gap-3">
                {Object.values(userMap).map((user, i) => (
                  <div key={i} className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full flex items-center justify-center text-white font-bold">
                        {i + 1}
                      </div>
                      <div>
                        <div className="font-semibold text-white">
                          {user.displayName}
                        </div>
                        <div className="text-sm text-white/70">
                          {user.teamName}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 sm:p-8 border border-white/20 mb-8">
              <div className="text-center">
                <div className="text-4xl sm:text-5xl mb-4">✅</div>
                <h3 className="text-xl sm:text-2xl font-bold text-white mb-4">
                  All Managers Ready!
                </h3>
                <div className="bg-green-500/20 border border-green-400/30 rounded-xl p-4 mb-6">
                  <p className="text-green-200 font-semibold text-lg">
                    League is full with {Object.keys(userMap).length} managers
                  </p>
                </div>

                {isLeagueAdmin ? (
                  <div className="space-y-4">
                    <p className="text-white/80 text-lg">
                      Ready to enter draft results from your offline draft.
                    </p>
                    <button 
                      onClick={handleStartManualDraft}
                      className="w-full sm:w-auto px-8 py-4 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 rounded-xl text-lg font-bold transition-all duration-300 transform hover:scale-105 shadow-2xl hover:shadow-green-500/40"
                    >
                      📝 Enter Draft Results
                    </button>
                  </div>
                ) : (
                  <p className="text-white/80 text-lg">
                    Waiting for commissioner to enter draft results...
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Info Card */}
          <div className="bg-blue-500/20 border border-blue-400/30 rounded-2xl p-6">
            <div className="text-center">
              <h4 className="text-lg font-semibold text-blue-200 mb-3">
                How Manual Draft Works
              </h4>
              <div className="text-blue-200 text-sm space-y-2 leading-relaxed">
                <p>• Conduct your draft offline with friends</p>
                <p>• Each manager drafts 7 college teams (5 starters + 2 bench)</p>
                <p>• Commissioner enters all results into the system</p>
                <p>• Teams earn points when they win games</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Manual draft in progress or complete
  if (draftData.type === "manual" || (draftData.inProgress !== undefined && draftData.teams !== undefined)) {
    return (
      <div style={{ backgroundColor: "#f8fafc", minHeight: "100vh" }}>
        <BottomNavBar leagueId={leagueId} isDraftComplete={draftData?.draftComplete || false} />

        {/* Header - Same as Live Draft */}
        <div style={{ 
          padding: "20px 16px 16px 16px",
          background: "linear-gradient(135deg, #1e40af 0%, #0ea5e9 100%)",
          color: "white"
        }}>
          <h1 style={{ 
            fontSize: "24px", 
            fontWeight: "700", 
            margin: "0 0 8px 0",
            textAlign: "center"
          }}>
            Manual Draft Entry
          </h1>
          <p style={{
            fontSize: "14px",
            opacity: "0.9",
            textAlign: "center",
            margin: 0
          }}>
            {draftData.draftComplete ? "Draft Complete" : "Commissioner entering results"}
          </p>
        </div>

        {/* Admin Controls Bar - Same as Live Draft */}
        {isLeagueAdmin && (
          <div style={{
            backgroundColor: "white",
            borderBottom: "1px solid #e2e8f0",
            padding: "12px 16px",
            display: "flex",
            justifyContent: "center"
          }}>
            <button 
              onClick={handleRestartDraft}
              style={{
                backgroundColor: "#dc2626",
                color: "white",
                border: "none",
                borderRadius: "8px",
                padding: "8px 16px",
                fontSize: "14px",
                fontWeight: "600",
                cursor: "pointer",
                boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
                transition: "all 0.2s ease"
              }}
              onMouseEnter={(e) => {
                e.target.style.backgroundColor = "#b91c1c";
                e.target.style.transform = "translateY(-1px)";
                e.target.style.boxShadow = "0 4px 12px rgba(220, 38, 38, 0.3)";
              }}
              onMouseLeave={(e) => {
                e.target.style.backgroundColor = "#dc2626";
                e.target.style.transform = "translateY(0)";
                e.target.style.boxShadow = "0 1px 3px rgba(0, 0, 0, 0.1)";
              }}
            >
              🔄 Restart Draft
            </button>
          </div>
        )}

        {/* Content Area */}
        <div style={{ padding: "16px" }}>
          
          {draftData.draftComplete ? (
            <>
              <div style={{
                backgroundColor: "#d1fae5",
                border: "1px solid #10b981",
                borderRadius: "8px",
                padding: "12px 16px",
                marginBottom: "16px",
                textAlign: "center"
              }}>
                <p style={{ 
                  color: "#065f46", 
                  fontWeight: "bold", 
                  margin: 0,
                  fontSize: "16px"
                }}>
                  ✅ Manual Draft Complete!
                </p>
              </div>

              {/* Use DraftBoard for completed manual draft display */}
              <DraftBoard draftData={draftData} userMap={userMap} allTeams={allTeams} />
            </>
          ) : (
            <div style={{
              backgroundColor: "white",
              borderRadius: "12px",
              padding: "20px",
              boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
              border: "1px solid #e2e8f0"
            }}>
              {isLeagueAdmin ? (
                <>
                  <h3 style={{
                    fontSize: "18px",
                    fontWeight: "700",
                    color: "#1e293b",
                    margin: "0 0 16px 0"
                  }}>
                    Enter Draft Results
                  </h3>
                  <ManualDraftEntry 
                    leagueId={leagueId}
                    userMap={userMap}
                    draftData={draftData}
                  />
                </>
              ) : (
                <div style={{ textAlign: "center", padding: "40px 20px" }}>
                  <div style={{
                    fontSize: "48px",
                    marginBottom: "16px"
                  }}>
                    ⏳
                  </div>
                  <h3 style={{
                    fontSize: "18px",
                    fontWeight: "700",
                    color: "#1e293b",
                    margin: "0 0 8px 0"
                  }}>
                    Commissioner is entering draft results...
                  </h3>
                  <p style={{
                    fontSize: "14px",
                    color: "#64748b",
                    margin: 0
                  }}>
                    Progress: {(draftData.managersCompleted || []).length} of {Object.keys(userMap).length} managers completed
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }
  
  // If we have draft data but it's not manual format, treat as error
  return (
    <div style={{ backgroundColor: "#f8fafc", minHeight: "100vh" }}>
      <BottomNavBar leagueId={leagueId} isDraftComplete={false} />

      {/* Header - Error State */}
      <div style={{ 
        padding: "20px 16px 16px 16px",
        background: "linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)",
        color: "white"
      }}>
        <h1 style={{ 
          fontSize: "24px", 
          fontWeight: "700", 
          margin: "0 0 8px 0",
          textAlign: "center"
        }}>
          Draft Data Error
        </h1>
        <p style={{
          fontSize: "14px",
          opacity: "0.9",
          textAlign: "center",
          margin: 0
        }}>
          Incompatible draft data found
        </p>
      </div>

      {/* Content Area */}
      <div style={{ padding: "16px" }}>
        <div style={{
          backgroundColor: "white",
          borderRadius: "12px",
          padding: "20px",
          boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
          border: "1px solid #e2e8f0",
          textAlign: "center"
        }}>
          <div style={{
            backgroundColor: "#fef2f2",
            border: "1px solid #ef4444",
            borderRadius: "8px",
            padding: "16px",
            marginBottom: "16px"
          }}>
            <p style={{
              color: "#dc2626",
              fontWeight: "600",
              margin: "0 0 8px 0"
            }}>
              ⚠️ Found incompatible draft data
            </p>
            <p style={{
              color: "#991b1b",
              fontSize: "14px",
              margin: 0
            }}>
              Please restart the draft to continue.
            </p>
          </div>
          
          {isLeagueAdmin && (
            <button 
              onClick={handleRestartDraft}
              style={{
                backgroundColor: "#dc2626",
                color: "white",
                border: "none",
                borderRadius: "8px",
                padding: "12px 24px",
                fontSize: "16px",
                fontWeight: "600",
                cursor: "pointer",
                boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
                transition: "all 0.2s ease"
              }}
              onMouseEnter={(e) => {
                e.target.style.backgroundColor = "#b91c1c";
                e.target.style.transform = "translateY(-1px)";
                e.target.style.boxShadow = "0 4px 12px rgba(220, 38, 38, 0.3)";
              }}
              onMouseLeave={(e) => {
                e.target.style.backgroundColor = "#dc2626";
                e.target.style.transform = "translateY(0)";
                e.target.style.boxShadow = "0 1px 3px rgba(0, 0, 0, 0.1)";
              }}
            >
              🗑️ Clear Draft Data
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Live Draft Flow (existing logic)
if (!draftData) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white">
      {/* Animated Background Elements */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-20 left-4 sm:left-10 w-48 sm:w-72 h-48 sm:h-72 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-20 right-4 sm:right-10 w-56 sm:w-96 h-56 sm:h-96 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full blur-3xl animate-pulse delay-1000"></div>
      </div>

      <BottomNavBar leagueId={leagueId} isDraftComplete={false} />

      {/* Navigation */}
      <nav className="relative z-10 flex justify-between items-center p-4 sm:p-6 lg:p-8">
        <Link to="/home" className="flex items-center space-x-3">
          <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-r from-purple-500 to-blue-500 rounded-lg flex items-center justify-center font-bold text-lg sm:text-xl">
            L
          </div>
          <span className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
            Lineup
          </span>
        </Link>
        <div className="flex items-center space-x-4">
          <button 
            onClick={handleLogout}
            className="px-4 py-2 text-sm sm:text-base text-white/80 hover:text-white transition-colors duration-300 font-medium"
          >
            Logout
          </button>
        </div>
      </nav>

      {/* Main Content */}
        <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 py-4 sm:py-8 pb-24">          {/* Header */}
        <div className="text-center mb-8">
          <div className="mb-4">
            <span className="inline-block text-4xl sm:text-5xl mb-2">🚀</span>
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black mb-2 leading-tight">
            <span className="bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
              Draft Room
            </span>
          </h1>
          <p className="text-xl sm:text-2xl font-semibold text-white mb-4">
            {leagueData?.name || "Unnamed League"}
          </p>
          <p className="text-lg sm:text-xl text-white/80">
            Live Draft • {Object.keys(userMap).length} managers joined
          </p>
        </div>

        {/* Pre-Draft Countdown */}
        {draftCountdown > 0 && (
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 sm:p-8 border border-white/20 mb-8">
            <div className="text-center">
              <div className="text-4xl sm:text-5xl mb-4">⏰</div>
                <h2 className="text-xl sm:text-2xl font-bold mb-4 text-white">
                  Draft starts in: {formatCountdown(draftCountdown)}
                </h2>
              <div className="bg-blue-500/20 border border-blue-400/30 rounded-xl p-4 mb-4">
                <p className="text-blue-200 text-sm sm:text-base">
                  <strong>Scheduled for:</strong><br />
                  {leagueData?.draftDate?.toDate().toLocaleString("en-US", {
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
              </div>
              {draftCountdown <= 60 && (
                <div className="bg-amber-500/20 border border-amber-400/30 rounded-xl p-4">
                  <p className="text-amber-200 font-bold">
                    ⚠️ Get ready! Draft starting soon!
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Draft Time Arrived */}
        {draftCountdown === 0 && leagueData?.draftDate && (
          <div className="bg-green-500/20 border border-green-400/30 rounded-2xl p-6 mb-8">
            <div className="text-center">
              <div className="text-4xl mb-4">🎯</div>
              <h3 className="text-2xl font-bold text-green-200">
                Draft time has arrived!
              </h3>
            </div>
          </div>
        )}

        {/* League Status */}
        {!isFull ? (
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 sm:p-8 border border-white/20 mb-8">
            <div className="text-center mb-6">
              <div className="text-3xl mb-4">👥</div>
              <h3 className="text-xl sm:text-2xl font-bold text-white mb-2">
                Waiting for Players
              </h3>
              <div className="bg-amber-500/20 border border-amber-400/30 rounded-xl p-4">
                <p className="text-amber-200 font-semibold">
                  🟡 Waiting for {missing} more manager{missing !== 1 ? 's' : ''} to join
                </p>
              </div>
            </div>

            <h4 className="text-lg font-bold text-white mb-4">
              Current Members ({Object.keys(userMap).length}/{maxManagers})
            </h4>

            <div className="grid gap-3">
              {Object.values(userMap).map((user, i) => (
                <div key={i} className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full flex items-center justify-center text-white font-bold">
                      {i + 1}
                    </div>
                    <div>
                      <div className="font-semibold text-white">
                        {user.displayName}
                      </div>
                      <div className="text-sm text-white/70">
                        {user.teamName}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 sm:p-8 border border-white/20 mb-8">
            <div className="text-center">
              <div className="text-4xl sm:text-5xl mb-4">✅</div>
              <h3 className="text-xl sm:text-2xl font-bold text-white mb-4">
                All Managers Ready!
              </h3>
              <div className="bg-green-500/20 border border-green-400/30 rounded-xl p-4 mb-6">
                <p className="text-green-200 font-semibold">
                  League is full with {Object.keys(userMap).length} managers
                </p>
              </div>

              {isLeagueAdmin && (
                <div className="space-y-4">
                  <p className="text-white/80">
                    Ready to start the draft?
                  </p>
                  <button 
                    onClick={draftCountdown > 0 ? handleStartDraftEarly : handleStartDraft}
                    className="w-full sm:w-auto px-8 py-4 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 rounded-xl text-lg font-bold transition-all duration-300 transform hover:scale-105 shadow-2xl hover:shadow-green-500/40"
                  >
                    {draftCountdown > 0 ? "🚀 Start Draft Early" : "🚀 Start Live Draft"}
                  </button>
                  {draftCountdown > 0 && (
                    <p className="text-sm text-white/60 mt-2">
                      Or wait for automatic start when countdown reaches zero
                    </p>
                  )}
                </div>
              )}

              {!isLeagueAdmin && isFull && draftCountdown === 0 && (
                <p className="text-white/80">
                  All managers have joined. Waiting for commissioner to start the draft.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Info Card */}
        <div className="bg-blue-500/20 border border-blue-400/30 rounded-2xl p-6">
          <div className="text-center">
            <h4 className="text-lg font-semibold text-blue-200 mb-3">
              How the Draft Works
            </h4>
            <div className="text-blue-200 text-sm space-y-2 leading-relaxed">
              <p>• Each manager drafts 7 college teams (5 starters + 2 bench)</p>
              <p>• Snake draft order - picks reverse each round</p>
              <p>• {leagueData?.timePerPick || 2} minutes per pick with auto-pick if time expires</p>
              <p>• Teams earn points when they win games</p>
            </div>
          </div>
        </div>
      </div>
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
    
  const currentManager = currentUid ? {
    displayName: userMap[currentUid]?.displayName,
    firstName: userFirstNames[currentUid] // Only use firstName from user doc
  } : null;

  return (
  <div style={{ backgroundColor: "#f8fafc", minHeight: "100vh" }}>
      <BottomNavBar leagueId={leagueId} isDraftComplete={draftData?.draftComplete || false} />

      {/* Header */}
      <div style={{ 
        padding: "20px 16px 16px 16px",
        background: "linear-gradient(135deg, #1e40af 0%, #0ea5e9 100%)",
        color: "white"
      }}>
        <h1 style={{ 
          fontSize: "24px", 
          fontWeight: "700", 
          margin: "0 0 8px 0",
          textAlign: "center"
        }}>
          Draft Room - Live Draft
        </h1>
        <p style={{
          fontSize: "14px",
          opacity: "0.9",
          textAlign: "center",
          margin: "0 0 4px 0"
        }}>
          {Object.keys(userMap).length} managers joined
        </p>
        {leagueId && (
          <p style={{
            fontSize: "12px",
            opacity: "0.8",
            textAlign: "center",
            margin: 0,
            fontFamily: "monospace"
          }}>
            League: {leagueId}
          </p>
        )}
      </div>

      {/* Draft Completion Modal */}
      {showCompletionModal && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(0, 0, 0, 0.7)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: "white",
            padding: "2rem",
            borderRadius: "12px",
            textAlign: "center",
            maxWidth: "500px",
            width: "90%",
            boxShadow: "0 10px 30px rgba(0, 0, 0, 0.3)"
          }}>
            <div style={{ fontSize: "4rem", marginBottom: "1rem" }}>🎉</div>
            <h2 style={{ 
              color: "#2e7d32", 
              marginBottom: "1rem",
              fontSize: "2rem"
            }}>
              Draft Complete!
            </h2>
            <p style={{ 
              fontSize: "1.2rem", 
              marginBottom: "2rem", 
              color: "#424242" 
            }}>
              Congratulations! All teams have been drafted and your lineup has been automatically set.
            </p>
            <div style={{ display: "flex", gap: "1rem", justifyContent: "center" }}>
              <button
                onClick={handleGoToLineup}
                style={{
                  backgroundColor: "#2e7d32",
                  color: "white",
                  border: "none",
                  padding: "12px 24px",
                  borderRadius: "6px",
                  fontSize: "1.1rem",
                  cursor: "pointer",
                  fontWeight: "bold"
                }}
                onMouseOver={(e) => e.target.style.backgroundColor = "#1b5e20"}
                onMouseOut={(e) => e.target.style.backgroundColor = "#2e7d32"}
              >
                Take Me to My Lineup
              </button>
              <button
                onClick={handleCloseModal}
                style={{
                  backgroundColor: "#757575",
                  color: "white",
                  border: "none",
                  padding: "12px 24px",
                  borderRadius: "6px",
                  fontSize: "1.1rem",
                  cursor: "pointer"
                }}
                onMouseOver={(e) => e.target.style.backgroundColor = "#424242"}
                onMouseOut={(e) => e.target.style.backgroundColor = "#757575"}
              >
                Stay Here
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin Controls Bar */}
      {isLeagueAdmin && draftData && (
        <div style={{
          backgroundColor: "white",
          borderBottom: "1px solid #e2e8f0",
          padding: "12px 16px",
          display: "flex",
          justifyContent: "center"
        }}>
          <button 
            onClick={handleRestartDraft}
            style={{
              backgroundColor: "#dc2626",
              color: "white",
              border: "none",
              borderRadius: "8px",
              padding: "8px 16px",
              fontSize: "14px",
              fontWeight: "600",
              cursor: "pointer",
              boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
              transition: "all 0.2s ease"
            }}
            onMouseEnter={(e) => {
              e.target.style.backgroundColor = "#b91c1c";
              e.target.style.transform = "translateY(-1px)";
              e.target.style.boxShadow = "0 4px 12px rgba(220, 38, 38, 0.3)";
            }}
            onMouseLeave={(e) => {
              e.target.style.backgroundColor = "#dc2626";
              e.target.style.transform = "translateY(0)";
              e.target.style.boxShadow = "0 1px 3px rgba(0, 0, 0, 0.1)";
            }}
          >
            🔄 Restart Draft
          </button>
        </div>
      )}

      {/* Content Area */}
      <div style={{ padding: "16px" }}>
        
        {draftData.draftComplete && (
          <div style={{
            backgroundColor: "#d1fae5",
            border: "1px solid #10b981",
            borderRadius: "8px",
            padding: "12px 16px",
            marginBottom: "16px",
            textAlign: "center"
          }}>
            <p style={{ 
              color: "#065f46", 
              fontWeight: "bold", 
              margin: 0,
              fontSize: "16px"
            }}>
              ✅ Draft Complete!
            </p>
          </div>
        )}

        {/* Timer Display */}
        {!draftData.draftComplete && timeRemaining > 0 && (
          <div style={{ 
            padding: "16px", 
            backgroundColor: timeRemaining <= 30 ? "#fef2f2" : "#fff7ed", 
            border: `2px solid ${timeRemaining <= 30 ? "#ef4444" : "#f97316"}`, 
            borderRadius: "12px", 
            marginBottom: "16px",
            textAlign: "center",
            boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)"
          }}>
            <h3 style={{ 
              margin: "0 0 8px 0", 
              color: timeRemaining <= 30 ? "#dc2626" : "#ea580c",
              fontSize: "20px",
              fontWeight: "700"
            }}>
              ⏰ Time Remaining: {formatTime(timeRemaining)}
            </h3>
            {timeRemaining <= 30 && (
              <p style={{ 
                margin: 0, 
                color: "#dc2626", 
                fontWeight: "bold",
                fontSize: "14px"
              }}>
                ⚠️ Auto-pick in {timeRemaining} seconds!
              </p>
            )}
          </div>
        )}

{/* Current Turn Display - Only show when draft is NOT complete */}
        {!draftData.draftComplete && (
          <div style={{
            backgroundColor: "white",
            borderRadius: "12px",
            padding: "16px",
            marginBottom: "16px",
            boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
            border: "1px solid #e2e8f0",
            textAlign: "center"
          }}>
            {isMyTurn ? (
              <p style={{
                fontSize: "18px",
                fontWeight: "700",
                color: "#059669",
                margin: 0
              }}>
                🎯 It's <strong>your</strong> turn to pick!
              </p>
            ) : currentManager ? (
              <p style={{
                fontSize: "16px",
                fontWeight: "600",
                color: "#1e293b",
                margin: 0
              }}>
                Waiting for <strong>{currentManager.firstName}</strong> to pick...
              </p>
            ) : (
              <p style={{
                fontSize: "16px",
                color: "#64748b",
                margin: 0
              }}>
                Determining next pick...
              </p>
            )}
          </div>
        )}

        {/* Draft Controls - Only show when draft is NOT complete */}
        {!draftData.draftComplete && (
          <div style={{
            backgroundColor: "white",
            borderRadius: "12px",
            padding: "20px",
            marginBottom: "16px",
            boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
            border: "1px solid #e2e8f0"
          }}>
            <h3 style={{
              fontSize: "18px",
              fontWeight: "700",
              color: "#1e293b",
              margin: "0 0 16px 0"
            }}>
              Available Teams
            </h3>
            
            <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
              <select 
                value={teamPick} 
                onChange={(e) => setTeamPick(e.target.value)} 
                disabled={disableDrafting}
                style={{
                  flex: 1,
                  padding: "12px 16px",
                  border: "2px solid #e2e8f0",
                  borderRadius: "8px",
                  fontSize: "16px",
                  backgroundColor: disableDrafting ? "#f8fafc" : "white",
                  color: disableDrafting ? "#94a3b8" : "#1e293b",
                  cursor: disableDrafting ? "not-allowed" : "pointer"
                }}
              >
                <option value="">-- Select a Team --</option>
                {draftData.availableTeams.map((teamId) => {
                  const teamData = allTeams[teamId];
                  const label = teamData?.school || teamId;
                  return (
                    <option key={teamId} value={teamId}>{label}</option>
                  );
                })}
              </select>
              
              <button 
                onClick={handlePick} 
                disabled={disableDrafting || !teamPick}
                style={{
                  backgroundColor: (disableDrafting || !teamPick) ? "#94a3b8" : "#059669",
                  color: "white",
                  border: "none",
                  borderRadius: "8px",
                  padding: "12px 24px",
                  fontSize: "16px",
                  fontWeight: "600",
                  cursor: (disableDrafting || !teamPick) ? "not-allowed" : "pointer",
                  boxShadow: (disableDrafting || !teamPick) ? "none" : "0 1px 3px rgba(0, 0, 0, 0.1)",
                  transition: "all 0.2s ease"
                }}
                onMouseEnter={(e) => {
                  if (!disableDrafting && teamPick) {
                    e.target.style.backgroundColor = "#047857";
                    e.target.style.transform = "translateY(-1px)";
                    e.target.style.boxShadow = "0 4px 12px rgba(5, 150, 105, 0.3)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!disableDrafting && teamPick) {
                    e.target.style.backgroundColor = "#059669";
                    e.target.style.transform = "translateY(0)";
                    e.target.style.boxShadow = "0 1px 3px rgba(0, 0, 0, 0.1)";
                  }
                }}
              >
                🏈 Draft Team
              </button>
            </div>
          </div>
        )}

        {/* Draft Board */}
        <DraftBoard draftData={draftData} userMap={userMap} allTeams={allTeams} />
                
      </div>
    </div>
  );
}

export default DraftRoom;