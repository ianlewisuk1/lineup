import { useAuth } from "../context/AuthContext";

/**
 * Returns the normalized teams map fetched at session start in AuthContext.
 * No DB query — reads from session-level cache.
 *
 * Returns { teams, loading } where teams is { [normalizedSchoolName]: enrichedTeamObject }
 */
export function useTeams() {
  const { teams, loading } = useAuth();
  return { teams, loading };
}
