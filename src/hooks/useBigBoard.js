import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../supabase/supabase";
import { useAuth } from "../context/AuthContext";

export const BIG_BOARD_LIMIT = 15;

const SAVE_DEBOUNCE_MS = 400;

/**
 * Per-user, per-league pre-draft big board — an ordered list of at most
 * BIG_BOARD_LIMIT team slugs, stored as one `big_boards` row.
 *
 * Writes are optimistic and debounced; a failed write refetches the row so the
 * UI never drifts from the database. localStorage is a first-paint shortcut
 * only (matters on Capacitor cold start), never the source of truth.
 *
 * `pickedTeamIds` is optional. When supplied, drafted teams are dropped from
 * the local list immediately — the 018 trigger has already removed them
 * server-side, so this is a mirror, not a write.
 */
export function useBigBoard(leagueId, pickedTeamIds) {
  const { currentUser } = useAuth();
  const userId = currentUser?.id ?? null;
  const cacheKey = leagueId && userId ? `bigboard:${leagueId}:${userId}` : null;

  const [board, setBoard] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const boardRef = useRef([]);
  const pickedRef = useRef(pickedTeamIds);
  const saveTimer = useRef(null);
  pickedRef.current = pickedTeamIds;

  const apply = useCallback((next) => {
    boardRef.current = next;
    setBoard(next);
    if (cacheKey) localStorage.setItem(cacheKey, JSON.stringify(next));
  }, [cacheKey]);

  const fetchBoard = useCallback(async () => {
    if (!cacheKey) return;
    const { data, error: err } = await supabase
      .from("big_boards")
      .select("team_ids")
      .eq("league_id", leagueId)
      .eq("user_id", userId)
      .maybeSingle();
    if (err) { setError(err.message); return; }
    setError(null);
    apply(data?.team_ids ?? []);
  }, [cacheKey, leagueId, userId, apply]);

  useEffect(() => {
    if (!cacheKey) { setLoading(false); return; }

    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      try {
        const arr = JSON.parse(cached);
        if (Array.isArray(arr)) { boardRef.current = arr; setBoard(arr); }
      } catch { /* corrupt cache — the fetch below replaces it */ }
    }

    let cancelled = false;
    setLoading(true);
    fetchBoard().finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [cacheKey, fetchBoard]);

  // Mirror the server-side trigger: a drafted team leaves the board.
  useEffect(() => {
    if (!pickedTeamIds || pickedTeamIds.size === 0) return;
    const next = boardRef.current.filter((id) => !pickedTeamIds.has(id));
    if (next.length !== boardRef.current.length) apply(next);
  }, [pickedTeamIds, apply]);

  const flush = useCallback(async () => {
    if (!cacheKey) return;
    const picked = pickedRef.current;
    // Re-filter at write time so a save queued just before a pick landed can't
    // resurrect a team the trigger already stripped.
    const teamIds = picked ? boardRef.current.filter((id) => !picked.has(id)) : boardRef.current;

    const { error: err } = await supabase.from("big_boards").upsert(
      { user_id: userId, league_id: leagueId, team_ids: teamIds, updated_at: new Date().toISOString() },
      { onConflict: "user_id,league_id" },
    );

    if (err) { setError(err.message); fetchBoard(); return; }
    setError(null);
  }, [cacheKey, userId, leagueId, fetchBoard]);

  const scheduleSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { saveTimer.current = null; flush(); }, SAVE_DEBOUNCE_MS);
  }, [flush]);

  // Don't lose a pending edit on navigation away from the page.
  useEffect(() => () => {
    if (saveTimer.current) { clearTimeout(saveTimer.current); flush(); }
  }, [flush]);

  const isOnBoard = useCallback((teamId) => board.includes(teamId), [board]);

  const rankOf = useCallback((teamId) => {
    const i = board.indexOf(teamId);
    return i === -1 ? null : i + 1;
  }, [board]);

  /** Adds or removes. Returns { ok } — ok:false with reason:'full' at the cap. */
  const toggle = useCallback((teamId) => {
    if (!cacheKey) return { ok: false, reason: "no-session" };
    const cur = boardRef.current;

    if (cur.includes(teamId)) {
      apply(cur.filter((t) => t !== teamId));
      scheduleSave();
      return { ok: true, action: "removed" };
    }

    if (cur.length >= BIG_BOARD_LIMIT) return { ok: false, reason: "full" };

    apply([...cur, teamId]);
    scheduleSave();
    return { ok: true, action: "added" };
  }, [cacheKey, apply, scheduleSave]);

  const remove = useCallback((teamId) => {
    if (!boardRef.current.includes(teamId)) return;
    apply(boardRef.current.filter((t) => t !== teamId));
    scheduleSave();
  }, [apply, scheduleSave]);

  return {
    board,
    count: board.length,
    limit: BIG_BOARD_LIMIT,
    isFull: board.length >= BIG_BOARD_LIMIT,
    isOnBoard,
    rankOf,
    toggle,
    remove,
    loading,
    error,
  };
}
