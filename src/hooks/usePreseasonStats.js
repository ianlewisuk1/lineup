import { useState, useEffect } from "react";
import { supabase } from "../supabase/supabase";
import { SEASON_YEAR } from "../utils/season";

export function usePreseasonStats() {
  const CACHE_KEY = `preseason-${SEASON_YEAR}`;

  const [data, setData] = useState(() => {
    const cached = localStorage.getItem(CACHE_KEY);
    return cached ? JSON.parse(cached) : null;
  });
  const [loading, setLoading] = useState(!data);

  useEffect(() => {
    if (data) return;
    supabase
      .from("team_preseason_stats")
      .select("*")
      .eq("season_year", SEASON_YEAR)
      .then(({ data: rows }) => {
        const map = {};
        (rows || []).forEach(r => { map[r.team_id] = r; });
        localStorage.setItem(CACHE_KEY, JSON.stringify(map));
        setData(map);
        setLoading(false);
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { preseasonData: data || {}, loading };
}
