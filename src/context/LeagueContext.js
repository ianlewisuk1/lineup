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

  // currentWeek comes from session-level seasonConfig in AuthContext — no extra DB query needed
  const week = seasonConfig?.currentWeek ?? 1;
  const currentWeek = typeof week === "number" ? week : parseInt(String(week).match(/\d+/)?.[0] || "1", 10);

  const load = useCallback(async () => {
    if (!leagueId) return;

    const [{ data: league }, { data: memberRows }] = await Promise.all([
      supabase.from("leagues").select("*").eq("id", leagueId).single(),
      supabase.from("league_members")
        .select("id, user_id, team_name, points, avatar_url")
        .eq("league_id", leagueId),
    ]);

    if (league) setLeagueData(league);

    if (memberRows?.length) {
      const userIds = memberRows.map((m) => m.user_id);
      const { data: usersData } = await supabase
        .from("users")
        .select("id, first_name, last_name")
        .in("id", userIds);
      const userMap = Object.fromEntries((usersData || []).map((u) => [u.id, u]));
      const enriched = memberRows
        .map((m) => ({
          ...m,
          first_name: userMap[m.user_id]?.first_name || "",
          last_name: userMap[m.user_id]?.last_name || "",
        }));
      setMembers(enriched);
    } else {
      setMembers([]);
    }

    setLoading(false);
  }, [leagueId]);

  useEffect(() => {
    setLoading(true);
    setLeagueData(null);
    setMembers([]);
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
    <LeagueContext.Provider value={{ leagueData, members, isAdmin, isDraftComplete, currentUserId, currentMemberId, currentWeek, loading }}>
      {children}
    </LeagueContext.Provider>
  );
}

export function useLeague() {
  return useContext(LeagueContext);
}
