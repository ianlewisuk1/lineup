import React, { useState } from "react";
import { supabase } from "../supabase/supabase";
import { Users, Copy, Check, Trash2, Share2 } from "lucide-react";
import BottomNavBar from "../components/BottomNavBar";
import LeagueNav from "../components/LeagueNav";
import { useLeague } from "../context/LeagueContext";

function LeagueMembers() {
  const { leagueData, members, isAdmin, isDraftComplete } = useLeague();
  const [copied, setCopied] = useState(false);

  const leagueId = leagueData?.id;
  const inviteUrl = `${window.location.origin}/join/${leagueData?.invite_code}`;
  const spotsLeft = (leagueData?.max_managers || 0) - members.length;

  const handleCopy = () => {
    navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Join ${leagueData?.name} on Lineup`,
          text: `Use invite code ${leagueData?.invite_code} to join my Lineup league!`,
          url: inviteUrl,
        });
      } catch {
        // user cancelled — do nothing
      }
    } else {
      handleCopy();
    }
  };

  const handleRemoveMember = async (userId, name) => {
    if (!window.confirm(`Remove ${name} from the league?`)) return;
    await supabase
      .from("league_members")
      .delete()
      .eq("league_id", leagueId)
      .eq("user_id", userId);
    // context real-time subscription will update members automatically
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white">
      <div className="absolute inset-0 opacity-10 pointer-events-none">
        <div className="absolute top-20 left-10 w-72 h-72 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full blur-3xl animate-pulse delay-1000" />
      </div>

      <BottomNavBar />

      <LeagueNav />

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

            {/* Invite code — prominent */}
            <div className="text-center bg-purple-500/20 border border-purple-400/30 rounded-xl px-4 py-4 mb-3">
              <p className="text-white/60 text-xs uppercase tracking-widest mb-1">Invite Code</p>
              <p className="text-white font-black text-3xl tracking-[0.3em]">
                {leagueData?.invite_code || '—'}
              </p>
            </div>

            {/* Full-width URL */}
            <div className="bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white/70 text-sm mb-3 break-all">
              {inviteUrl}
            </div>

            {/* Action buttons */}
            <div className="flex gap-2">
              <button
                onClick={handleCopy}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-white/10 border border-white/20 hover:bg-white/20 rounded-xl font-semibold text-sm transition-all duration-200"
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
                {copied ? "Copied!" : "Copy Link"}
              </button>
              <button
                onClick={handleShare}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 rounded-xl font-semibold text-sm transition-all duration-200"
              >
                <Share2 size={16} />
                Share
              </button>
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
                    {m.avatar_url ? (
                      <img src={m.avatar_url} alt="avatar" className="w-full h-full object-cover" />
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
