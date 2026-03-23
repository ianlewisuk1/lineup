import { useAuth } from "../context/AuthContext";

/**
 * Returns the season config fetched at session start in AuthContext.
 * No DB query — reads from session-level cache.
 *
 * Returns { config, loading } where config is { currentWeek, faLocked, ... }
 */
export function useSeasonConfig() {
  const { seasonConfig, loading } = useAuth();
  return { config: seasonConfig, loading };
}
