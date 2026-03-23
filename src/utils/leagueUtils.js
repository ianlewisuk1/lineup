import { normalize, getScheduleEntry } from "./scheduleUtils";

/**
 * Converts the currentWeek value (number or string like "3") to a plain integer.
 * Used in many places throughout MyLeague where currentWeek might be either type.
 */
export function getCurrentWeekNumber(currentWeek) {
  if (typeof currentWeek === "number") return currentWeek;
  if (!currentWeek || typeof currentWeek !== "string") return 1;
  const weekMatch = currentWeek.match(/\d+/);
  return weekMatch ? parseInt(weekMatch[0]) : 1;
}

/**
 * Returns true if any of a member's owned teams has a live game this week.
 * Only meaningful when viewMode === 'current'.
 */
export function getMemberLiveStatus(
  member,
  { viewMode, scheduleData, scheduleLoading, allTeams }
) {
  if (viewMode !== "current") return false;

  const lineup = member.lineup || {};
  const starters = Array.isArray(lineup.starters) ? lineup.starters : [];
  const bench = Array.isArray(lineup.bench) ? lineup.bench : [];
  const ownedTeams = [...starters, ...bench].filter(
    (t) => typeof t === "string" && t.trim() !== ""
  );

  return ownedTeams.some((teamName) => {
    const scheduleGame = getScheduleEntry(scheduleData, teamName);
    if (scheduleGame && !scheduleLoading) {
      return scheduleGame.gameStatus === "in_progress" || scheduleGame.hasLiveGame;
    }
    const team = allTeams[normalize(teamName)];
    return (
      team?.currentSeason?.gameStatus === "in_progress" ||
      team?.currentSeason?.hasLiveGame
    );
  });
}

/**
 * Returns the sorted list of members to display based on viewMode.
 * Current mode: sorted by cumulative points then weekly points.
 * Historical mode: returns the pre-ranked weekly snapshot.
 */
export function getDisplayData({ viewMode, members, weeklyStandings, selectedWeek }) {
  if (viewMode === "current") {
    return [...members].sort((a, b) => {
      const aPoints = a.points ?? 0;
      const bPoints = b.points ?? 0;
      if (bPoints !== aPoints) return bPoints - aPoints;
      return (b.weeklyPoints ?? 0) - (a.weeklyPoints ?? 0);
    });
  }
  return weeklyStandings[selectedWeek] || [];
}
