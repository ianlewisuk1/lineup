import { useState, useEffect } from "react";
import { supabase } from "../supabase/supabase";

const normalizeTeamName = (name) =>
  name?.toLowerCase().replace(/\s+/g, "-").replace(/&/g, "").replace(/[^a-z0-9-]/g, "");

/**
 * Fetches all FBS teams once and returns a normalized map.
 * Replaces the repeated supabase.from('teams').select('*') pattern across MyLineup,
 * MyLeague, Scouting, FreeAgents, and TeamPage.
 *
 * Returns { teams, loading } where teams is { [normalizedSchoolName]: enrichedTeamObject }
 */
export function useTeams() {
  const [teams, setTeams] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("teams")
      .select("*")
      .then(({ data }) => {
        const map = {};
        (data || []).forEach((t) => {
          if (!t.school) return;
          map[normalizeTeamName(t.school)] = {
            ...t,
            logo: t.logos?.[0] || null,
            logos1: t.logos?.[0] || null,
            logos2: t.logos?.[1] || null,
            colors: { primary: t.color, secondary: t.alternate_color },
            conference: t.conference || "Unknown",
            mascot: t.mascot || "",
            name: t.school,
            school: t.school,
            currentSeason: {
              weeklyPoints: t.weekly_points || {},
              gamePoints: t.game_points || 0,
              gameComplete: t.game_complete || false,
              record: t.record || null,
              nextOpponent: t.next_opponent || null,
              nextGameIsHome: t.next_game_is_home || false,
              nextOpponentSpread: t.next_opponent_spread || null,
              nextOpponentSpreadDisplay: t.next_opponent_spread_display || null,
            },
          };
        });
        setTeams(map);
        setLoading(false);
      });
  }, []);

  return { teams, loading };
}
