/**
 * Shared team stats helpers used across FreeAgents, TeamPage, and Scouting.
 */

/**
 * Returns total games played (wins + losses) from a "W-L" record string.
 * Used for calculating per-game averages.
 */
export function parseGamesPlayed(record) {
  if (!record || record === "0-0") return 0;
  const parts = record.split("-");
  if (parts.length !== 2) return 0;
  const wins = parseInt(parts[0]) || 0;
  const losses = parseInt(parts[1]) || 0;
  return wins + losses;
}

/**
 * Returns [wins, losses] from a "W-L" record string.
 * Used for record-based sorting.
 */
export function parseRecord(record) {
  if (!record || !record.includes("-")) return [0, 0];
  const [wins, losses] = record.split("-").map(Number);
  return [wins, losses];
}

/**
 * Safely calculates a per-game average, returning "0.0" when no games played.
 */
export function calculateAverage(total, gamesPlayed) {
  if (!gamesPlayed || gamesPlayed === 0) return "0.0";
  return (total / gamesPlayed).toFixed(1);
}
