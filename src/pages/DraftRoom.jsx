import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { Clock, Users, Trophy, ChevronRight, Check } from 'lucide-react';
import { useDraft } from '../hooks/useDraft';
import { useLeague } from '../context/LeagueContext';
import { supabase } from '../supabase/supabase';
import BottomNavBar from '../components/BottomNavBar';
import LeagueNav from '../components/LeagueNav';

// ─────────────────────────────────────────────────────────────────────────────
// Presence — tracks who is currently in the draft room
// ─────────────────────────────────────────────────────────────────────────────
function usePresence(leagueId, currentUserId) {
  const [onlineIds, setOnlineIds] = useState(new Set());

  useEffect(() => {
    if (!leagueId || !currentUserId) return;

    const channel = supabase.channel(`presence:draft:${leagueId}`, {
      config: { presence: { key: currentUserId } },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        setOnlineIds(new Set(Object.keys(state)));
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ user_id: currentUserId, online_at: new Date().toISOString() });
        }
      });

    return () => { supabase.removeChannel(channel); };
  }, [leagueId, currentUserId]);

  return onlineIds;
}

// ─────────────────────────────────────────────────────────────────────────────
// Countdown — derived entirely from pick_deadline, no syncing needed
// ─────────────────────────────────────────────────────────────────────────────
function useCountdown(deadline) {
  const [secondsLeft, setSecondsLeft] = useState(null);

  useEffect(() => {
    if (!deadline) { setSecondsLeft(null); return; }
    const tick = () => {
      const diff = Math.max(0, Math.floor((deadline - Date.now()) / 1000));
      setSecondsLeft(diff);
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [deadline]);

  return secondsLeft;
}

// ─────────────────────────────────────────────────────────────────────────────
// DraftRoom
// ─────────────────────────────────────────────────────────────────────────────
export default function DraftRoom() {
  const { leagueId } = useParams();
  const { leagueData, isAdmin } = useLeague();
  const {
    draft, picks, members, teams, availableTeams, pickedTeamIds,
    currentPickerUid, isMyTurn, pickDeadline,
    totalPicks, nManagers, rosterByUser, memberMap,
    currentUserId, loading, error,
    makePick, startDraft,
  } = useDraft(leagueId);

  const [search, setSearch]         = useState('');
  const [actionError, setActionError] = useState('');
  const [picking, setPicking]       = useState(false);
  const [starting, setStarting]     = useState(false);
  const [lastPickId, setLastPickId] = useState(null);
  const pickBoardRef = useRef(null);

  const onlineIds = usePresence(leagueId, currentUserId);

  const secondsLeft = useCountdown(pickDeadline);

  const currentPickIndex = draft?.current_pick_index ?? 0;

  const filteredTeams = availableTeams.filter((t) =>
    t.school.toLowerCase().includes(search.toLowerCase()) ||
    (t.conference ?? '').toLowerCase().includes(search.toLowerCase())
  );

  // Flash last pick
  useEffect(() => {
    if (picks.length === 0) return;
    setLastPickId(picks[picks.length - 1].id);
    const id = setTimeout(() => setLastPickId(null), 2000);
    return () => clearTimeout(id);
  }, [picks.length]);

  const handlePick = async (teamId) => {
    if (!isMyTurn || picking) return;
    setPicking(true);
    setActionError('');
    const result = await makePick(teamId);
    setPicking(false);
    if (result?.error) setActionError(result.error);
  };

  const handleStartDraft = async () => {
    setStarting(true);
    setActionError('');
    const result = await startDraft();
    setStarting(false);
    if (result?.error) setActionError(result.error);
  };

  // ── Loading / error ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-white text-lg">Loading draft…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-red-400 text-lg">{error}</div>
      </div>
    );
  }

  const status = draft?.status ?? 'pending';

  // ─────────────────────────────────────────────────────────────────────────
  // PRE-DRAFT lobby
  // ─────────────────────────────────────────────────────────────────────────
  if (status === 'pending') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white pb-24">
        <LeagueNav />

        <div className="max-w-2xl mx-auto px-4 py-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-black mb-2">Draft Room</h1>
            <p className="text-white/60">Waiting for all managers to join</p>
          </div>

          {/* Member count */}
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20 mb-6">
            <div className="flex items-center gap-2 mb-4">
              <Users size={18} className="text-purple-400" />
              <h2 className="text-lg font-bold">
                Managers ({members.length}/{leagueData?.max_managers})
              </h2>
            </div>
            <div className="space-y-3">
              {members.map((m, i) => {
                const info     = memberMap[m.user_id];
                const isOnline = onlineIds.has(m.user_id);
                return (
                  <div key={m.user_id} className="flex items-center gap-3 bg-white/5 rounded-xl p-3 border border-white/10">
                    <div className="w-8 h-8 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0">
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold flex items-center gap-2">
                        {info?.name ?? '—'}
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isOnline ? 'bg-green-400' : 'bg-white/20'}`} title={isOnline ? 'In draft room' : 'Not in draft room'} />
                      </div>
                      <div className="text-sm text-white/60">{info?.teamName}</div>
                    </div>
                    {m.user_id === currentUserId && (
                      <span className="text-xs text-purple-300 font-semibold">You</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {actionError && (
            <div className="bg-red-500/20 border border-red-400/30 rounded-xl px-4 py-3 text-red-300 text-sm mb-4">
              {actionError}
            </div>
          )}

          {isAdmin && members.length === leagueData?.max_managers && (
            <button
              onClick={handleStartDraft}
              disabled={starting}
              className="w-full py-4 bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 rounded-xl font-bold text-lg transition-all duration-300 disabled:opacity-50"
            >
              {starting ? 'Starting…' : 'Start Draft'}
            </button>
          )}

          {isAdmin && members.length < (leagueData?.max_managers ?? 0) && (
            <p className="text-center text-white/50 text-sm">
              Waiting for {(leagueData?.max_managers ?? 0) - members.length} more manager{(leagueData?.max_managers ?? 0) - members.length !== 1 ? 's' : ''} to join
            </p>
          )}
        </div>
        <BottomNavBar />
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ACTIVE DRAFT
  // ─────────────────────────────────────────────────────────────────────────
  if (status === 'active') {
    const currentPicker = memberMap[currentPickerUid];
    const round         = Math.floor(currentPickIndex / (nManagers || 1)) + 1;
    const pickInRound   = (currentPickIndex % (nManagers || 1)) + 1;

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white pb-24">
        <LeagueNav />

        <div className="max-w-4xl mx-auto px-4 py-4">

          {/* Status bar */}
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-4 border border-white/20 mb-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-white/60 text-sm">Round {round} · Pick {pickInRound}/{nManagers}</p>
                <p className="text-white font-bold text-lg">
                  {isMyTurn ? '🟢 Your pick!' : `${currentPicker?.name ?? '—'} is picking…`}
                </p>
              </div>

              {/* Countdown */}
              {secondsLeft !== null && (
                <div className={`flex items-center gap-2 px-4 py-2 rounded-xl font-mono font-bold text-xl ${
                  secondsLeft <= 10 ? 'bg-red-500/30 text-red-300 border border-red-400/40' : 'bg-white/10 text-white'
                }`}>
                  <Clock size={18} />
                  {String(Math.floor(secondsLeft / 60)).padStart(2, '0')}:{String(secondsLeft % 60).padStart(2, '0')}
                </div>
              )}
            </div>

            {/* Draft order strip */}
            <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
              {draft.draft_order.map((uid) => {
                const info     = memberMap[uid];
                const active   = uid === currentPickerUid;
                const isOnline = onlineIds.has(uid);
                return (
                  <div
                    key={uid}
                    className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                      active
                        ? 'bg-purple-500 text-white'
                        : uid === currentUserId
                        ? 'bg-white/20 text-white'
                        : 'bg-white/5 text-white/50'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isOnline ? 'bg-green-400' : 'bg-white/20'}`} />
                    {info?.firstName || info?.teamName || '?'}
                  </div>
                );
              })}
            </div>
          </div>

          {actionError && (
            <div className="bg-red-500/20 border border-red-400/30 rounded-xl px-4 py-3 text-red-300 text-sm mb-4">
              {actionError}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

            {/* ── Pick board ── */}
            <div className="lg:col-span-2">
              <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-4 border border-white/20">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-bold text-lg">Available Teams</h2>
                  <span className="text-white/50 text-sm">{availableTeams.length} remaining</span>
                </div>

                <input
                  type="text"
                  placeholder="Search teams…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full px-4 py-2 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/40 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 mb-3"
                />

                <div ref={pickBoardRef} className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
                  {filteredTeams.map((team) => (
                    <button
                      key={team.id}
                      onClick={() => handlePick(team.id)}
                      disabled={!isMyTurn || picking}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all duration-150 ${
                        isMyTurn && !picking
                          ? 'bg-white/5 border-white/10 hover:bg-purple-500/20 hover:border-purple-400/40 cursor-pointer'
                          : 'bg-white/5 border-white/5 cursor-default opacity-70'
                      }`}
                    >
                      {team.logos?.[0] && (
                        <img src={team.logos[0]} alt={team.school} className="w-8 h-8 object-contain flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm truncate">{team.school}</div>
                        <div className="text-xs text-white/50">{team.conference}</div>
                      </div>
                      {team.game_points != null && (
                        <div className="text-xs text-white/40 flex-shrink-0">{team.game_points} pts</div>
                      )}
                      {isMyTurn && !picking && (
                        <ChevronRight size={14} className="text-purple-400 flex-shrink-0" />
                      )}
                    </button>
                  ))}
                  {filteredTeams.length === 0 && (
                    <p className="text-center text-white/40 py-6">No teams match your search</p>
                  )}
                </div>
              </div>
            </div>

            {/* ── Pick log + rosters ── */}
            <div className="space-y-4">

              {/* Recent picks */}
              <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-4 border border-white/20">
                <h2 className="font-bold mb-3 flex items-center gap-2">
                  <Trophy size={16} className="text-yellow-400" />
                  Recent Picks
                </h2>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {[...picks].reverse().slice(0, 20).map((pick) => {
                    const team   = teams.find((t) => t.id === pick.team_id);
                    const picker = memberMap[pick.user_id];
                    const flash  = pick.id === lastPickId;
                    return (
                      <div
                        key={pick.id}
                        className={`flex items-center gap-2 p-2 rounded-lg text-sm transition-all duration-500 ${
                          flash ? 'bg-purple-500/30 border border-purple-400/40' : 'bg-white/5'
                        }`}
                      >
                        {flash && <Check size={12} className="text-green-400 flex-shrink-0" />}
                        <span className="text-white/50 text-xs w-5 flex-shrink-0">#{pick.pick_number}</span>
                        {team?.logos?.[0] && (
                          <img src={team.logos[0]} alt="" className="w-5 h-5 object-contain flex-shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="truncate font-medium">{team?.school ?? pick.team_id}</div>
                          <div className="text-white/40 text-xs truncate">{picker?.name}</div>
                        </div>
                        {pick.auto_picked && (
                          <span className="text-xs text-orange-400 flex-shrink-0">auto</span>
                        )}
                      </div>
                    );
                  })}
                  {picks.length === 0 && (
                    <p className="text-white/40 text-sm text-center py-2">No picks yet</p>
                  )}
                </div>
              </div>

              {/* Your roster so far */}
              <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-4 border border-white/20">
                <h2 className="font-bold mb-3">Your Roster</h2>
                {(rosterByUser[currentUserId] ?? []).length === 0 ? (
                  <p className="text-white/40 text-sm">No picks yet</p>
                ) : (
                  <div className="space-y-1">
                    {(rosterByUser[currentUserId] ?? []).map((teamId) => {
                      const team = teams.find((t) => t.id === teamId);
                      return (
                        <div key={teamId} className="flex items-center gap-2 text-sm">
                          {team?.logos?.[0] && (
                            <img src={team.logos[0]} alt="" className="w-5 h-5 object-contain" />
                          )}
                          <span>{team?.school ?? teamId}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        <BottomNavBar />
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // DRAFT COMPLETE
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white pb-24">
      <LeagueNav />

      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <div className="text-5xl mb-4">🏆</div>
          <h1 className="text-3xl font-black mb-2">Draft Complete!</h1>
          <p className="text-white/60">All {totalPicks} picks have been made</p>
        </div>

        {/* Final rosters */}
        <div className="space-y-4">
          {members.map((m) => {
            const info  = memberMap[m.user_id];
            const roster = rosterByUser[m.user_id] ?? [];
            return (
              <div key={m.user_id} className="bg-white/10 backdrop-blur-lg rounded-2xl p-5 border border-white/20">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="font-bold">{info?.name}</div>
                    <div className="text-white/60 text-sm">{info?.teamName}</div>
                  </div>
                  {m.user_id === currentUserId && (
                    <span className="text-xs text-purple-300 font-semibold">You</span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {roster.map((teamId) => {
                    const team = teams.find((t) => t.id === teamId);
                    return (
                      <div key={teamId} className="flex items-center gap-2 text-sm bg-white/5 rounded-lg p-2">
                        {team?.logos?.[0] && (
                          <img src={team.logos[0]} alt="" className="w-5 h-5 object-contain" />
                        )}
                        <span className="truncate">{team?.school ?? teamId}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <BottomNavBar />
    </div>
  );
}
