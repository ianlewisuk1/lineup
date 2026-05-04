import { createContext, useContext, useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../supabase/supabase';
import { useLeague } from './LeagueContext';
import { useAuth } from './AuthContext';

const DraftContext = createContext(null);

export function DraftProvider({ children }) {
  const { leagueId } = useParams();
  const { members } = useLeague();
  const { currentUser, teams: authTeams } = useAuth();
  const currentUserId = currentUser?.id ?? null;

  const [draft, setDraft] = useState(null);
  const [picks, setPicks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!leagueId) return;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [
          { data: draftRow, error: draftErr },
          { data: pickRows,  error: picksErr  },
        ] = await Promise.all([
          supabase.from('drafts').select('*').eq('league_id', leagueId).single(),
          supabase.from('draft_picks').select('*').eq('league_id', leagueId).order('pick_number'),
        ]);

        if (draftErr) throw draftErr;
        if (picksErr) throw picksErr;

        setDraft(draftRow);
        setPicks(pickRows ?? []);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    load();

    const channel = supabase
      .channel(`draft-ctx:${leagueId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'drafts', filter: `league_id=eq.${leagueId}` },
        (payload) => {
          if (payload.eventType === 'UPDATE') setDraft((prev) => ({ ...prev, ...payload.new }));
        }
      )
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'draft_picks', filter: `league_id=eq.${leagueId}` },
        (payload) => {
          setPicks((prev) => {
            if (prev.some((p) => p.id === payload.new.id)) return prev;
            return [...prev, payload.new].sort((a, b) => a.pick_number - b.pick_number);
          });
        }
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [leagueId]);

  // Convert AuthContext teams map (keyed by normalized name) to FBS array
  const teams = useMemo(() =>
    Object.values(authTeams).filter((t) => (t.classification || '').toLowerCase() === 'fbs'),
  [authTeams]);

  const pickedTeamIds = useMemo(() => new Set(picks.map((p) => p.team_id)), [picks]);
  const availableTeams = useMemo(() => teams.filter((t) => !pickedTeamIds.has(t.id)), [teams, pickedTeamIds]);

  const nManagers      = draft?.draft_order?.length ?? 0;
  const totalRounds    = draft?.total_rounds ?? 9;
  const totalPicks     = nManagers * totalRounds;
  const currentPickIndex  = draft?.current_pick_index ?? 0;
  const currentPickerUid  = draft?.status === 'active'
    ? snakePicker(draft.draft_order, currentPickIndex)
    : null;
  const isMyTurn   = !!currentPickerUid && currentPickerUid === currentUserId;
  const pickDeadline = draft?.pick_deadline ? new Date(draft.pick_deadline) : null;

  // Keyed by user_id — consistent with draft_order
  const rosterByUser = useMemo(() => picks.reduce((acc, p) => {
    if (!acc[p.user_id]) acc[p.user_id] = [];
    acc[p.user_id].push(p.team_id);
    return acc;
  }, {}), [picks]);

  // Keyed by user_id (was incorrectly keyed by league_members.id before)
  const memberMap = useMemo(() => members.reduce((acc, m) => {
    acc[m.user_id] = {
      teamName:  m.team_name,
      firstName: m.first_name || '',
      lastName:  m.last_name  || '',
      name:      m.first_name ? `${m.first_name} ${m.last_name ?? ''}`.trim() : m.team_name,
      memberId:  m.id,
    };
    return acc;
  }, {}), [members]);

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
    const { data, error } = await supabase.rpc('start_draft', { p_league_id: leagueId });
    if (error) return { error: error.message };
    if (data?.success) {
      const { data: updated } = await supabase.from('drafts').select('*').eq('league_id', leagueId).single();
      if (updated) setDraft(updated);
    }
    return data;
  }, [leagueId]);

  const saveDraftOrder = useCallback(async (order) => {
    if (!draft?.id) return { error: 'No draft' };
    const { error } = await supabase.from('drafts').update({ draft_order: order }).eq('id', draft.id);
    if (error) return { error: error.message };
    return { success: true };
  }, [draft?.id]);

  return (
    <DraftContext.Provider value={{
      draft, picks, teams, pickedTeamIds, availableTeams,
      currentPickerUid, currentPickIndex, isMyTurn, pickDeadline,
      totalPicks, totalRounds, nManagers,
      rosterByUser, memberMap, currentUserId,
      loading, error,
      makePick, startDraft, saveDraftOrder,
    }}>
      {children}
    </DraftContext.Provider>
  );
}

export function useDraftContext() {
  return useContext(DraftContext);
}

function snakePicker(order, pickIndex) {
  if (!order || order.length === 0) return null;
  const n     = order.length;
  const round = Math.floor(pickIndex / n);
  const pos   = round % 2 === 0 ? pickIndex % n : (n - 1) - (pickIndex % n);
  return order[pos];
}
