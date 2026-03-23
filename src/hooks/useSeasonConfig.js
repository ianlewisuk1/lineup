import { useEffect, useState } from "react";
import { supabase } from "../supabase/supabase";

/**
 * Fetches the season config row once and returns the parsed value object.
 * Replaces the repeated supabase.from('config').select('value').eq('key','season') pattern.
 *
 * Returns { config, loading } where config is the value object (e.g. { currentWeek, faLocked, ... })
 */
export function useSeasonConfig() {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("config")
      .select("value")
      .eq("key", "season")
      .single()
      .then(({ data, error }) => {
        if (!error && data) setConfig(data.value);
        setLoading(false);
      });
  }, []);

  return { config, loading };
}
