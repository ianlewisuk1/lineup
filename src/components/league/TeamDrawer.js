import React, { useEffect, useState } from "react";
import { X, Plus, Users, Trophy, TrendingUp, Calendar, ChevronDown } from "lucide-react";
import { supabase } from "../../supabase/supabase";
import { useAuth } from "../../context/AuthContext";
import { useLeague } from "../../context/LeagueContext";
import { useDraftContext } from "../../context/DraftContext";
import { useModalState } from "../../hooks/useModalState";
import { parseGamesPlayed, parseRecord, calculateAverage } from "../../utils/teamStats";
import { SEASON_YEAR } from "../../utils/season";
import TeamLogoImage from "./TeamLogoImage";
import { normalizeTeamName } from "../../utils/teamName";

const denormalizeTeamName = (slug) => {
  if (!slug) return slug;
  return slug.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ").replace(/\bAnd\b/g, "&");
};

function getOpponentDifficulty(opponentName, allTeams) {
  if (!opponentName) return "unknown";
  const key = normalizeTeamName(opponentName);
  const opp = allTeams[key];
  if (!opp) return "unknown";
  const [wins, losses] = parseRecord(opp.currentSeason?.record);
  const total = wins + losses;
  if (total === 0) return "unknown";
  const pct = wins / total;
  if (pct > 0.65) return "tough";
  if (pct >= 0.40) return "medium";
  return "soft";
}

const DIFFICULTY_STYLES = {
  tough:   "bg-red-50 border border-red-200 text-red-700",
  medium:  "bg-yellow-50 border border-yellow-200 text-yellow-700",
  soft:    "bg-green-50 border border-green-200 text-green-700",
  unknown: "bg-gray-50 border border-gray-200 text-gray-500",
};

function ScheduleStrip({ schedule, teamName, currentWeek, allTeams }) {
  const weeks = [];
  const maxWeek = 15;
  for (let w = currentWeek; w <= Math.min(currentWeek + 4, maxWeek); w++) {
    weeks.push(w);
  }

  return (
    <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
      {weeks.map(week => {
        const game = schedule.find(g => parseInt(g.week) === week);
        if (!game) {
          return (
            <div key={week} className="flex-shrink-0 w-[72px] bg-gray-100 border border-gray-200 rounded-xl p-2 text-center">
              <div className="text-xs font-semibold text-gray-400 mb-1">Wk {week}</div>
              <div className="text-xs text-gray-400">BYE</div>
            </div>
          );
        }
        const isHome = game.home_team === teamName;
        const opponent = isHome ? game.away_team : game.home_team;
        const prefix = isHome ? "vs" : "@";
        const difficulty = getOpponentDifficulty(opponent, allTeams);
        const abbrev = opponent?.length > 11 ? opponent.split(" ").pop() : opponent;
        const isComplete = game.game_complete;
        const teamScore = isHome ? game.home_score : game.away_score;
        const oppScore = isHome ? game.away_score : game.home_score;
        const won = isComplete && teamScore > oppScore;

        return (
          <div
            key={week}
            className={`flex-shrink-0 w-[72px] rounded-xl p-2 text-center ${
              isComplete
                ? won
                  ? "bg-green-50 border border-green-200 text-green-700"
                  : "bg-red-50 border border-red-200 text-red-700"
                : DIFFICULTY_STYLES[difficulty]
            }`}
          >
            <div className="text-xs font-semibold mb-0.5">Wk {week}</div>
            <div className="text-[10px] font-medium mb-0.5">{prefix}</div>
            <div className="text-xs font-bold leading-tight">{abbrev}</div>
            {isComplete && (
              <div className="text-[10px] mt-0.5 font-semibold">
                {won ? "W" : "L"} {teamScore}-{oppScore}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

const _scheduleCache = new Map();

async function fetchSchedule(schoolName) {
  if (_scheduleCache.has(schoolName)) return _scheduleCache.get(schoolName);
  const { data, error } = await supabase
    .from("games")
    .select("*")
    .or(`home_team.eq.${schoolName},away_team.eq.${schoolName}`);
  if (error) { console.error("Schedule fetch error:", error); return []; }
  const sorted = (data || []).sort((a, b) => (parseInt(a.week) || 0) - (parseInt(b.week) || 0));
  _scheduleCache.set(schoolName, sorted);
  return sorted;
}

export default function TeamDrawer({ teamName, onClose }) {
  const { teams: allTeams, currentUser, seasonConfig } = useAuth();
  const { leagueId, isDraftComplete, currentWeek } = useLeague();
  const { pickedTeamIds } = useDraftContext();

  const [schedule, setSchedule] = useState([]);
  const [ownershipInfo, setOwnershipInfo] = useState(null);
  const [userTeams, setUserTeams] = useState([]);
  const [loading, setLoading] = useState(false);

  const [showAddModal, setShowAddModal] = useState(false);
  const [teamToAdd, setTeamToAdd] = useState(null);
  const [showSwapUI, setShowSwapUI] = useState(false);
  const [pendingAddTeam, setPendingAddTeam] = useState("");
  const [selectedDropTeam, setSelectedDropTeam] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);

  const { showSuccessModal, showErrorModal, modalTitle, modalMessage, showSuccess, showError, closeModals } = useModalState();

  const team = teamName ? allTeams[normalizeTeamName(teamName)] : null;

  // Lock body scroll when open
  useEffect(() => {
    if (teamName) {
      document.body.style.overflow = "hidden";
    }
    return () => { document.body.style.overflow = ""; };
  }, [teamName]);

  // Click-outside handler for swap dropdown
  useEffect(() => {
    const handle = (e) => {
      if (showDropdown && !e.target.closest("[data-dropdown]")) setShowDropdown(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [showDropdown]);

  // Fetch incremental data when drawer opens
  useEffect(() => {
    if (!teamName || !leagueId) {
      setSchedule([]); setOwnershipInfo(null); setUserTeams([]);
      return;
    }

    let cancelled = false;

    const run = async () => {
      setLoading(true);
      setSchedule([]); setOwnershipInfo(null); setUserTeams([]);

      const weekNum = seasonConfig?.currentWeek || currentWeek || 1;

      const [scheduleData, ownership, roster] = await Promise.all([
        fetchSchedule(teamName),
        fetchOwnership(teamName, weekNum),
        fetchUserRoster(weekNum),
      ]);

      if (!cancelled) {
        setSchedule(scheduleData);
        setOwnershipInfo(ownership);
        setUserTeams(roster);
        setLoading(false);
      }
    };

    run();
    return () => { cancelled = true; };
  }, [teamName, leagueId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchOwnership(schoolName, weekNum) {
    const normalized = normalizeTeamName(schoolName);

    const { data: memberRows } = await supabase
      .from("league_members").select("id, user_id, team_name").eq("league_id", leagueId);
    if (!memberRows?.length) return null;

    const memberIds = memberRows.map(m => m.id);
    const { data: lineupRows } = await supabase
      .from("weekly_lineups").select("member_id, starters, bench")
      .eq("league_id", leagueId).eq("week", weekNum).in("member_id", memberIds);

    const lineupByMember = {};
    (lineupRows || []).forEach(r => { lineupByMember[r.member_id] = r; });

    for (const member of memberRows) {
      const lineup = lineupByMember[member.id] || {};
      const starters = lineup.starters || [];
      const bench = lineup.bench || [];
      let status = starters.includes(normalized) ? "starting" : bench.includes(normalized) ? "bench" : null;
      if (!status) continue;

      let ownerName = member.team_name || "Unknown Owner";
      try {
        const { data: userData } = await supabase.from("users").select("first_name, last_name")
          .eq("id", member.user_id).single();
        if (userData?.first_name) ownerName = `${userData.first_name} ${userData.last_name || ""}`.trim();
      } catch {}
      return { status, ownerName, teamName: member.team_name || "Unnamed Team" };
    }
    return null;
  }

  async function fetchUserRoster(weekNum) {
    if (!currentUser) return [];
    const { data: memberRow } = await supabase.from("league_members").select("id")
      .eq("league_id", leagueId).eq("user_id", currentUser.id).single();
    if (!memberRow) return [];
    const { data: lineup } = await supabase.from("weekly_lineups").select("starters, bench")
      .eq("league_id", leagueId).eq("member_id", memberRow.id).eq("week", weekNum).single();
    if (!lineup) return [];
    return [...(lineup.starters || []), ...(lineup.bench || [])];
  }

  // ── Add / Swap ────────────────────────────────────────────────────────────────

  function handleAddTeam() {
    if (!currentUser || !teamName) return;
    if (userTeams.length < 7) {
      setTeamToAdd(teamName);
      setShowAddModal(true);
    } else {
      setPendingAddTeam(teamName);
      setSelectedDropTeam("");
      setShowSwapUI(true);
    }
  }

  async function confirmAddTeam() {
    if (!teamToAdd || !currentUser) return;
    try {
      const weekNum = seasonConfig?.currentWeek || currentWeek || 1;
      const { data: memberRow } = await supabase.from("league_members").select("id, team_name")
        .eq("league_id", leagueId).eq("user_id", currentUser.id).single();
      if (!memberRow) return;

      const { data: lineupRow } = await supabase.from("weekly_lineups").select("starters, bench")
        .eq("league_id", leagueId).eq("member_id", memberRow.id).eq("week", weekNum).single();

      const starters = [...(lineupRow?.starters || Array(5).fill(null))];
      const bench = [...(lineupRow?.bench || Array(2).fill(null))];
      const slug = normalizeTeamName(teamToAdd);

      const emptyStarter = starters.findIndex(t => !t);
      const emptyBench = bench.findIndex(t => !t);
      if (emptyStarter !== -1) starters[emptyStarter] = slug;
      else if (emptyBench !== -1) bench[emptyBench] = slug;
      else { showError("Roster Full", "Your roster is full! Please drop a team first."); return; }

      const { error } = await supabase.from("weekly_lineups").upsert(
        { league_id: leagueId, member_id: memberRow.id, week: weekNum, starters, bench },
        { onConflict: "league_id,member_id,week" }
      );
      if (error) throw error;

      setUserTeams([...starters, ...bench].filter(Boolean));
      setShowAddModal(false); setTeamToAdd(null);
      showSuccess("Team Added!", `${teamToAdd} has been added to your lineup!`);

      const { data: userData } = await supabase.from("users").select("first_name, last_name")
        .eq("id", currentUser.id).single();
      const ownerName = userData?.first_name ? `${userData.first_name} ${userData.last_name || ""}`.trim() : "You";
      setOwnershipInfo({ status: emptyStarter !== -1 ? "starting" : "bench", ownerName, teamName: memberRow.team_name || "Your Team" });
    } catch (err) {
      console.error(err);
      showError("Error", "Failed to add team. Please try again.");
    }
  }

  async function confirmSwap() {
    if (!selectedDropTeam || !pendingAddTeam || !currentUser) return;
    try {
      const weekNum = seasonConfig?.currentWeek || currentWeek || 1;
      const { data: memberRow } = await supabase.from("league_members").select("id, team_name")
        .eq("league_id", leagueId).eq("user_id", currentUser.id).single();
      if (!memberRow) return;

      const { data: lineupRow } = await supabase.from("weekly_lineups").select("starters, bench")
        .eq("league_id", leagueId).eq("member_id", memberRow.id).eq("week", weekNum).single();

      const starters = [...(lineupRow?.starters || Array(5).fill(null))];
      const bench = [...(lineupRow?.bench || Array(2).fill(null))];
      const slug = normalizeTeamName(pendingAddTeam);

      const si = starters.findIndex(t => t === selectedDropTeam);
      const bi = bench.findIndex(t => t === selectedDropTeam);
      if (si !== -1) starters[si] = slug;
      else if (bi !== -1) bench[bi] = slug;

      const { error } = await supabase.from("weekly_lineups").upsert(
        { league_id: leagueId, member_id: memberRow.id, week: weekNum, starters, bench },
        { onConflict: "league_id,member_id,week" }
      );
      if (error) throw error;

      setUserTeams([...starters, ...bench].filter(Boolean));
      setShowSwapUI(false); setPendingAddTeam(""); setSelectedDropTeam("");
      showSuccess("Team Swapped!", `${selectedDropTeam} → ${pendingAddTeam}`);

      const { data: userData } = await supabase.from("users").select("first_name, last_name")
        .eq("id", currentUser.id).single();
      const ownerName = userData?.first_name ? `${userData.first_name} ${userData.last_name || ""}`.trim() : "You";
      setOwnershipInfo({ status: si !== -1 ? "starting" : "bench", ownerName, teamName: memberRow.team_name || "Your Team" });
    } catch (err) {
      console.error(err);
      showError("Error", "Failed to swap teams. Please try again.");
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────

  function renderOwnershipBanner() {
    if (!isDraftComplete) {
      const isDrafted = pickedTeamIds?.has(team?.id);
      if (isDrafted) return (
        <div className="bg-gray-100 border border-gray-300 rounded-xl px-4 py-2.5 flex items-center gap-2">
          <Trophy size={16} className="text-gray-500" />
          <span className="text-sm font-semibold text-gray-600">Already Drafted</span>
        </div>
      );
      return (
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 flex items-center gap-2">
          <Users size={16} className="text-blue-600" />
          <span className="text-sm font-semibold text-blue-700">Available for Draft</span>
        </div>
      );
    }

    if (!ownershipInfo) return (
      <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users size={16} className="text-green-600" />
          <span className="text-sm font-semibold text-green-700">Free Agent</span>
        </div>
        {currentUser && (
          <button onClick={handleAddTeam}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded-lg text-white text-xs font-medium transition-colors">
            <Plus size={12} /> Add Team
          </button>
        )}
      </div>
    );

    const { status, ownerName, teamName: ownerTeam } = ownershipInfo;
    const isStarting = status === "starting";
    return (
      <div className={`border rounded-xl px-4 py-2.5 ${isStarting ? "bg-blue-50 border-blue-200" : "bg-yellow-50 border-yellow-200"}`}>
        <div className="flex items-center gap-2 mb-0.5">
          <Trophy size={16} className={isStarting ? "text-blue-600" : "text-yellow-600"} />
          <span className={`text-sm font-semibold ${isStarting ? "text-blue-700" : "text-yellow-700"}`}>
            {isStarting ? "Starting Lineup" : "Riding the Bench"}
          </span>
        </div>
        <p className="text-xs text-gray-500 ml-6">
          {ownerName}{ownerTeam ? ` · ${ownerTeam}` : ""}
        </p>
      </div>
    );
  }

  function formatDate(dateStr) {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  }

  function formatGameResult(game) {
    const isHome = game.home_team === teamName;
    const ts = isHome ? game.home_score : game.away_score;
    const os = isHome ? game.away_score : game.home_score;
    if (!(game.game_complete || game.gameComplete) || ts == null || os == null) return null;
    return { result: ts > os ? "W" : "L", score: `${ts}-${os}`, won: ts > os };
  }

  function formatOpponent(game) {
    const isHome = game.home_team === teamName;
    const opp = isHome ? game.away_team : game.home_team;
    return { prefix: isHome ? "vs" : "@", opponent: opp };
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  if (!teamName) return null;

  const cs = team?.currentSeason || {};
  const gamesPlayed = parseGamesPlayed(cs.record);
  const avgPts = calculateAverage(cs.gamePoints || 0, gamesPlayed);

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />

      {/* Sheet */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl max-h-[88vh] flex flex-col">
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-0 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </div>

        {/* Close button */}
        <button onClick={onClose}
          className="absolute top-3 right-4 p-1.5 hover:bg-gray-100 rounded-full transition-colors">
          <X size={20} className="text-gray-400" />
        </button>

        {/* Scrollable content */}
        <div className="overflow-y-auto flex-1 px-5 pt-3 pb-10">

          {/* Header */}
          <div className="flex items-center gap-4 mb-4">
            <TeamLogoImage
              teamId={team?.id}
              teamName={teamName}
              primaryColor={team?.colors?.primary || team?.color}
              size={52}
            />
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-black text-gray-900 leading-tight">{teamName}</h2>
              <p className="text-sm text-gray-500">
                {team?.conference || "Independent"}
                {cs.record ? ` · ${cs.record}` : ""}
              </p>
            </div>
          </div>

          {/* Ownership / draft status */}
          {loading ? (
            <div className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-2.5 mb-4">
              <div className="h-4 w-32 bg-gray-200 rounded animate-pulse" />
            </div>
          ) : (
            <div className="mb-4">{renderOwnershipBanner()}</div>
          )}

          {/* Stats chips */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 mb-4">
            <div className="flex items-center gap-1.5 mb-3">
              <TrendingUp size={15} className="text-blue-600" />
              <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">{SEASON_YEAR} Stats</span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: "Fantasy Pts", value: cs.gamePoints ?? "—", color: "text-green-600" },
                { label: "Avg Weekly", value: avgPts, color: "text-blue-600" },
                { label: "ATS Record", value: cs.atsRecord || "—", color: "text-gray-900" },
                { label: "SOS Rank", value: cs.sosRank ?? "—", color: "text-gray-900" },
                { label: "Conf Record", value: cs.confRecord || "—", color: "text-gray-900" },
                { label: "Games Played", value: gamesPlayed || "—", color: "text-gray-900" },
              ].map(({ label, value, color }) => (
                <div key={label} className="bg-gray-50 rounded-xl p-2 text-center border border-gray-100">
                  <div className="text-[9px] font-semibold text-gray-400 uppercase tracking-wide leading-tight mb-1">{label}</div>
                  <div className={`text-sm font-bold ${color}`}>{value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Schedule strip — upcoming weeks */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 mb-4">
            <div className="flex items-center gap-1.5 mb-3">
              <Calendar size={15} className="text-blue-600" />
              <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">Upcoming Schedule</span>
            </div>
            {loading ? (
              <div className="flex gap-2">
                {[1,2,3,4,5].map(i => (
                  <div key={i} className="flex-shrink-0 w-[72px] h-16 bg-gray-100 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : (
              <ScheduleStrip
                schedule={schedule}
                teamName={teamName}
                currentWeek={currentWeek || 1}
                allTeams={allTeams}
              />
            )}
          </div>

          {/* Full season schedule */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <div className="flex items-center gap-1.5">
                <Calendar size={15} className="text-blue-600" />
                <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">
                  Full Schedule {loading ? "" : `(${schedule.length} games)`}
                </span>
              </div>
            </div>
            {loading ? (
              <div className="p-4 space-y-2">
                {[1,2,3].map(i => <div key={i} className="h-8 bg-gray-100 rounded animate-pulse" />)}
              </div>
            ) : schedule.length === 0 ? (
              <div className="p-6 text-center text-gray-400 text-sm">No schedule available</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ backgroundColor: "#0072BC" }}>
                      {["Wk","Date","Opponent","Result","Pts"].map(h => (
                        <th key={h} style={{ color:"white", fontWeight:700, fontSize:10, textTransform:"uppercase", letterSpacing:"0.5px", padding:"9px 10px", textAlign:"center" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {schedule.map((game, i) => {
                      const result = formatGameResult(game);
                      const { prefix, opponent } = formatOpponent(game);
                      const dateStr = game.date || game.game_time;
                      const weeklyPts = (game.game_complete || game.gameComplete) && team?.currentSeason?.weekly_points
                        ? team.currentSeason.weekly_points[`week${game.week}`]
                        : null;
                      return (
                        <tr key={i} style={{ backgroundColor: i % 2 === 0 ? "#FFFFFF" : "#F9FAFB" }}
                          className="border-b border-gray-100">
                          <td className="px-2 py-2.5 text-center font-semibold text-gray-900">{game.week}</td>
                          <td className="px-2 py-2.5 text-center text-gray-500 text-xs whitespace-nowrap">
                            {dateStr ? formatDate(dateStr) : "—"}
                          </td>
                          <td className="px-2 py-2.5 text-center">
                            <span className="text-xs text-gray-400 mr-1">{prefix}</span>
                            <span className="font-medium text-gray-900">{opponent}</span>
                          </td>
                          <td className="px-2 py-2.5 text-center">
                            {result ? (
                              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${
                                result.won ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
                              }`}>
                                {result.result} {result.score}
                              </span>
                            ) : (
                              <span className="text-gray-300 text-xs">TBD</span>
                            )}
                          </td>
                          <td className="px-2 py-2.5 text-center">
                            {weeklyPts != null
                              ? <span className="text-green-600 font-semibold text-xs">{weeklyPts}</span>
                              : <span className="text-gray-300 text-xs">—</span>
                            }
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Add Modal (z-60) ────────────────────────────────────────────────────── */}
      {showAddModal && teamToAdd && (
        <div className="fixed inset-0 bg-black/40 z-60 flex items-end justify-center p-0 sm:items-center sm:p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl p-8 w-full sm:max-w-md border border-gray-200 shadow-xl text-center">
            <div className="w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Plus size={24} className="text-blue-600" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Add {teamToAdd}?</h3>
            <p className="text-gray-500 mb-6">This will add them to your lineup.</p>
            <div className="flex gap-3">
              <button onClick={() => { setShowAddModal(false); setTeamToAdd(null); }}
                className="flex-1 px-4 py-3 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl text-gray-700 font-medium transition-colors">
                Cancel
              </button>
              <button onClick={confirmAddTeam}
                className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 rounded-xl text-white font-bold transition-colors">
                Add Team
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Swap Modal (z-60) ───────────────────────────────────────────────────── */}
      {showSwapUI && (
        <div className="fixed inset-0 bg-black/40 z-60 flex items-end justify-center p-0 sm:items-center sm:p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl p-8 w-full sm:max-w-md border border-gray-200 shadow-xl text-center">
            <div className="w-14 h-14 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trophy size={24} className="text-orange-600" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Add {pendingAddTeam}</h3>
            <p className="text-gray-500 mb-5">Your roster is full. Select a team to drop:</p>
            <div data-dropdown className="relative mb-6 text-left">
              <button onClick={() => setShowDropdown(!showDropdown)}
                className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm flex items-center justify-between focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-colors">
                <span className={selectedDropTeam ? "text-gray-900" : "text-gray-400"}>
                  {selectedDropTeam ? denormalizeTeamName(selectedDropTeam) : "Choose a team to drop"}
                </span>
                <ChevronDown size={16} className={`text-gray-400 transition-transform ${showDropdown ? "rotate-180" : ""}`} />
              </button>
              {showDropdown && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-10 max-h-52 overflow-y-auto">
                  {userTeams.filter(Boolean).map((t, idx, arr) => (
                    <button key={t} onClick={() => { setSelectedDropTeam(t); setShowDropdown(false); }}
                      className={`w-full px-4 py-3 text-left text-sm transition-colors ${
                        selectedDropTeam === t ? "bg-blue-50 text-blue-700 font-semibold" : "text-gray-700 hover:bg-gray-50"
                      } ${idx === 0 ? "rounded-t-xl" : ""} ${idx === arr.length - 1 ? "rounded-b-xl" : "border-b border-gray-100"}`}>
                      {denormalizeTeamName(t)}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowSwapUI(false)}
                className="flex-1 px-4 py-3 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl text-gray-700 font-medium transition-colors">
                Cancel
              </button>
              <button onClick={confirmSwap} disabled={!selectedDropTeam}
                className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-white font-bold transition-colors">
                Confirm Swap
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Success Modal (z-60) ────────────────────────────────────────────────── */}
      {showSuccessModal && (
        <div className="fixed inset-0 bg-black/40 z-60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-8 max-w-md w-full border border-gray-200 shadow-xl text-center">
            <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-green-600 text-2xl font-bold">✓</span>
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">{modalTitle}</h3>
            <p className="text-gray-500 mb-6">{modalMessage}</p>
            <button onClick={closeModals}
              className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 rounded-xl text-white font-bold transition-colors">
              Awesome!
            </button>
          </div>
        </div>
      )}

      {/* ── Error Modal (z-60) ──────────────────────────────────────────────────── */}
      {showErrorModal && (
        <div className="fixed inset-0 bg-black/40 z-60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-8 max-w-md w-full border border-gray-200 shadow-xl text-center">
            <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-red-600 text-2xl font-bold">!</span>
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">{modalTitle}</h3>
            <p className="text-gray-500 mb-6">{modalMessage}</p>
            <button onClick={closeModals}
              className="w-full px-4 py-3 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl text-gray-700 font-medium transition-colors">
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}
