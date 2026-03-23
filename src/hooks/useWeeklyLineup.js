import { useState, useEffect } from 'react';
import { supabase } from '../supabase/supabase';
import { weeklyLineupUtils } from '../utils/weeklyLineupUtils';

export const useWeeklyLineup = ({ leagueId, userId, currentWeek }) => {
  const [selectedWeek, setSelectedWeek] = useState(currentWeek);
  const [weeklyLineups, setWeeklyLineups] = useState({});
  const [weekStatuses, setWeekStatuses] = useState({});
  const [loading, setLoading] = useState(true);
  const [availableWeeks, setAvailableWeeks] = useState([]);
  const [hasTripPlay, setHasTripPlay] = useState(false);
  const [tripPlayUsedWeek, setTripPlayUsedWeek] = useState(null);

  useEffect(() => {
    initializeWeeklyLineups();
  }, [leagueId, userId, currentWeek]); // Fix: currentWeek was missing, causing stale lineups on week change

  const initializeWeeklyLineups = async () => {
    try {
      const weeks = Array.from({ length: 14 }, (_, i) => i + 1);
      setAvailableWeeks(weeks);

      // Single query for current lineup + trip play status (was two separate queries)
      const { data: memberData } = await supabase
        .from('league_members')
        .select('starters, bench, captain, trip_play_team, has_trip_play, trip_play_used_week')
        .eq('league_id', leagueId)
        .eq('user_id', userId)
        .single();

      if (memberData) {
        setHasTripPlay(memberData.has_trip_play || false);
        setTripPlayUsedWeek(memberData.trip_play_used_week || null);
      }

      const { data: weeklyRows } = await supabase
        .from('weekly_lineups')
        .select('*')
        .eq('league_id', leagueId)
        .eq('user_id', userId);

      const historicalData = {};
      (weeklyRows || []).forEach(row => {
        historicalData[`week${row.week}`] = row;
      });

      const lineupData = {};
      weeks.forEach(week => {
        const weekKey = `week${week}`;
        const histRow = historicalData[weekKey];

        if (week === currentWeek && memberData) {
          lineupData[weekKey] = {
            starters: memberData.starters || Array(5).fill(null),
            bench: memberData.bench || Array(2).fill(null),
            captain: memberData.captain || null,
            tripPlayTeam: memberData.trip_play_team || null,
            lockedTeams: [],
            teamLockTimes: {},
            lockedAt: null,
            isEditable: true
          };
        } else if (histRow) {
          lineupData[weekKey] = {
            starters: histRow.starters || Array(5).fill(null),
            bench: histRow.bench || Array(2).fill(null),
            captain: histRow.captain || null,
            tripPlayTeam: histRow.trip_play_team || null,
            lockedTeams: [],
            teamLockTimes: {},
            lockedAt: null,
            isEditable: week === currentWeek
          };
        } else {
          lineupData[weekKey] = {
            starters: Array(5).fill(null),
            bench: Array(2).fill(null),
            captain: null,
            tripPlayTeam: null,
            lockedTeams: [],
            teamLockTimes: {},
            lockedAt: null,
            isEditable: week === currentWeek
          };
        }
      });

      setWeeklyLineups(lineupData);
      calculateWeekStatuses(weeks); // no longer async
      setLoading(false);
    } catch (error) {
      console.error("Error initializing weekly lineups:", error);
      setLoading(false);
    }
  };

  // Fix: was unnecessarily async — doesn't await anything
  const calculateWeekStatuses = (weeks) => {
    const statuses = {};
    for (const week of weeks) {
      let status = 'future';
      if (week < currentWeek) status = 'completed';
      else if (week === currentWeek) status = 'editable';
      statuses[week] = {
        status,
        lockTime: null,
        unlockTime: null,
        firstGameTime: null,
        lastGameTime: null,
        allGamesComplete: week < currentWeek,
        hasLiveGames: false
      };
    }
    setWeekStatuses(statuses);
  };

  const saveLineup = async (week, starters, bench, captain = null, tripPlayTeam = null) => {
    try {
      if (week !== currentWeek) {
        console.warn(`Cannot save Week ${week}. Only current week (${currentWeek}) can be edited.`);
        return;
      }

      const normalizedStarters = starters.map(team => team ? weeklyLineupUtils.normalizeTeamName(team) : null);
      const normalizedBench = bench.map(team => team ? weeklyLineupUtils.normalizeTeamName(team) : null);

      // Fix: use existing state instead of re-fetching from DB
      const weekKey = `week${week}`;
      const currentTripPlayTeam = weeklyLineups[weekKey]?.tripPlayTeam || null;

      const memberUpdate = {
        starters: normalizedStarters,
        bench: normalizedBench,
        captain,
        trip_play_team: tripPlayTeam
      };

      if (tripPlayTeam && hasTripPlay) {
        memberUpdate.has_trip_play = false;
        memberUpdate.trip_play_used_week = week;
        setHasTripPlay(false);
        setTripPlayUsedWeek(week);
      } else if (!tripPlayTeam && currentTripPlayTeam && tripPlayUsedWeek === week) {
        memberUpdate.has_trip_play = true;
        memberUpdate.trip_play_used_week = null;
        setHasTripPlay(true);
        setTripPlayUsedWeek(null);
      } else if (!tripPlayTeam && currentTripPlayTeam && tripPlayUsedWeek !== week) {
        console.warn("Cannot remove trip play - it was used in a different week");
      }

      const { error: memberSaveError } = await supabase
        .from('league_members')
        .update(memberUpdate)
        .eq('league_id', leagueId)
        .eq('user_id', userId);

      if (memberSaveError) throw memberSaveError;

      setWeeklyLineups(prev => ({
        ...prev,
        [weekKey]: {
          ...prev[weekKey],
          starters: normalizedStarters,
          bench: normalizedBench,
          captain,
          tripPlayTeam: tripPlayTeam,
        }
      }));
    } catch (error) {
      console.error("Error saving lineup:", error);
      throw error;
    }
  };

  const getTripPlayStatusMessage = () => {
    if (hasTripPlay) return "x3 PLAY AVAILABLE";
    if (tripPlayUsedWeek) return `x3 PLAY USED (Week ${tripPlayUsedWeek})`;
    return "x3 USED";
  };

  // Fix: was returning JSX from a hook (anti-pattern) — moved to WeeklyLineupManager component
  const getWeekStatus = (week) => weekStatuses[week]?.status;

  const getStatusMessage = (week) => {
    const status = weekStatuses[week];
    if (!status) return "Loading...";
    switch (status.status) {
      case 'editable':       return 'Teams lock 1 hour before their games start';
      case 'live':           return 'Games are live! Check your scores';
      case 'locked_playing': return 'Games in progress - individual teams may be locked';
      case 'completed':      return 'Week completed';
      case 'future':         return 'Future week';
      default:               return 'Individual teams lock based on game times';
    }
  };

  const formatDateTime = (date) =>
    new Date(date).toLocaleString('en-US', {
      month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit',
      timeZoneName: 'short'
    });

  return {
    selectedWeek,
    setSelectedWeek,
    weeklyLineups,
    weekStatuses,
    loading,
    availableWeeks,
    hasTripPlay,
    tripPlayUsedWeek,
    saveLineup,
    getTripPlayStatusMessage,
    getWeekStatus,
    getStatusMessage,
    formatDateTime,
  };
};
