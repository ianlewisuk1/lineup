// weeklyLineupUtils.js - Utility functions for weekly lineup management
import { supabase } from '../supabase/supabase';
import { useState, useEffect } from 'react';

/*
Database Structure for Weekly Lineups (Supabase):

weekly_lineups table: id, league_id, user_id, week, starters (text[]), bench (text[]), captain, trip_play_team
league_members table: id, league_id, user_id, team_name, starters (text[]), bench (text[]), captain, trip_play_team, ...
teams table: id (text slug), school, mascot, logos, color, record, game_points, ...
*/

// Migration script to move existing lineups to weekly system
export const migrateToWeeklyLineups = async (leagueId) => {
  try {
    // Get all members for this league
    const { data: members, error: membersError } = await supabase
      .from('league_members')
      .select('*')
      .eq('league_id', leagueId);

    if (membersError) throw membersError;

    for (const member of members || []) {
      const userId = member.user_id;

      // Check if they already have weekly lineups
      const { data: existing } = await supabase
        .from('weekly_lineups')
        .select('id')
        .eq('league_id', leagueId)
        .eq('user_id', userId)
        .limit(1);

      if (existing && existing.length > 0) {
        continue;
      }

      // Build rows for weeks 1-14
      const rows = [];
      for (let week = 1; week <= 14; week++) {
        rows.push({
          league_id: leagueId,
          user_id: userId,
          week,
          starters: Array(5).fill(null),
          bench: Array(2).fill(null),
          captain: null,
          trip_play_team: null
        });
      }

      const { error: insertError } = await supabase
        .from('weekly_lineups')
        .insert(rows);

      if (insertError) throw insertError;
    }


  } catch (error) {
    console.error("❌ Migration failed:", error);
    throw error;
  }
};

// Utility functions for managing weekly lineups
export const weeklyLineupUtils = {

  // Get lock time for a specific week (not stored in Supabase; returns null)
  getWeekLockTime: async (_weekNum) => null,

  // Check if a week is currently editable
  isWeekEditable: async (weekNum, currentWeek) => {
    try {
      if (weekNum !== currentWeek) return false;
      const lockTime = await weeklyLineupUtils.getWeekLockTime(weekNum);
      if (!lockTime) return true;
      return new Date() < lockTime;
    } catch (error) {
      console.error(`Error checking if week ${weekNum} is editable:`, error);
      return false;
    }
  },

  // Get unlock time for a week (not stored in Supabase; returns null)
  getWeekUnlockTime: async (_weekNum) => null,

  // Auto-lock lineups for the current week
  autoLockCurrentWeek: async (leagueId, currentWeek) => {
    try {
      const lockTime = await weeklyLineupUtils.getWeekLockTime(currentWeek);
      const now = new Date();
      if (!lockTime || now < lockTime) return;

      // No lockedAt column in schema; this is a no-op placeholder
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
      .replace(/&/g, "-")
      .replace(/[^a-z0-9\-]/g, "");
  },

  // Calculate points for a specific week's lineup
  calculateWeeklyPoints: async (leagueId, userId, weekNum) => {
    try {
      const { data: weekRow, error: weekError } = await supabase
        .from('weekly_lineups')
        .select('starters, bench')
        .eq('league_id', leagueId)
        .eq('user_id', userId)
        .eq('week', weekNum)
        .single();

      if (weekError || !weekRow) return 0;

      const { data: teamsData, error: teamsError } = await supabase
        .from('teams')
        .select('id, school, game_points');

      if (teamsError) throw teamsError;

      const teamsMap = {};
      (teamsData || []).forEach(team => {
        if (team.school) {
          const normalized = weeklyLineupUtils.normalizeTeamName(team);
          teamsMap[normalized] = team;
        }
      });

      let totalPoints = 0;

      (weekRow.starters || []).forEach(teamName => {
        if (teamName && teamsMap[teamName]) {
          totalPoints += teamsMap[teamName].game_points || 0;
        }
      });

      (weekRow.bench || []).forEach(teamName => {
        if (teamName && teamsMap[teamName]) {
          totalPoints += Math.floor((teamsMap[teamName].game_points || 0) / 2);
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
    } catch (error) {
      console.error(`❌ Failed to migrate league ${leagueId}:`, error);
      throw error;
    }
  },

  // Migrate all leagues
  migrateAllLeagues: async () => {
    try {
      const { data: leagues, error } = await supabase.from('leagues').select('id');
      if (error) throw error;

      for (const league of leagues || []) {
        await migrateToWeeklyLineups(league.id);
      }
    } catch (error) {
      console.error("❌ Failed to migrate all leagues:", error);
      throw error;
    }
  },

  // Reset a user's weekly lineups (useful for testing)
  resetUserWeeklyLineups: async (leagueId, userId) => {
    try {
      // Delete existing rows then re-insert empty ones
      await supabase
        .from('weekly_lineups')
        .delete()
        .eq('league_id', leagueId)
        .eq('user_id', userId);

      const rows = [];
      for (let week = 1; week <= 14; week++) {
        rows.push({
          league_id: leagueId,
          user_id: userId,
          week,
          starters: Array(5).fill(null),
          bench: Array(2).fill(null),
          captain: null,
          trip_play_team: null
        });
      }

      const { error } = await supabase.from('weekly_lineups').insert(rows);
      if (error) throw error;
    } catch (error) {
      console.error(`❌ Failed to reset user ${userId}:`, error);
      throw error;
    }
  },

  // Force lock a specific week for all users (no-op: no lockedAt in schema)
  forceLockWeek: async (leagueId, weekNum) => {
    try {
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

        const { data, error: fetchError } = await supabase
          .from('weekly_lineups')
          .select('*')
          .eq('league_id', leagueId)
          .eq('user_id', userId);

        if (fetchError) throw fetchError;

        if (data && data.length > 0) {
          const lineupMap = {};
          data.forEach(row => {
            lineupMap[`week${row.week}`] = row;
          });
          setWeeklyLineups(lineupMap);
        } else {
          // Initialize if doesn't exist
          await migrateToWeeklyLineups(leagueId);
          const { data: newData } = await supabase
            .from('weekly_lineups')
            .select('*')
            .eq('league_id', leagueId)
            .eq('user_id', userId);

          const lineupMap = {};
          (newData || []).forEach(row => {
            lineupMap[`week${row.week}`] = row;
          });
          setWeeklyLineups(lineupMap);
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
      const normalizedStarters = starters.map(team => weeklyLineupUtils.normalizeTeamName(team));
      const normalizedBench = bench.map(team => weeklyLineupUtils.normalizeTeamName(team));

      const { error: upsertError } = await supabase
        .from('weekly_lineups')
        .upsert({
          league_id: leagueId,
          user_id: userId,
          week: weekNum,
          starters: normalizedStarters,
          bench: normalizedBench
        }, { onConflict: 'league_id,user_id,week' });

      if (upsertError) throw upsertError;

      const weekKey = `week${weekNum}`;
      setWeeklyLineups(prev => ({
        ...prev,
        [weekKey]: {
          ...(prev[weekKey] || {}),
          starters: normalizedStarters,
          bench: normalizedBench
        }
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
