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
    if (!leagueId) return;

    const fetchDraft = async () => {
      try {
        const leagueDoc = await getDoc(doc(db, "leagues", leagueId));
        const leagueData = leagueDoc.exists() ? leagueDoc.data() : null;
        setLeagueData(leagueData);

        const user = auth.currentUser;
        if (!user) return;
        setUserId(user.uid);

        const membersSnap = await getDocs(collection(db, "leagues", leagueId, "members"));
        const userMapData = {};
        const userFirstNamesData = {};

        const userFetches = [];

        membersSnap.forEach((memberDoc) => {
          const memberData = memberDoc.data();
          userMapData[memberDoc.id] = memberData;
          userFetches.push(
            getDoc(doc(db, "users", memberDoc.id)).then((userDoc) => {
              if (userDoc.exists()) {
                const userData = userDoc.data();
                userFirstNamesData[memberDoc.id] = userData.firstName || 'Unknown';
              }
            })
          );
        });

        await Promise.all(userFetches);

        setUserMap(userMapData);
        setUserFirstNames(userFirstNamesData);

        console.log("✅ setUserMap:", userMapData);
        console.log("✅ setUserFirstNames:", userFirstNamesData);

        setIsLeagueAdmin(user.uid === leagueData?.admin);
        setMaxManagers(leagueData?.maxManagers || 8);

        const teamsSnap = await getDocs(collection(db, "teams"));
        const teamDataMap = {};
        teamsSnap.forEach((teamDoc) => {
          teamDataMap[teamDoc.id] = teamDoc.data();
        });
        setAllTeams(teamDataMap);
      } catch (error) {
        console.error("Error loading draft data:", error);
      }
    };

    fetchDraft();

    const draftRef = doc(db, "leagues", leagueId, "meta", "draft");
    const unsubscribe = onSnapshot(draftRef, (snap) => {
      const data = snap.data();
      const newDraftData = data || null;

      if (newDraftData?.draftComplete && (!draftData || !draftData.draftComplete)) {
        setShowCompletionModal(true);
      }

      setDraftData(newDraftData);
      setLoading(false);
    });

    return () => {
      unsubscribe(); // ✅ Clean up listener on unmount
    };
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

      // ✅ CRITICAL FIX: Ensure allTeams is populated before proceeding
      if (!allTeams || Object.keys(allTeams).length === 0) {
        console.warn("⚠️ allTeams not loaded yet, fetching fresh team data...");
        
        // Fetch fresh team data if allTeams is not populated
        const teamsSnap = await getDocs(collection(db, "teams"));
        const freshTeamData = {};
        teamsSnap.forEach((teamDoc) => {
          freshTeamData[teamDoc.id] = teamDoc.data();
        });
        
        // Use fresh data for rankings
        const teamRankings = {};
        availableTeamIds.forEach(teamId => {
          const teamData = freshTeamData[teamId];
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
        const teamData = freshTeamData[bestTeam.id];
        const teamDisplayName = teamData?.school || bestTeam.id;
        
        const fallbackName = userMap[currentUid]?.displayName || "Unknown";
        const firstName = userFirstNames?.[currentUid];
        const displayName = firstName || fallbackName;

        console.log(`🤖 Auto-picking best available team (fresh data): ${teamDisplayName} (rank: ${bestTeam.rank}) for ${displayName}`);
        
        // ✅ Use the document ID (bestTeam.id) for the pick
        await performPick(bestTeam.id, currentUid, true);
        return;
      }

      // ✅ USE EXISTING allTeams STATE: Map document IDs to their philMetricDraftRank scores
      const teamRankings = {};
      
      // Verify we have ranking data for available teams
      let teamsWithRankings = 0;
      availableTeamIds.forEach(teamId => {
        const teamData = allTeams[teamId];
        if (teamData && teamData.philMetricDraftRank !== undefined) {
          teamRankings[teamId] = teamData.philMetricDraftRank;
          teamsWithRankings++;
        }
      });

      console.log(`📊 Found ranking data for ${teamsWithRankings} of ${availableTeamIds.length} available teams`);

      // If we don't have ranking data for most teams, something is wrong
      if (teamsWithRankings < availableTeamIds.length * 0.5) {
        console.warn("⚠️ Missing ranking data for most teams, this may indicate allTeams state is stale");
      }

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
      
      const fallbackName = userMap[currentUid]?.displayName || "Unknown";
      const firstName = userFirstNames?.[currentUid];
      const displayName = firstName || fallbackName;

      console.log(`🤖 Auto-picking best available team: ${teamDisplayName} (rank: ${bestTeam.rank}) for ${displayName}`);
      console.log(`📋 Top 5 available teams by rank:`, availableTeamsWithRanks.slice(0, 5).map(t => `${allTeams[t.id]?.school || t.id} (${t.rank})`));

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

    // ✅ Construct new selected teams object
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

    // ✅ Get proper display name using first name fallback
    const fallbackName = userMap[pickingUserId]?.displayName || "Unknown";
    const firstName = userFirstNames?.[pickingUserId];
    const displayName = firstName || fallbackName;

    console.log(`✅ Making pick: ${teamName} for ${displayName} (Pick ${newIndex})`);

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
      console.log(`Auto-picked ${teamName} for ${displayName}`);
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

  const [showEarlyDraftModal, setShowEarlyDraftModal] = useState(false);

  const handleStartDraftEarly = () => {
    setShowEarlyDraftModal(true);
  };

  const confirmEarlyDraft = async () => {
    setShowEarlyDraftModal(false);
    await handleStartDraft();
  };

  const cancelEarlyDraft = () => {
    setShowEarlyDraftModal(false);
  };

  const handleStartDraft = async () => {
  if (!leagueId || Object.keys(userMap).length === 0) return;

  try {
    // Clear any existing draft data first to prevent conflicts
    const draftRef = doc(db, "leagues", leagueId, "meta", "draft");
    try {
      await deleteDoc(draftRef);
      console.log("✅ Cleared existing draft data");
    } catch (deleteError) {
      // It's okay if the document doesn't exist
      console.log("No existing draft data to clear");
    }

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

    await setDoc(draftRef, draftPayload);
    alert("Live draft started!");

  } catch (err) {
    console.error("❌ Failed to start draft:", err);
    alert("Error starting draft: " + err.message);
  }
  };

// Replace the handleStartManualDraft function in DraftRoom.js with this:

  const handleStartManualDraft = async () => {
    if (!leagueId || Object.keys(userMap).length === 0) return;

    try {
      // ✅ CRITICAL FIX: Use the saved custom draft order if it exists
      let managerIds;
      
      if (leagueData.draftOrderType === "admin" && leagueData.customDraftOrder && leagueData.customDraftOrder.length > 0) {
        // Use the custom order set by admin
        managerIds = leagueData.customDraftOrder;
        console.log("✅ Using admin-set draft order for manual draft:", managerIds);
      } else {
        // Fallback to userMap order (for random or if no custom order set)
        managerIds = Object.keys(userMap).filter(Boolean);
        console.log("✅ Using fallback draft order for manual draft:", managerIds);
      }
      
      const manualDraftPayload = {
        type: "manual",
        inProgress: true,
        managersCompleted: [],
        currentManager: null,
        teams: {},
        draftComplete: false,
        // Use the correct draft order (either custom or fallback)
        draftOrder: managerIds
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

// Updated formatCountdown function to handle days
  const formatCountdown = (seconds) => {
    const days = Math.floor(seconds / 86400); // 86400 seconds in a day
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (days > 0) {
      // Show days and hours when more than 24 hours
      if (hours > 0) {
        return `${days}d ${hours}h`;
      } else {
        return `${days}d`;
      }
    } else if (hours > 0) {
      // Show hours, minutes, and seconds when less than 24 hours but more than 1 hour
      return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
      // Show minutes and seconds when less than 1 hour
      return `${minutes}m ${secs}s`;
    } else {
      // Show only seconds when less than 1 minute
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

// Replace the existing manual draft non-admin section (around lines 680-750) with this:

{/* Manual draft in progress or complete */}
if (draftData.type === "manual" || (draftData.inProgress !== undefined && draftData.teams !== undefined)) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white">
      {/* Animated Background Elements */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-20 left-4 sm:left-10 w-48 sm:w-72 h-48 sm:h-72 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-20 right-4 sm:right-10 w-56 sm:w-96 h-56 sm:h-96 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full blur-3xl animate-pulse delay-1000"></div>
      </div>

      <BottomNavBar leagueId={leagueId} isDraftComplete={draftData?.draftComplete || false} />

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
        
        {/* Header */}
        <div className="text-center mb-8">
          <div className="mb-4">
            <span className="inline-block text-4xl sm:text-5xl mb-2">
              {draftData.draftComplete ? "🎉" : "📝"}
            </span>
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black mb-2 leading-tight">
            <span className="bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
              {draftData.draftComplete ? "Draft Complete!" : "Manual Draft Entry"}
            </span>
          </h1>
          <p className="text-xl sm:text-2xl font-semibold text-white mb-4">
            {leagueData?.name || "Unnamed League"}
          </p>
          <p className="text-lg sm:text-xl text-white/80">
            {draftData.draftComplete 
              ? "All teams have been entered" 
              : `Progress: ${(draftData.managersCompleted || []).length} of ${Object.keys(userMap).length} managers completed`
            }
          </p>
        </div>

        {/* Admin Controls */}
        {isLeagueAdmin && (
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20 mb-8">
            <div className="text-center">
              <button 
                onClick={handleRestartDraft}
                className="px-6 py-3 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 rounded-xl text-white font-bold transition-all duration-300 transform hover:scale-105 shadow-xl hover:shadow-red-500/40"
              >
                🔄 Restart Draft
              </button>
            </div>
          </div>
        )}

        {/* Draft Complete State */}
        {draftData.draftComplete ? (
          <>
            <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 sm:p-8 border border-white/20 mb-6">
              <div className="text-center">
                <div className="bg-green-500/20 border border-green-400/30 rounded-xl p-4">
                  <p className="text-green-200 font-bold text-lg">
                    ✅ Manual Draft Complete!
                  </p>
                </div>
              </div>
            </div>
            
            {/* Full Width DraftBoard */}
            <div className="w-screen -mx-4 sm:-mx-6">
              <DraftBoard 
                draftData={draftData} 
                userMap={userMap} 
                allTeams={allTeams} 
                userFirstNames={userFirstNames}
              />
            </div>
          </>
        ) : (
          /* Draft Entry Interface */
          <>
            {isLeagueAdmin ? (
              /* Admin Entry Interface */
              <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 sm:p-8 border border-white/20 mb-8">
                <h3 className="text-xl sm:text-2xl font-bold text-white mb-6">
                  Enter Draft Results
                </h3>
                <div className="bg-blue-500/20 border border-blue-400/30 rounded-xl p-4 mb-6">
                  <p className="text-blue-200 text-sm sm:text-base">
                    💡 <strong>Instructions:</strong> Select each manager below and enter their 7 drafted teams in order. 
                    The first 5 will be starters, the last 2 will be bench players.
                  </p>
                </div>
                
                <ManualDraftEntry 
                  leagueId={leagueId}
                  userMap={userMap}
                  draftData={draftData}
                />
              </div>
            ) : (
              /* Non-Admin Progress View */
              <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 sm:p-8 border border-white/20 mb-8">
                <div className="text-center">
                  <div className="text-4xl sm:text-5xl mb-6 animate-pulse">📝</div>
                  <h3 className="text-xl sm:text-2xl font-bold text-white mb-4">
                    Commissioner is entering draft results...
                  </h3>
                  <div className="bg-amber-500/20 border border-amber-400/30 rounded-xl p-4 mb-6">
                    <p className="text-amber-200 font-semibold">
                      Progress: {(draftData.managersCompleted || []).length} of {Object.keys(userMap).length} managers completed
                    </p>
                  </div>
                  <p className="text-white/70 text-lg mb-6">
                    Please wait while your commissioner enters everyone's teams from the offline draft.
                  </p>
                  
                  {/* Progress Indicator */}
                  <div className="mt-6">
                    <div className="bg-white/20 rounded-full h-3 w-full max-w-md mx-auto">
                      <div 
                        className="bg-gradient-to-r from-purple-500 to-blue-500 h-3 rounded-full transition-all duration-500 ease-out"
                        style={{ 
                          width: `${((draftData.managersCompleted || []).length / Object.keys(userMap).length) * 100}%` 
                        }}
                      ></div>
                    </div>
                    <p className="text-white/60 text-sm mt-2">
                      {Math.round(((draftData.managersCompleted || []).length / Object.keys(userMap).length) * 100)}% Complete
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* ALWAYS SHOW DRAFT BOARD - Key Change Here */}
            {/* Show Draft Board for ALL users (both admin and non-admin) */}
            <div className="bg-blue-500/20 border border-blue-400/30 rounded-2xl p-6 mb-8">
              <div className="text-center">
                <h4 className="text-lg font-semibold text-blue-200 mb-3">
                  📊 Draft Progress
                </h4>
                <p className="text-blue-200 text-sm">
                  {isLeagueAdmin 
                    ? "Enter team selections above to see them appear in the board below."
                    : "See teams entered so far. Board updates as commissioner enters more results."
                  }
                </p>
              </div>
            </div>

            {/* Full Width DraftBoard - Always Shown */}
            <div className="w-screen -mx-4 sm:-mx-6">
              <DraftBoard 
                draftData={draftData} 
                userMap={userMap} 
                allTeams={allTeams} 
                userFirstNames={userFirstNames}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
  
  // If we have draft data but it's not manual format, treat as error
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
        
        {/* Header */}
        <div className="text-center mb-8">
          <div className="mb-4">
            <span className="inline-block text-4xl sm:text-5xl mb-2">⚠️</span>
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black mb-2 leading-tight">
            <span className="bg-gradient-to-r from-red-400 to-orange-400 bg-clip-text text-transparent">
              Draft Data Error
            </span>
          </h1>
          <p className="text-xl sm:text-2xl font-semibold text-white mb-4">
            {leagueData?.name || "Unnamed League"}
          </p>
          <p className="text-lg sm:text-xl text-white/80">
            Incompatible draft data found
          </p>
        </div>

        {/* Error Card */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 sm:p-8 border border-white/20 mb-8">
          <div className="text-center">
            
            {/* Error Alert */}
            <div className="bg-red-500/20 border border-red-400/30 rounded-xl p-6 mb-6">
              <div className="text-4xl mb-4">🚫</div>
              <h3 className="text-xl font-bold text-red-200 mb-3">
                Incompatible Draft Data Found
              </h3>
              <p className="text-red-200/80 text-sm sm:text-base leading-relaxed">
                The current draft data format is not compatible with this version of the draft system. 
                This usually happens when switching between different draft types or after system updates.
              </p>
            </div>
            
            {/* Solution */}
            <div className="bg-blue-500/20 border border-blue-400/30 rounded-xl p-4 mb-6">
              <p className="text-blue-200 text-sm sm:text-base">
                💡 <strong>Solution:</strong> Clear the existing draft data to start fresh. 
                This will reset all draft progress and allow you to start a new draft.
              </p>
            </div>

            {/* Admin Action */}
            {isLeagueAdmin ? (
              <div className="space-y-4">
                <p className="text-white/80 text-lg">
                  As the league admin, you can clear the draft data to resolve this issue.
                </p>
                <button 
                  onClick={handleRestartDraft}
                  className="px-8 py-4 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 rounded-xl text-white font-bold transition-all duration-300 transform hover:scale-105 shadow-xl hover:shadow-red-500/40"
                >
                  🗑️ Clear Draft Data & Restart
                </button>
                <p className="text-white/60 text-sm">
                  This will permanently delete the current draft data
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-white/80 text-lg">
                  Please contact your league commissioner to resolve this issue.
                </p>
                <div className="bg-amber-500/20 border border-amber-400/30 rounded-xl p-4">
                  <p className="text-amber-200 text-sm">
                    ⏳ Only the league admin can clear draft data
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Help Card */}
        <div className="bg-purple-500/20 border border-purple-400/30 rounded-2xl p-6">
          <div className="text-center">
            <h4 className="text-lg font-semibold text-purple-200 mb-3">
              Need Help?
            </h4>
            <div className="text-purple-200 text-sm space-y-2 leading-relaxed">
              <p>• This error typically occurs when switching draft formats</p>
              <p>• All member data and league settings remain safe</p>
              <p>• Only the draft progress needs to be reset</p>
              <p>• You can start a new draft immediately after clearing</p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

// Live Draft Flow (existing logic)
if (!draftData) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white">

    {/* Early Draft Start Confirmation Modal */}
    {showEarlyDraftModal && (
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-white/10 backdrop-blur-lg border border-white/20 rounded-2xl p-6 sm:p-8 max-w-lg w-full text-center shadow-2xl">
          <div className="text-5xl mb-6">🚀</div>
          
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4">
            Start Draft Early?
          </h2>
          
          <p className="text-lg text-white/80 mb-6 leading-relaxed">
            Are you sure you want to start the draft before the scheduled time?
          </p>
          
          {/* Scheduled Time Info */}
          <div className="bg-blue-500/20 border border-blue-400/30 rounded-xl p-4 mb-4">
            <p className="text-blue-200 text-sm font-medium mb-2">
              📅 <strong>Scheduled for:</strong>
            </p>
            <p className="text-blue-100 text-base font-semibold">
              {leagueData?.draftDate?.toDate().toLocaleString("en-US", {
                timeZone: "America/New_York",
                weekday: "long",
                month: "long", 
                day: "numeric",
                hour: "numeric", 
                minute: "2-digit",
                timeZoneName: "short"
              })}
            </p>
          </div>
          
          {/* Time Remaining */}
          <div className="bg-amber-500/20 border border-amber-400/30 rounded-xl p-4 mb-6">
            <p className="text-amber-200 text-sm font-medium mb-1">
              ⏰ <strong>Time remaining:</strong>
            </p>
            <p className="text-amber-100 text-lg font-bold">
              {formatCountdown(draftCountdown)}
            </p>
          </div>
          
          {/* Warning */}
          <div className="bg-orange-500/20 border border-orange-400/30 rounded-xl p-4 mb-8">
            <p className="text-orange-200 text-sm">
              ⚠️ This will start the draft <strong>immediately</strong> for all managers
            </p>
          </div>
          
          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={confirmEarlyDraft}
              className="px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 rounded-xl text-white font-bold transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-green-500/40"
            >
              🚀 Yes, Start Now
            </button>
            <button
              onClick={cancelEarlyDraft}
              className="px-6 py-3 bg-white/20 hover:bg-white/30 border border-white/30 rounded-xl text-white font-medium transition-all duration-300"
            >
              ❌ Cancel
            </button>
          </div>
        </div>
      </div>
    )}

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
        {/* Header */}
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

              {isLeagueAdmin && (
                <div className="space-y-4">
                  <p className="text-white/80 text-lg">
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
                <p className="text-white/80 text-lg">
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

// Live Draft Active Interface
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
  <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white">
    {/* Animated Background Elements */}
    <div className="absolute inset-0 opacity-10">
      <div className="absolute top-20 left-4 sm:left-10 w-48 sm:w-72 h-48 sm:h-72 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full blur-3xl animate-pulse"></div>
      <div className="absolute bottom-20 right-4 sm:right-10 w-56 sm:w-96 h-56 sm:h-96 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full blur-3xl animate-pulse delay-1000"></div>
    </div>

    <BottomNavBar leagueId={leagueId} isDraftComplete={draftData?.draftComplete || false} />

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

    {/* Draft Completion Modal */}
    {showCompletionModal && (
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-white/10 backdrop-blur-lg border border-white/20 rounded-2xl p-8 max-w-md w-full text-center shadow-2xl">
          <div className="text-6xl mb-6">🎉</div>
          <h2 className="text-3xl font-bold text-white mb-4">
            Draft Complete!
          </h2>
          <p className="text-lg text-white/80 mb-8 leading-relaxed">
            Congratulations! All teams have been drafted and your lineup has been automatically set.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={handleGoToLineup}
              className="px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 rounded-xl text-white font-bold transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-green-500/40"
            >
              🏈 View My Lineup
            </button>
            <button
              onClick={handleCloseModal}
              className="px-6 py-3 bg-white/20 hover:bg-white/30 border border-white/30 rounded-xl text-white font-medium transition-all duration-300"
            >
              Stay Here
            </button>
          </div>
        </div>
      </div>
    )}

    {/* Main Content */}
    <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 py-4 pb-24">
      
      {/* Header */}
      <div className="text-center mb-8">
        <div className="mb-4">
          <span className="inline-block text-4xl sm:text-5xl mb-2">
            {draftData?.draftComplete ? "🎉" : "⚡"}
          </span>
        </div>
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black mb-2 leading-tight">
          <span className="bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
            {draftData?.draftComplete ? "Draft Complete!" : "Live Draft"}
          </span>
        </h1>
        <p className="text-xl sm:text-2xl font-semibold text-white mb-4">
          {leagueData?.name || "Unnamed League"}
        </p>
        <p className="text-lg sm:text-xl text-white/80">
          {Object.keys(userMap).length} managers • Pick {(draftData?.currentPickIndex || 0) + 1}
        </p>
      </div>

      {/* Admin Controls */}
      {isLeagueAdmin && draftData && (
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20 mb-8">
          <div className="text-center">
            <button 
              onClick={handleRestartDraft}
              className="px-6 py-3 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 rounded-xl text-white font-bold transition-all duration-300 transform hover:scale-105 shadow-xl hover:shadow-red-500/40"
            >
              🔄 Restart Draft
            </button>
          </div>
        </div>
      )}

      {/* Draft Complete Banner */}
      {draftData?.draftComplete && (
        <div className="bg-green-500/20 border border-green-400/30 rounded-2xl p-6 mb-8">
          <div className="text-center">
            <div className="text-4xl mb-4">✅</div>
            <h3 className="text-2xl font-bold text-green-200 mb-2">
              Draft Complete!
            </h3>
            <p className="text-green-200/80">
              All teams have been drafted. Check out the results below!
            </p>
          </div>
        </div>
      )}

      {/* Timer Display - Only show when draft is active */}
      {!draftData?.draftComplete && timeRemaining > 0 && (
        <div className={`
          bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20 mb-8
          ${timeRemaining <= 30 ? 'animate-pulse' : ''}
        `}>
          <div className="text-center">
            <div className="text-4xl mb-4">
              {timeRemaining <= 30 ? "🚨" : "⏰"}
            </div>
            <h3 className={`
              text-2xl sm:text-3xl font-bold mb-2
              ${timeRemaining <= 30 ? 'text-red-300' : 'text-white'}
            `}>
              Time Remaining: {formatTime(timeRemaining)}
            </h3>
            {timeRemaining <= 30 && (
              <div className="bg-red-500/20 border border-red-400/30 rounded-xl p-4 mt-4">
                <p className="text-red-200 font-bold">
                  ⚠️ Auto-pick in {timeRemaining} seconds!
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Current Turn Display - Only show when draft is NOT complete */}
      {!draftData?.draftComplete && (
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20 mb-8">
          <div className="text-center">
            {isMyTurn ? (
              <>
                <div className="text-4xl mb-4">🎯</div>
                <h3 className="text-xl sm:text-2xl font-bold text-green-300 mb-2">
                  It's Your Turn!
                </h3>
                <p className="text-white/80">
                  Make your pick below
                </p>
              </>
            ) : currentManager ? (
              <>
                <div className="text-4xl mb-4">⏳</div>
                <h3 className="text-xl sm:text-2xl font-bold text-white mb-2">
                  Waiting for Pick
                </h3>
                <p className="text-white/80">
                  <strong>{currentManager.firstName}</strong> is currently picking...
                </p>
              </>
            ) : (
              <>
                <div className="text-4xl mb-4">🔄</div>
                <h3 className="text-xl font-bold text-white mb-2">
                  Determining Next Pick...
                </h3>
              </>
            )}
          </div>
        </div>
      )}

      {/* Draft Controls - Only show when draft is NOT complete */}
      {!draftData?.draftComplete && (
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 sm:p-8 border border-white/20 mb-8">
          <h3 className="text-xl sm:text-2xl font-bold text-white mb-6">
            Available Teams
          </h3>
          
          <div className="space-y-4">
            <select 
              value={teamPick} 
              onChange={(e) => setTeamPick(e.target.value)} 
              disabled={disableDrafting}
              className={`
                w-full p-4 rounded-xl border-2 text-lg font-medium transition-all duration-300
                ${disableDrafting 
                  ? 'bg-white/5 border-white/20 text-white/40 cursor-not-allowed' 
                  : 'bg-white/10 border-white/30 text-white hover:border-blue-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20 focus:outline-none'
                }
              `}
            >
              <option value="" className="bg-slate-800 text-white">
                -- Select a Team --
              </option>
              {draftData?.availableTeams?.map((teamId) => {
                const teamData = allTeams[teamId];
                const label = teamData?.school || teamId;
                return (
                  <option key={teamId} value={teamId} className="bg-slate-800 text-white">
                    {label}
                  </option>
                );
              })}
            </select>
            
            <button 
              onClick={handlePick} 
              disabled={disableDrafting || !teamPick}
              className={`
                w-full p-4 rounded-xl text-lg font-bold transition-all duration-300 transform
                ${(disableDrafting || !teamPick)
                  ? 'bg-white/20 text-white/40 cursor-not-allowed' 
                  : 'bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white hover:scale-105 shadow-lg hover:shadow-green-500/40'
                }
              `}
            >
              {!isMyTurn 
                ? "⏳ Not Your Turn" 
                : !teamPick 
                ? "🏈 Select a Team First" 
                : "🏈 Draft This Team"
              }
            </button>
          </div>

          {/* Available Teams Count */}
          <div className="mt-6 text-center">
            <p className="text-white/60 text-sm">
              {draftData?.availableTeams?.length || 0} teams remaining
            </p>
          </div>
        </div>
      )}

      {/* Draft Board - Full Width */}
      <div className="w-screen -mx-4 sm:-mx-6">
        <DraftBoard 
          draftData={draftData} 
          userMap={userMap} 
          allTeams={allTeams} 
          userFirstNames={userFirstNames}
        />
      </div>

    </div>
  </div>
);
}

export default DraftRoom;