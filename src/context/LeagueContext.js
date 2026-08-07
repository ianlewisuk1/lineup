import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../supabase/supabase";
import { useAuth } from "./AuthContext";

const LeagueContext = createContext(null);

export function LeagueProvider({ children }) {
  const { leagueId } = useParams();
  const { currentUser, seasonConfig } = useAuth();
  const [leagueData, setLeagueData] = useState(null);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  // True once a load has finished without finding the league. RLS hides leagues
  // the user is not a member of, so "deleted" and "not yours" look identical
  // here — both mean this route is a dead end.
  const [unavailable, setUnavailable] = useState(false);

  // currentWeek comes from session-level seasonConfig in AuthContext — no extra DB query needed
  const week = seasonConfig?.currentWeek ?? 1;
  const currentWeek = typeof week === "number" ? week : parseInt(String(week).match(/\d+/)?.[0] || "1", 10);

  const load = useCallback(async () => {
    if (!leagueId) return;

    // maybeSingle, not single: single() rejects with PGRST116 when the row is
    // hidden or absent, and the rejection used to surface as a raw 406 body.
    const [{ data: league }, { data: memberRows }] = await Promise.all([
      supabase.from("leagues").select("*").eq("id", leagueId).maybeSingle(),
      supabase.from("league_members")
        .select("id, user_id, team_name, points, avatar_url, users(first_name, last_name)")
        .eq("league_id", leagueId),
    ]);

    setLeagueData(league ?? null);
    setUnavailable(!league);

    setMembers((memberRows || []).map((m) => ({
      ...m,
      first_name: m.users?.first_name || "",
      last_name: m.users?.last_name || "",
    })));

    setLoading(false);
  }, [leagueId]);

  useEffect(() => {
    setLoading(true);
    setLeagueData(null);
    setMembers([]);
    setUnavailable(false);
    load();

    const channel = supabase
      .channel(`league-ctx-${leagueId}`)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "league_members",
        filter: `league_id=eq.${leagueId}`
      }, load)
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "leagues",
        filter: `id=eq.${leagueId}`
      }, (payload) => {
        setLeagueData(payload.new);
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [leagueId, load]);

  const isAdmin = !!(currentUser && leagueData && currentUser.id === leagueData.admin_id);
  const isDraftComplete = leagueData?.draft_complete || false;
  const currentUserId = currentUser?.id || null;
  const currentMemberId = currentUser
    ? (members.find((m) => m.user_id === currentUser.id)?.id ?? null)
    : null;

  return (
    <LeagueContext.Provider value={{ leagueId, leagueData, members, isAdmin, isDraftComplete, currentUserId, currentMemberId, currentWeek, loading, unavailable }}>
      {children}
    </LeagueContext.Provider>
  );
}

export function useLeague() {
  return useContext(LeagueContext);
}
