import { useState, useEffect } from "react";
import { supabase } from "../supabase/supabase";
import { SEASON_YEAR } from "../utils/season";
import { normalize, canonicalizeTeam } from "../utils/scheduleUtils";
import { getCurrentWeekNumber } from "../utils/leagueUtils";

/**
 * Encapsulates all async data-fetching for the MyLeague page.
 *
 * Returns:
 *   members, leagueName, maxManagers, loading,
 *   scheduleData, scheduleLoading,
 *   weeklyStandings, availableWeeks, standingsLoading,
 *   playoffBracket,
 *   loadWeeklyStandings   ← called by WeekSelector on user interaction
 */
export function useLeagueData({ leagueId, currentWeek, ctxLeagueData }) {
  const [members, setMembers] = useState([]);
  const [leagueName, setLeagueName] = useState("");
  const [maxManagers, setMaxManagers] = useState(8);
  const [loading, setLoading] = useState(true);

  const [scheduleData, setScheduleData] = useState({});
  const [scheduleLoading, setScheduleLoading] = useState(true);

  const [weeklyStandings, setWeeklyStandings] = useState({});
  const [availableWeeks, setAvailableWeeks] = useState([]);
  const [standingsLoading, setStandingsLoading] = useState(false);

  const [playoffBracket, setPlayoffBracket] = useState(null);

  // ── weekly standings (lazy – called on demand by WeekSelector) ───────────────

  const loadWeeklyStandings = async (week) => {
    if (weeklyStandings[week]) return; // already cached

    try {
      setStandingsLoading(true);
      const { data: standingsData } = await supabase
        .from("weekly_standings")
        .select("*")
        .eq("league_id", leagueId)
        .eq("week", week.toString());

      const weekStandings = (standingsData || [])
        .map((row) => ({
          id: row.user_id,
          rank: row.rank,
          points: row.points,
          teamName: row.team_name,
        }))
        .sort((a, b) => (a.rank || 0) - (b.rank || 0));

      setWeeklyStandings((prev) => ({ ...prev, [week]: weekStandings }));
    } catch (error) {
      console.error(`Error loading Week ${week} standings:`, error);
    } finally {
      setStandingsLoading(false);
    }
  };

  // ── main data load ──────────────────────────────────────────────────────────

  useEffect(() => {
    const fetchData = async () => {
      // ── helpers (defined here so they close over current args without needing deps) ──

      const fetchScheduleData = async (weekNum) => {
        try {
          setScheduleLoading(true);
          const { data: gamesData } = await supabase
            .from("games").select("*").eq("year", SEASON_YEAR).eq("week", weekNum.toString());
          const gamesByTeam = {};
          (gamesData || []).forEach((game) => {
            const homeTeam = game.home_team;
            const awayTeam = game.away_team;
            if (!homeTeam || !awayTeam) return;
            const homeData = {
              opponent: awayTeam, isHome: true,
              gameStatus: game.game_status || "scheduled",
              gameComplete: game.game_complete || false,
              homeScore: game.home_score || 0, awayScore: game.away_score || 0,
              hasLiveGame: game.game_status === "in_progress",
            };
            const awayData = {
              opponent: homeTeam, isHome: false,
              gameStatus: game.game_status || "scheduled",
              gameComplete: game.game_complete || false,
              homeScore: game.home_score || 0, awayScore: game.away_score || 0,
              hasLiveGame: game.game_status === "in_progress",
            };
            gamesByTeam[homeTeam] = homeData; gamesByTeam[awayTeam] = awayData;
            gamesByTeam[homeTeam.toLowerCase()] = homeData; gamesByTeam[awayTeam.toLowerCase()] = awayData;
            gamesByTeam[normalize(homeTeam)] = homeData; gamesByTeam[normalize(awayTeam)] = awayData;
            gamesByTeam[`__canon__:${canonicalizeTeam(homeTeam)}`] = homeData;
            gamesByTeam[`__canon__:${canonicalizeTeam(awayTeam)}`] = awayData;
          });
          setScheduleData(gamesByTeam);
        } catch (error) {
          console.error("Error fetching schedule data:", error);
        } finally {
          setScheduleLoading(false);
        }
      };

      const loadAvailableWeeks = async () => {
        try {
          const { data: standingsData } = await supabase
            .from("weekly_standings").select("week").eq("league_id", leagueId);
          if (standingsData && standingsData.length > 0) {
            const weeks = [...new Set(standingsData.map((row) => parseInt(row.week)))].sort((a, b) => a - b);
            setAvailableWeeks(weeks);
          }
        } catch (error) {
          console.error("Error loading available weeks:", error);
        }
      };

      // ── main fetch ──────────────────────────────────────────────────────────
      try {
        if (ctxLeagueData) {
          setLeagueName(ctxLeagueData.name || "League");
          setMaxManagers(ctxLeagueData.max_managers || 8);
        }

        if (currentWeek && currentWeek !== "Preseason") {
          await fetchScheduleData(currentWeek);
        } else {
          setScheduleLoading(false);
        }

        await loadAvailableWeeks();

        if (currentWeek && currentWeek > 1) {
          loadWeeklyStandings(currentWeek - 1);
        }

        const { data: membersSnapshot } = await supabase
          .from("league_members")
          .select("*")
          .eq("league_id", leagueId);

        const memberUserIds = (membersSnapshot || [])
          .map((m) => m.user_id)
          .filter(Boolean);
        const { data: usersData } = await supabase
          .from("users")
          .select("id, first_name")
          .in("id", memberUserIds);
        const userFirstNameMap = Object.fromEntries(
          (usersData || []).map((u) => [u.id, u.first_name || "Unknown"])
        );

        const membersData = (membersSnapshot || []).map((memberData) => ({
          id: memberData.user_id,
          firstName: userFirstNameMap[memberData.user_id] || "Unknown",
          captain: memberData.captain || null,
          tripPlayTeam: memberData.trip_play_team || null,
          hasTripPlay: memberData.has_trip_play || false,
          tripPlayUsedWeek: memberData.trip_play_used_week || null,
          freezesRemaining: memberData.freezes_remaining ?? 0,
          teamAvatar: memberData.avatar_url || null,
          smackTalk: memberData.smack_talk || null,
          points: memberData.points || 0,
          teamName: memberData.team_name || "Unnamed Team",
          ...memberData,
        }));

        setMembers(membersData);
        setLoading(false);
      } catch (error) {
        console.error("Error fetching data:", error);
        setLoading(false);
        setScheduleLoading(false);
      }
    };

    fetchData();
  }, [leagueId]); // intentional: only re-run when leagueId changes; schedule/members data is stable per league

  // ── playoff bracket ─────────────────────────────────────────────────────────

  useEffect(() => {
    const fetchPlayoffBracket = async () => {
      const currentWeekNum = getCurrentWeekNumber(currentWeek);
      if (currentWeekNum < 12) return;
      try {
        const { data: playoffDoc } = await supabase
          .from("playoffs")
          .select("*")
          .eq("league_id", leagueId)
          .eq("year", SEASON_YEAR)
          .single();
        if (playoffDoc) setPlayoffBracket(playoffDoc);
      } catch (error) {
        console.error("Error fetching playoff bracket:", error);
      }
    };
    fetchPlayoffBracket();
  }, [leagueId, currentWeek]);

  return {
    members,
    leagueName,
    maxManagers,
    loading,
    scheduleData,
    scheduleLoading,
    weeklyStandings,
    availableWeeks,
    standingsLoading,
    playoffBracket,
    loadWeeklyStandings,
  };
}
