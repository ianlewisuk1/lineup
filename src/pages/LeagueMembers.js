import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "../supabase/supabase";
import { Users, Copy, Check, Trash2 } from "lucide-react";
import BottomNavBar from "../components/BottomNavBar";

function LeagueMembers() {
  const { leagueId } = useParams();
  const [leagueData, setLeagueData] = useState(null);
  const [members, setMembers] = useState([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [isDraftComplete, setIsDraftComplete] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: league } = await supabase
        .from("leagues")
        .select("*")
        .eq("id", leagueId)
        .single();

      if (!league) return;
      setLeagueData(league);
      setIsAdmin(user.id === league.admin_id);
      setIsDraftComplete(league.draft_complete || false);

      const { data: memberRows } = await supabase
        .from("league_members")
        .select("user_id, team_name, points, joined_at, team_avatar, custom_avatar")
        .eq("league_id", leagueId);

      if (!memberRows) return;

      const userIds = memberRows.map((m) => m.user_id);
      const { data: usersData } = await supabase
        .from("users")
        .select("id, first_name, last_name")
        .in("id", userIds);
      const userMap = Object.fromEntries((usersData || []).map((u) => [u.id, u]));

      const enriched = memberRows.map((m) => ({
        ...m,
        first_name: userMap[m.user_id]?.first_name || "",
        last_name: userMap[m.user_id]?.last_name || "",
      }));

      // Sort by join date
      enriched.sort((a, b) => new Date(a.joined_at) - new Date(b.joined_at));

      setMembers(enriched);
      setLoading(false);
    };

    load();

    const channel = supabase
      .channel(`members-${leagueId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "league_members", filter: `league_id=eq.${leagueId}` }, load)
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [leagueId]);

  const inviteUrl = `${window.location.origin}/join/${leagueData?.invite_code}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const spotsLeft = (leagueData?.max_managers || 0) - members.length;

  const handleRemoveMember = async (userId, name) => {
    if (!window.confirm(`Remove ${name} from the league?`)) return;
    const { error } = await supabase
      .from("league_members")
      .delete()
      .eq("league_id", leagueId)
      .eq("user_id", userId);
    if (!error) {
      setMembers((prev) => prev.filter((m) => m.user_id !== userId));
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white">
      <div className="absolute inset-0 opacity-10 pointer-events-none">
        <div className="absolute top-20 left-10 w-72 h-72 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full blur-3xl animate-pulse delay-1000" />
      </div>

      <BottomNavBar leagueId={leagueId} isDraftComplete={isDraftComplete} />

      {/* Nav */}
      <nav className="relative z-10 flex justify-between items-center p-4 sm:p-6 lg:p-8">
        <Link to="/home" className="flex items-center space-x-3">
          <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-r from-purple-500 to-blue-500 rounded-lg flex items-center justify-center font-bold text-lg sm:text-xl">L</div>
          <span className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">Lineup</span>
        </Link>
      </nav>

      <div className="relative z-10 max-w-2xl mx-auto px-4 sm:px-6 py-4 pb-24">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="text-4xl sm:text-5xl mb-2">👥</div>
          <h1 className="text-3xl sm:text-4xl font-black mb-2">
            <span className="bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
              {leagueData?.name}
            </span>
          </h1>
          <p className="text-white/70">
            {members.length} / {leagueData?.max_managers} managers
            {spotsLeft > 0 && ` · ${spotsLeft} spot${spotsLeft !== 1 ? "s" : ""} remaining`}
          </p>
        </div>

        {/* Invite Card — admin only, pre-draft only */}
        {isAdmin && !isDraftComplete && (
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20 mb-6">
            <h2 className="text-lg font-bold text-white mb-1">Invite Players</h2>
            <p className="text-white/60 text-sm mb-4">Share this link or code with your managers</p>

            {/* Invite link */}
            <div className="flex items-center gap-2 mb-3">
              <div className="flex-1 bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white/80 text-sm truncate">
                {inviteUrl}
              </div>
              <button
                onClick={handleCopy}
                className="flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 rounded-xl font-semibold text-sm transition-all duration-200 whitespace-nowrap"
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
                {copied ? "Copied!" : "Copy Link"}
              </button>
            </div>

            {/* Invite code */}
            <div className="flex items-center gap-3 bg-purple-500/20 border border-purple-400/30 rounded-xl px-4 py-3">
              <span className="text-white/60 text-sm">Invite code:</span>
              <span className="text-white font-black text-xl tracking-widest">{leagueData?.invite_code}</span>
            </div>
          </div>
        )}

        {/* Members list */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20">
          <div className="flex items-center gap-2 mb-5">
            <Users size={18} className="text-purple-400" />
            <h2 className="text-lg font-bold text-white">Managers</h2>
          </div>

          {members.length === 0 ? (
            <p className="text-white/50 text-center py-4">No managers have joined yet.</p>
          ) : (
            <div className="space-y-3">
              {members.map((m, i) => (
                <div key={m.user_id} className="flex items-center gap-4 bg-white/5 rounded-xl p-4 border border-white/10">
                  {/* Avatar */}
                  <div className="w-12 h-12 rounded-full flex-shrink-0 overflow-hidden">
                    {m.team_avatar ? (
                      <img src={m.team_avatar} alt="avatar" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-r from-purple-500 to-blue-500 flex items-center justify-center font-bold text-white text-sm">
                        {m.first_name?.[0]?.toUpperCase() || (i + 1)}
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-white truncate">
                      {m.first_name} {m.last_name}
                    </div>
                    <div className="text-sm text-white/60 truncate">{m.team_name}</div>
                  </div>

                  {isDraftComplete && (
                    <div className="text-right flex-shrink-0">
                      <div className="text-white font-bold">{m.points ?? 0}</div>
                      <div className="text-xs text-white/50">pts</div>
                    </div>
                  )}

                  {isAdmin && !isDraftComplete && (
                    <button
                      onClick={() => handleRemoveMember(m.user_id, `${m.first_name} ${m.last_name}`.trim())}
                      className="ml-2 p-2 bg-red-500/20 border border-red-400/30 text-red-300 rounded-lg hover:bg-red-500/30 transition-all duration-200 flex-shrink-0"
                      title="Remove manager"
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Empty spots */}
          {!isDraftComplete && spotsLeft > 0 && (
            <div className="mt-3 space-y-2">
              {Array.from({ length: spotsLeft }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 bg-white/5 rounded-xl p-4 border border-dashed border-white/20">
                  <div className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center text-white/30 text-sm flex-shrink-0">
                    {members.length + i + 1}
                  </div>
                  <div className="text-white/30 text-sm">Waiting for manager...</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default LeagueMembers;
