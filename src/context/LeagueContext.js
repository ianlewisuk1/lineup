import { createContext, useContext, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../supabase/supabase";
import { useAuth } from "./AuthContext";

const LeagueContext = createContext(null);

export function LeagueProvider({ children }) {
  const { leagueId } = useParams();
  const { currentUser } = useAuth();
  const [leagueData, setLeagueData] = useState(null);
  const [members, setMembers] = useState([]);
  const [currentWeek, setCurrentWeek] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!leagueId) return;

    const [{ data: league }, { data: memberRows }, { data: configRow }] = await Promise.all([
      supabase.from("leagues").select("*").eq("id", leagueId).single(),
      supabase.from("league_members")
        .select("user_id, team_name, points, joined_at, team_avatar, custom_avatar")
        .eq("league_id", leagueId),
      supabase.from("config").select("value").eq("key", "season").single(),
    ]);

    const week = configRow?.value?.currentWeek ?? 1;
    setCurrentWeek(typeof week === "number" ? week : parseInt(String(week).match(/\d+/)?.[0] || "1", 10));

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
        }))
        .sort((a, b) => new Date(a.joined_at) - new Date(b.joined_at));
      setMembers(enriched);
    } else {
      setMembers([]);
    }

    setLoading(false);
  };

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
  }, [leagueId]); // eslint-disable-line react-hooks/exhaustive-deps

  const isAdmin = !!(currentUser && leagueData && currentUser.id === leagueData.admin_id);
  const isDraftComplete = leagueData?.draft_complete || false;
  const currentUserId = currentUser?.id || null;

  return (
    <LeagueContext.Provider value={{ leagueData, members, isAdmin, isDraftComplete, currentUserId, currentWeek, loading }}>
      {children}
    </LeagueContext.Provider>
  );
}

export function useLeague() {
  return useContext(LeagueContext);
}
