// weeklyLineupUtils.js - Utility functions for weekly lineup management
import { supabase } from '../supabase/supabase';
import { normalizeTeamName } from './teamName';

/*
Database Structure for Weekly Lineups (Supabase):

weekly_lineups table: id, league_id, member_id, week, starters (text[]), bench (text[]),
  captain, trip_play_team, frozen_teams, team_points, points
league_members table: id, league_id, user_id, team_name, avatar_url, points,
  has_trip_play, trip_play_used_week, freezes_remaining
teams table: id (text slug), school, mascot, color, classification, conference, ...
  (logo_filename exists but is null on every row and is not read — logos come
   from /public/logos via utils/teamLogo.js)
team_season_stats table: team_id (FK→teams.id), season_year, record, conf_record, ats_record,
  ats_wins, ats_losses, game_points, weekly_points (jsonb), game_status, game_complete,
  is_on_bye, next_opponent, next_game_is_home, next_opponent_spread, next_opponent_spread_display,
  total_points_for, total_points_against, sos_rank
*/

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
    return normalizeTeamName(team.school);
  },

  // Calculate points for a specific week's lineup
  // Uses member_id and joins teams with team_season_stats for game_points
  calculateWeeklyPoints: async (leagueId, memberId, weekNum) => {
    try {
      const { data: weekRow, error: weekError } = await supabase
        .from('weekly_lineups')
        .select('starters, bench')
        .eq('league_id', leagueId)
        .eq('member_id', memberId)
        .eq('week', weekNum)
        .single();

      if (weekError || !weekRow) return 0;

      const { data: teamsData, error: teamsError } = await supabase
        .from('teams')
        .select('id, school, team_season_stats(game_points)');

      if (teamsError) throw teamsError;

      const teamsMap = {};
      (teamsData || []).forEach(team => {
        if (team.school) {
          const normalized = weeklyLineupUtils.normalizeTeamName(team);
          teamsMap[normalized] = {
            ...team,
            game_points: team.team_season_stats?.[0]?.game_points || 0,
          };
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
