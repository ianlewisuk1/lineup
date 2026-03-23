import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../supabase/supabase";
import { initPushNotifications } from "../capacitor/pushNotifications";

const AuthContext = createContext();

// Normalizes a team name to a consistent key format (e.g. "Ohio State" → "ohio-state")
const normalizeTeamName = (name) =>
  name?.toLowerCase().replace(/\s+/g, "-").replace(/&/g, "").replace(/[^a-z0-9-]/g, "");

// Builds the normalized teams map from raw DB rows
const buildTeamsMap = (rows) => {
  const map = {};
  (rows || []).forEach((t) => {
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
  return map;
};

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [userData, setUserData] = useState(null);       // DB user row: first_name, last_name, is_admin, etc.
  const [seasonConfig, setSeasonConfig] = useState(null); // config.value: { currentWeek, faLocked, ... }
  const [teams, setTeams] = useState({});               // normalized teams map, keyed by school name
  const [loading, setLoading] = useState(true);

  // Fetches all session-level data in parallel once we have a user ID.
  // Runs at boot and on sign-in. All three queries fire simultaneously.
  const loadSessionData = async (userId) => {
    try {
      const [
        { data: userRow },
        { data: configRow },
        { data: teamsData },
      ] = await Promise.all([
        supabase.from("users").select("*").eq("id", userId).single(),
        supabase.from("config").select("value").eq("key", "season").single(),
        supabase.from("teams").select("*"),
      ]);

      if (userRow) setUserData(userRow);
      if (configRow) setSeasonConfig(configRow.value);
      setTeams(buildTeamsMap(teamsData));
    } catch (err) {
      console.error("Failed to load session data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Check for an existing session on mount (e.g. returning user, app resume)
    supabase.auth.getSession().then(({ data: { session } }) => {
      const user = session?.user ?? null;
      setCurrentUser(user);
      if (user) {
        initPushNotifications();
        loadSessionData(user.id);
      } else {
        setLoading(false);
      }
    });

    // Listen for sign-in / sign-out / token refresh events during the session
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user ?? null;
      setCurrentUser(user);
      if (user) {
        initPushNotifications();
        loadSessionData(user.id);
      } else {
        // User signed out — clear all session data
        setUserData(null);
        setSeasonConfig(null);
        setTeams({});
      }
    });

    return () => subscription.unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AuthContext.Provider value={{ currentUser, userData, seasonConfig, teams, loading }}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
