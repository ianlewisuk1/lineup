import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../supabase/supabase";
import { initPushNotifications } from "../capacitor/pushNotifications";
import { normalizeTeamName } from "../utils/teamName";
import { teamLogoUrl } from "../utils/teamLogo";

const AuthContext = createContext();

// Builds the normalized teams map from raw DB rows (teams joined with team_season_stats)
const buildTeamsMap = (rows) => {
  const map = {};
  (rows || []).forEach((t) => {
    if (!t.school) return;
    // Flatten the nested team_season_stats array (Supabase embedded select returns array)
    const stats = t.team_season_stats?.[0] || {};
    map[normalizeTeamName(t.school)] = {
      ...t,
      logo: teamLogoUrl(t.school),
      colors: { primary: t.color, secondary: t.alternate_color },
      conference: t.conference || "Unknown",
      mascot: t.mascot || "",
      name: t.school,
      school: t.school,
      currentSeason: {
        weeklyPoints: stats.weekly_points || {},
        gamePoints: stats.game_points || 0,
        gameComplete: stats.game_complete || false,
        gameStatus: stats.game_status || null,
        record: stats.record || null,
        confRecord: stats.conf_record || null,
        atsRecord: stats.ats_record || null,
        atsWins: stats.ats_wins || 0,
        atsLosses: stats.ats_losses || 0,
        nextOpponent: stats.next_opponent || null,
        nextGameIsHome: stats.next_game_is_home || false,
        nextOpponentSpread: stats.next_opponent_spread || null,
        nextOpponentSpreadDisplay: stats.next_opponent_spread_display || null,
        totalPointsFor: stats.total_points_for || 0,
        totalPointsAgainst: stats.total_points_against || 0,
        sosRank: stats.sos_rank || null,
        isOnBye: stats.is_on_bye || false,
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
        // maybeSingle keeps a missing profile or config row from rejecting the
        // whole Promise.all, which previously left teams empty and the app in a
        // half-loaded state on any account without a users row.
        supabase.from("users").select("*").eq("id", userId).maybeSingle(),
        supabase.from("config").select("value").eq("key", "season").maybeSingle(),
        supabase.from("teams").select("*, team_season_stats(*)"),
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

  // Allows components (e.g. EditProfileModal) to update cached user data after a save
  // without triggering a full re-fetch
  const updateUserData = (patch) => setUserData(prev => ({ ...prev, ...patch }));

  return (
    <AuthContext.Provider value={{ currentUser, userData, seasonConfig, teams, loading, updateUserData }}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
