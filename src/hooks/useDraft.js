import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabase/supabase';

/**
 * useDraft — single source of truth for live draft state.
 *
 * Subscribes to the `drafts` and `draft_picks` tables via Supabase
 * real-time. All mutation goes through the `make_pick` RPC so the DB
 * is always the authority.
 */
export function useDraft(leagueId) {
  const [draft, setDraft]           = useState(null);   // drafts row
  const [picks, setPicks]           = useState([]);      // draft_picks rows, asc pick_number
  const [members, setMembers]       = useState([]);      // league_members + user names
  const [teams, setTeams]           = useState([]);      // all FBS teams (for pick board)
  const [currentUserId, setCurrentUserId] = useState(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);

  // ── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!leagueId) return;
    let channel;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [
          { data: { user } },
          { data: draftRow,  error: draftErr  },
          { data: pickRows,  error: picksErr  },
          { data: memberRows, error: membersErr },
          { data: teamRows,  error: teamsErr  },
        ] = await Promise.all([
          supabase.auth.getUser(),
          supabase.from('drafts').select('*').eq('league_id', leagueId).single(),
          supabase.from('draft_picks').select('*').eq('league_id', leagueId).order('pick_number'),
          supabase.from('league_members')
            .select('user_id, team_name, users(first_name, last_name)')
            .eq('league_id', leagueId),
          supabase.from('teams').select('id, school, mascot, logos, conference, game_points, sos_rank')
            .in('classification', ['fbs', 'FBS']).order('game_points', { ascending: false }),
        ]);

        if (draftErr) throw draftErr;
        if (picksErr) throw picksErr;
        if (membersErr) throw membersErr;
        if (teamsErr) throw teamsErr;

        setCurrentUserId(user?.id ?? null);
        setDraft(draftRow);
        setPicks(pickRows ?? []);
        setMembers(memberRows ?? []);
        setTeams(teamRows ?? []);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    load();

    // ── Real-time subscriptions ──────────────────────────────────────────────
    channel = supabase
      .channel(`draft:${leagueId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'drafts', filter: `league_id=eq.${leagueId}` },
        (payload) => {
          if (payload.eventType === 'UPDATE') {
            setDraft((prev) => ({ ...prev, ...payload.new }));
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'draft_picks', filter: `league_id=eq.${leagueId}` },
        (payload) => {
          setPicks((prev) => {
            // Avoid duplicates from optimistic updates
            if (prev.some((p) => p.id === payload.new.id)) return prev;
            return [...prev, payload.new].sort((a, b) => a.pick_number - b.pick_number);
          });
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'league_members', filter: `league_id=eq.${leagueId}` },
        async () => {
          // Re-fetch members when someone joins
          const { data } = await supabase
            .from('league_members')
            .select('user_id, team_name, users(first_name, last_name)')
            .eq('league_id', leagueId);
          if (data) setMembers(data);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [leagueId]);

  // ── Derived state ─────────────────────────────────────────────────────────
  const pickedTeamIds  = new Set(picks.map((p) => p.team_id));
  const availableTeams = teams.filter((t) => !pickedTeamIds.has(t.id));

  const nManagers   = draft?.draft_order?.length ?? 0;
  const totalRounds = draft?.total_rounds ?? 9;
  const totalPicks  = nManagers * totalRounds;

  const currentPickIndex = draft?.current_pick_index ?? 0;
  const currentPickerUid = draft?.status === 'active'
    ? snakePicker(draft.draft_order, currentPickIndex)
    : null;

  const isMyTurn = !!currentPickerUid && currentPickerUid === currentUserId;
  const pickDeadline = draft?.pick_deadline ? new Date(draft.pick_deadline) : null;

  // Picks per user (for roster display)
  const rosterByUser = picks.reduce((acc, p) => {
    if (!acc[p.user_id]) acc[p.user_id] = [];
    acc[p.user_id].push(p.team_id);
    return acc;
  }, {});

  // Member lookup map
  const memberMap = members.reduce((acc, m) => {
    acc[m.user_id] = {
      teamName:  m.team_name,
      firstName: m.users?.first_name ?? '',
      lastName:  m.users?.last_name  ?? '',
      name:      m.users?.first_name
                   ? `${m.users.first_name} ${m.users.last_name ?? ''}`.trim()
                   : m.team_name,
    };
    return acc;
  }, {});

  // ── Actions ───────────────────────────────────────────────────────────────
  const makePick = useCallback(async (teamId) => {
    if (!draft?.id) return { error: 'No draft' };
    const { data, error } = await supabase.rpc('make_pick', {
      p_draft_id: draft.id,
      p_team_id:  teamId,
    });
    if (error) return { error: error.message };
    return data;
  }, [draft?.id]);

  const startDraft = useCallback(async () => {
    const { data, error } = await supabase.rpc('start_draft', {
      p_league_id: leagueId,
    });
    if (error) return { error: error.message };
    // Manually refresh draft state in case real-time doesn't fire immediately
    if (data?.success) {
      const { data: updated } = await supabase.from('drafts').select('*').eq('league_id', leagueId).single();
      if (updated) setDraft(updated);
    }
    return data;
  }, [leagueId]);

  const saveDraftOrder = useCallback(async (order) => {
    if (!draft?.id) return { error: 'No draft' };
    const { error } = await supabase
      .from('drafts')
      .update({ draft_order: order })
      .eq('id', draft.id);
    if (error) return { error: error.message };
    return { success: true };
  }, [draft?.id]);

  return {
    // Raw state
    draft,
    picks,
    members,
    teams,
    currentUserId,
    loading,
    error,
    // Derived
    availableTeams,
    pickedTeamIds,
    currentPickerUid,
    currentPickIndex,
    isMyTurn,
    pickDeadline,
    totalPicks,
    totalRounds,
    nManagers,
    rosterByUser,
    memberMap,
    // Actions
    makePick,
    startDraft,
    saveDraftOrder,
  };
}

// Snake draft: even rounds go forward, odd rounds go backward
function snakePicker(order, pickIndex) {
  if (!order || order.length === 0) return null;
  const n     = order.length;
  const round = Math.floor(pickIndex / n);
  const pos   = round % 2 === 0
    ? pickIndex % n
    : (n - 1) - (pickIndex % n);
  return order[pos];
}
