import { useState, useEffect } from 'react';
import { supabase } from '../supabase/supabase';
import { weeklyLineupUtils } from '../utils/weeklyLineupUtils';

export const useWeeklyLineup = ({ leagueId, memberId, currentWeek }) => {
  const [selectedWeek, setSelectedWeek] = useState(currentWeek);
  const [weeklyLineups, setWeeklyLineups] = useState({});
  const [weekStatuses, setWeekStatuses] = useState({});
  const [loading, setLoading] = useState(true);
  const [availableWeeks, setAvailableWeeks] = useState([]);
  const [hasTripPlay, setHasTripPlay] = useState(false);
  const [tripPlayUsedWeek, setTripPlayUsedWeek] = useState(null);
  const [freezesRemaining, setFreezesRemaining] = useState(0);

  useEffect(() => {
    initializeWeeklyLineups();
  }, [leagueId, memberId, currentWeek]); // eslint-disable-line react-hooks/exhaustive-deps

  const initializeWeeklyLineups = async () => {
    if (!leagueId || !memberId) {
      setLoading(false);
      return;
    }
    try {
      const weeks = Array.from({ length: 14 }, (_, i) => i + 1);
      setAvailableWeeks(weeks);

      // Fetch member status fields + all weekly lineup rows in parallel
      const [{ data: memberData }, { data: weeklyRows }] = await Promise.all([
        supabase
          .from('league_members')
          .select('has_trip_play, trip_play_used_week, freezes_remaining')
          .eq('id', memberId)
          .single(),
        supabase
          .from('weekly_lineups')
          .select('*')
          .eq('league_id', leagueId)
          .eq('member_id', memberId),
      ]);

      if (memberData) {
        setHasTripPlay(memberData.has_trip_play || false);
        setTripPlayUsedWeek(memberData.trip_play_used_week || null);
        setFreezesRemaining(memberData.freezes_remaining ?? 0);
      }

      const historicalData = {};
      (weeklyRows || []).forEach(row => {
        historicalData[`week${row.week}`] = row;
      });

      const lineupData = {};
      weeks.forEach(week => {
        const weekKey = `week${week}`;
        const histRow = historicalData[weekKey];

        if (histRow) {
          lineupData[weekKey] = {
            starters: histRow.starters || Array(5).fill(null),
            bench: histRow.bench || Array(2).fill(null),
            captain: histRow.captain || null,
            tripPlayTeam: histRow.trip_play_team || null,
            frozenTeams: histRow.frozen_teams || [],
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
            frozenTeams: [],
            lockedTeams: [],
            teamLockTimes: {},
            lockedAt: null,
            isEditable: week === currentWeek
          };
        }
      });

      setWeeklyLineups(lineupData);
      calculateWeekStatuses(weeks);
      setLoading(false);
    } catch (error) {
      console.error("Error initializing weekly lineups:", error);
      setLoading(false);
    }
  };

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

      const weekKey = `week${week}`;
      const currentTripPlayTeam = weeklyLineups[weekKey]?.tripPlayTeam || null;

      // Upsert lineup row in weekly_lineups
      const { error: upsertError } = await supabase
        .from('weekly_lineups')
        .upsert({
          league_id: leagueId,
          member_id: memberId,
          week,
          starters: normalizedStarters,
          bench: normalizedBench,
          captain,
          trip_play_team: tripPlayTeam,
        }, { onConflict: 'league_id,member_id,week' });

      if (upsertError) throw upsertError;

      // Handle trip play state changes on league_members
      let memberPatch = null;
      if (tripPlayTeam && hasTripPlay) {
        memberPatch = { has_trip_play: false, trip_play_used_week: week };
        setHasTripPlay(false);
        setTripPlayUsedWeek(week);
      } else if (!tripPlayTeam && currentTripPlayTeam && tripPlayUsedWeek === week) {
        memberPatch = { has_trip_play: true, trip_play_used_week: null };
        setHasTripPlay(true);
        setTripPlayUsedWeek(null);
      } else if (!tripPlayTeam && currentTripPlayTeam && tripPlayUsedWeek !== week) {
        console.warn("Cannot remove trip play - it was used in a different week");
      }

      if (memberPatch) {
        const { error: memberErr } = await supabase
          .from('league_members')
          .update(memberPatch)
          .eq('id', memberId);
        if (memberErr) throw memberErr;
      }

      setWeeklyLineups(prev => ({
        ...prev,
        [weekKey]: {
          ...prev[weekKey],
          starters: normalizedStarters,
          bench: normalizedBench,
          captain,
          tripPlayTeam,
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
    freezesRemaining,
    saveLineup,
    getTripPlayStatusMessage,
    getWeekStatus,
    getStatusMessage,
    formatDateTime,
  };
};
