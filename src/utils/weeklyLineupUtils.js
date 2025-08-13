// weeklyLineupUtils.js - Utility functions for weekly lineup management
import { collection, getDocs, doc, setDoc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/firebase';
import { useState, useEffect } from 'react';

/*
Database Structure for Weekly Lineups:

leagues/{leagueId}/weeklyLineups/{userId}
{
  week1: {
    starters: ["team-normalized-name-1", "team-normalized-name-2", null, null, null],
    bench: ["team-normalized-name-3", null],
    lockedAt: "2025-01-15T18:00:00Z" // ISO string when lineup was locked
  },
  week2: {
    starters: [null, null, null, null, null],
    bench: [null, null],
    lockedAt: null
  },
  // ... weeks 3-14
}

Enhanced schedule collection for lock times:
schedule/2025/weeks/{weekNum}/games/{gameId}
{
  homeTeam: "Team Name",
  awayTeam: "Team Name", 
  date: "2025-01-15T19:00:00Z", // ISO string
  homePoints: 24,
  awayPoints: 21,
  gameComplete: true
}
*/

// Migration script to move existing lineups to weekly system
export const migrateToWeeklyLineups = async (leagueId) => {
  try {
    console.log("Starting migration to weekly lineups...");
    
    // Get current season info
    const seasonRef = doc(db, "config", "season");
    const seasonSnap = await getDoc(seasonRef);
    const seasonData = seasonSnap.data();
    const currentWeekString = seasonData?.currentWeek || "Week 1";
    const currentWeekMatch = currentWeekString.match(/\d+/);
    const currentWeekNum = currentWeekMatch ? parseInt(currentWeekMatch[0]) : 1;
    
    // Get all members
    const membersSnap = await getDocs(collection(db, "leagues", leagueId, "members"));
    
    for (const memberDoc of membersSnap.docs) {
      const memberData = memberDoc.data();
      const userId = memberDoc.id;
      
      // Check if they already have weekly lineups
      const weeklyLineupsRef = doc(db, "leagues", leagueId, "weeklyLineups", userId);
      const weeklyLineupsSnap = await getDoc(weeklyLineupsRef);
      
      if (!weeklyLineupsSnap.exists()) {
        console.log(`Migrating user ${userId}...`);
        
        // Create weekly lineups structure
        const weeklyLineups = {};
        
        // Initialize all weeks (1-14)
        for (let week = 1; week <= 14; week++) {
          weeklyLineups[`week${week}`] = {
            starters: Array(5).fill(null),
            bench: Array(2).fill(null),
            lockedAt: null
          };
        }
        
        // Copy current lineup to current week if it exists
        if (memberData.lineup) {
          const currentWeekKey = `week${currentWeekNum}`;
          weeklyLineups[currentWeekKey] = {
            starters: memberData.lineup.starters || Array(5).fill(null),
            bench: memberData.lineup.bench || Array(2).fill(null),
            lockedAt: null
          };
        }
        
        // Save to database
        await setDoc(weeklyLineupsRef, weeklyLineups);
        console.log(`✅ Migrated user ${userId}`);
      } else {
        console.log(`⏭️ User ${userId} already has weekly lineups`);
      }
    }
    
    console.log("✅ Migration completed successfully!");
    
  } catch (error) {
    console.error("❌ Migration failed:", error);
    throw error;
  }
};

// Utility functions for managing weekly lineups
export const weeklyLineupUtils = {
  
  // Get lock time for a specific week
  getWeekLockTime: async (weekNum) => {
    try {
      const gamesSnap = await getDocs(
        collection(db, "schedule", "2025", "weeks", weekNum.toString(), "games")
      );
      
      let firstGameTime = null;
      
      gamesSnap.forEach(gameDoc => {
        const gameData = gameDoc.data();
        if (gameData.date) {
          const gameTime = new Date(gameData.date);
          if (!firstGameTime || gameTime < firstGameTime) {
            firstGameTime = gameTime;
          }
        }
      });
      
      if (firstGameTime) {
        // Return 1 hour before first game
        return new Date(firstGameTime.getTime() - (60 * 60 * 1000));
      }
      
      return null;
    } catch (error) {
      console.error(`Error getting lock time for week ${weekNum}:`, error);
      return null;
    }
  },
  
  // Check if a week is currently editable
  isWeekEditable: async (weekNum, currentWeek) => {
    try {
      const now = new Date();
      
      // Only current week can be editable
      if (weekNum !== currentWeek) {
        return false;
      }
      
      const lockTime = await weeklyLineupUtils.getWeekLockTime(weekNum);
      
      if (!lockTime) {
        return true; // No games scheduled, assume editable
      }
      
      return now < lockTime;
    } catch (error) {
      console.error(`Error checking if week ${weekNum} is editable:`, error);
      return false;
    }
  },
  
  // Get unlock time for a week (1 hour after last game)
  getWeekUnlockTime: async (weekNum) => {
    try {
      const gamesSnap = await getDocs(
        collection(db, "schedule", "2025", "weeks", weekNum.toString(), "games")
      );
      
      let lastGameTime = null;
      
      gamesSnap.forEach(gameDoc => {
        const gameData = gameDoc.data();
        if (gameData.date) {
          const gameTime = new Date(gameData.date);
          if (!lastGameTime || gameTime > lastGameTime) {
            lastGameTime = gameTime;
          }
        }
      });
      
      if (lastGameTime) {
        // Return 1 hour after last game
        return new Date(lastGameTime.getTime() + (60 * 60 * 1000));
      }
      
      return null;
    } catch (error) {
      console.error(`Error getting unlock time for week ${weekNum}:`, error);
      return null;
    }
  },
  
  // Auto-lock lineups for the current week
  autoLockCurrentWeek: async (leagueId, currentWeek) => {
    try {
      const lockTime = await weeklyLineupUtils.getWeekLockTime(currentWeek);
      const now = new Date();
      
      if (!lockTime || now < lockTime) {
        return; // Not time to lock yet
      }
      
      console.log(`Auto-locking lineups for week ${currentWeek}...`);
      
      // Get all weekly lineups
      const weeklyLineupsSnap = await getDocs(
        collection(db, "leagues", leagueId, "weeklyLineups")
      );
      
      const batch = [];
      
      weeklyLineupsSnap.forEach(userDoc => {
        const userData = userDoc.data();
        const weekKey = `week${currentWeek}`;
        
        if (userData[weekKey] && !userData[weekKey].lockedAt) {
          // Lock this week's lineup
          const updatedWeekData = {
            ...userData[weekKey],
            lockedAt: now.toISOString()
          };
          
          batch.push({
            ref: doc(db, "leagues", leagueId, "weeklyLineups", userDoc.id),
            data: { [weekKey]: updatedWeekData }
          });
        }
      });
      
      // Execute all updates
      for (const update of batch) {
        await updateDoc(update.ref, update.data);
      }
      
      console.log(`✅ Locked ${batch.length} lineups for week ${currentWeek}`);
      
    } catch (error) {
      console.error(`Error auto-locking week ${currentWeek}:`, error);
    }
  },
  
  // Normalize team name for storage
  normalizeTeamName: (team) => {
    if (!team?.school) return null;
    return team.school
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/&/g, "")
      .replace(/[^a-z0-9\-]/g, "");
  },
  
  // Calculate points for a specific week's lineup
  calculateWeeklyPoints: async (leagueId, userId, weekNum) => {
    try {
      // Get user's lineup for this week
      const weeklyLineupsRef = doc(db, "leagues", leagueId, "weeklyLineups", userId);
      const weeklyLineupsSnap = await getDoc(weeklyLineupsRef);
      
      if (!weeklyLineupsSnap.exists()) {
        return 0;
      }
      
      const userData = weeklyLineupsSnap.data();
      const weekKey = `week${weekNum}`;
      const weekLineup = userData[weekKey];
      
      if (!weekLineup) {
        return 0;
      }
      
      // Get all teams data
      const teamsSnap = await getDocs(collection(db, "teams"));
      const teamsMap = {};
      
      teamsSnap.forEach(doc => {
        const teamData = doc.data();
        if (teamData.school) {
          const normalizedName = weeklyLineupUtils.normalizeTeamName(teamData);
          teamsMap[normalizedName] = teamData;
        }
      });
      
      let totalPoints = 0;
      
      // Calculate starter points (full points)
      weekLineup.starters.forEach(teamName => {
        if (teamName && teamsMap[teamName]) {
          const team = teamsMap[teamName];
          const weekPoints = team.weeklyPoints?.[`week${weekNum}`] || 0;
          totalPoints += weekPoints;
        }
      });
      
      // Calculate bench points (half points)
      weekLineup.bench.forEach(teamName => {
        if (teamName && teamsMap[teamName]) {
          const team = teamsMap[teamName];
          const weekPoints = team.weeklyPoints?.[`week${weekNum}`] || 0;
          totalPoints += Math.floor(weekPoints / 2);
        }
      });
      
      return totalPoints;
      
    } catch (error) {
      console.error(`Error calculating weekly points for week ${weekNum}:`, error);
      return 0;
    }
  }
};

// Admin utility to manually trigger migration and testing
export const adminUtils = {
  // Migrate a specific league
  migrateLeague: async (leagueId) => {
    try {
      await migrateToWeeklyLineups(leagueId);
      console.log(`✅ Successfully migrated league ${leagueId}`);
    } catch (error) {
      console.error(`❌ Failed to migrate league ${leagueId}:`, error);
      throw error;
    }
  },
  
  // Migrate all leagues
  migrateAllLeagues: async () => {
    try {
      const leaguesSnap = await getDocs(collection(db, "leagues"));
      
      for (const leagueDoc of leaguesSnap.docs) {
        await migrateToWeeklyLineups(leagueDoc.id);
      }
      
      console.log("✅ Successfully migrated all leagues");
    } catch (error) {
      console.error("❌ Failed to migrate all leagues:", error);
      throw error;
    }
  },
  
  // Reset a user's weekly lineups (useful for testing)
  resetUserWeeklyLineups: async (leagueId, userId) => {
    try {
      const weeklyLineups = {};
      
      for (let week = 1; week <= 14; week++) {
        weeklyLineups[`week${week}`] = {
          starters: Array(5).fill(null),
          bench: Array(2).fill(null),
          lockedAt: null
        };
      }
      
      const weeklyLineupsRef = doc(db, "leagues", leagueId, "weeklyLineups", userId);
      await setDoc(weeklyLineupsRef, weeklyLineups);
      
      console.log(`✅ Reset weekly lineups for user ${userId}`);
    } catch (error) {
      console.error(`❌ Failed to reset user ${userId}:`, error);
      throw error;
    }
  },
  
  // Force lock a specific week for all users
  forceLockWeek: async (leagueId, weekNum) => {
    try {
      const now = new Date();
      const weeklyLineupsSnap = await getDocs(
        collection(db, "leagues", leagueId, "weeklyLineups")
      );
      
      for (const userDoc of weeklyLineupsSnap.docs) {
        const userData = userDoc.data();
        const weekKey = `week${weekNum}`;
        
        if (userData[weekKey]) {
          const updatedWeekData = {
            ...userData[weekKey],
            lockedAt: now.toISOString()
          };
          
          await updateDoc(userDoc.ref, { [weekKey]: updatedWeekData });
        }
      }
      
      console.log(`✅ Force locked week ${weekNum} for all users in league ${leagueId}`);
    } catch (error) {
      console.error(`❌ Failed to force lock week ${weekNum}:`, error);
      throw error;
    }
  }
};

// Hook for using weekly lineup functionality in components
export const useWeeklyLineups = (leagueId, userId) => {
  const [weeklyLineups, setWeeklyLineups] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  useEffect(() => {
    if (!leagueId || !userId) return;
    
    const loadWeeklyLineups = async () => {
      try {
        setLoading(true);
        const weeklyLineupsRef = doc(db, "leagues", leagueId, "weeklyLineups", userId);
        const weeklyLineupsSnap = await getDoc(weeklyLineupsRef);
        
        if (weeklyLineupsSnap.exists()) {
          setWeeklyLineups(weeklyLineupsSnap.data());
        } else {
          // Initialize if doesn't exist
          await migrateToWeeklyLineups(leagueId);
          const newSnap = await getDoc(weeklyLineupsRef);
          setWeeklyLineups(newSnap.data() || {});
        }
        
        setError(null);
      } catch (err) {
        console.error("Error loading weekly lineups:", err);
        setError(err);
      } finally {
        setLoading(false);
      }
    };
    
    loadWeeklyLineups();
  }, [leagueId, userId]);
  
  const updateWeeklyLineup = async (weekNum, starters, bench) => {
    try {
      const weekKey = `week${weekNum}`;
      const now = new Date();
      
      const updatedLineup = {
        starters: starters.map(team => weeklyLineupUtils.normalizeTeamName(team)),
        bench: bench.map(team => weeklyLineupUtils.normalizeTeamName(team)),
        lockedAt: null // Will be set when week locks
      };
      
      const weeklyLineupsRef = doc(db, "leagues", leagueId, "weeklyLineups", userId);
      await updateDoc(weeklyLineupsRef, { [weekKey]: updatedLineup });
      
      setWeeklyLineups(prev => ({
        ...prev,
        [weekKey]: updatedLineup
      }));
      
      return true;
    } catch (err) {
      console.error("Error updating weekly lineup:", err);
      setError(err);
      return false;
    }
  };
  
  return {
    weeklyLineups,
    loading,
    error,
    updateWeeklyLineup
  };
};