import React, { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../supabase/supabase";
import { useLeague } from "../context/LeagueContext";
import {
  Settings,
  Calendar,
  Trophy,
  Shield,
  ChevronUp,
  ChevronDown,
  Shuffle,
  Save,
  Trash2,
  AlertTriangle,
  CheckCircle,
  Lock
} from "lucide-react";
import BottomNavBar from "../components/BottomNavBar";
import LeagueNav from "../components/LeagueNav";
import ScoringSystemModal from '../components/ScoringSystemModal';
import { SEASON_YEAR } from "../utils/season";
import { useModalState } from "../hooks/useModalState";

function LeagueRules() {
  const { leagueId } = useParams();
  const navigate = useNavigate();
  const { leagueData, members: contextMembers, isAdmin } = useLeague();
  const [adminName, setAdminName] = useState("");
  const [formState, setFormState] = useState({});
  const [draftOrder, setDraftOrder] = useState([]);
  const [error, setError] = useState("");
  const [draftStarted, setDraftStarted] = useState(false);
  const [loading, setLoading] = useState(true);

  const members = useMemo(() =>
    contextMembers.map((m) => ({
      uid: m.user_id,
      name: `${m.first_name} ${m.last_name}`.trim() || m.team_name,
      teamName: m.team_name,
    })),
    [contextMembers]
  );

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showScoringModal, setShowScoringModal] = useState(false);

  const {
    showSuccessModal, showErrorModal,
    modalTitle, modalMessage,
    showSuccess, showError, closeModals: closeBaseModals,
  } = useModalState();

  const closeModals = () => {
    closeBaseModals();
    setShowDeleteModal(false);
    setShowScoringModal(false);
  };

  useEffect(() => {
    if (!leagueData) return;
    let formattedDraftDate = "";
    if (leagueData.draft_date) {
      const d = new Date(leagueData.draft_date);
      const pad = (n) => String(n).padStart(2, '0');
      formattedDraftDate = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
    setFormState({
      name: leagueData.name,
      draftType: leagueData.draft_type,
      draftOrderType: leagueData.draft_order_type || "random",
      draftDate: formattedDraftDate,
      timePerPick: leagueData.time_per_pick || 5,
      maxManagers: leagueData.max_managers,
    });
  }, [leagueData]);

  useEffect(() => {
    if (!leagueData?.id) return;
    const fetchPageData = async () => {
      try {
        const [{ data: draftRow }, adminResult] = await Promise.all([
          supabase.from('drafts').select('id, status').eq('league_id', leagueId).single(),
          leagueData.created_by
            ? supabase.from('users').select('first_name, last_name').eq('id', leagueData.created_by).single()
            : Promise.resolve({ data: null }),
        ]);
        setDraftStarted(
          draftRow?.status === 'active' || draftRow?.status === 'complete' || leagueData.draft_complete
        );
        if (adminResult.data) {
          setAdminName(`${adminResult.data.first_name || ""} ${adminResult.data.last_name || ""}`.trim());
        }
        setLoading(false);
      } catch (err) {
        console.error("Error fetching league page data:", err);
        setLoading(false);
      }
    };
    fetchPageData();
  }, [leagueData?.id, leagueData?.created_by, leagueData?.draft_complete, leagueId]);

  useEffect(() => {
    if (leagueData?.draft_order_type === "admin" && members.length > 0 && !draftStarted) {
      if (leagueData.custom_draft_order && leagueData.custom_draft_order.length > 0) {
        const orderedMembers = leagueData.custom_draft_order
          .map(uid => members.find(m => m.uid === uid))
          .filter(Boolean);

        const orderedUids = new Set(orderedMembers.map(m => m.uid));
        const missingMembers = members.filter(m => !orderedUids.has(m.uid));
        const newDraftOrder = [...orderedMembers, ...missingMembers];

        const currentMemberIds = new Set(draftOrder.map(m => m.uid));
        const newMemberIds = new Set(newDraftOrder.map(m => m.uid));
        const memberCountChanged = currentMemberIds.size !== newMemberIds.size;
        const membersChanged = [...currentMemberIds].some(id => !newMemberIds.has(id)) ||
                              [...newMemberIds].some(id => !currentMemberIds.has(id));

        if (memberCountChanged || membersChanged) {
          setDraftOrder(newDraftOrder);
        }
      } else {
        const currentMemberIds = new Set(draftOrder.map(m => m.uid));
        const newMemberIds = new Set(members.map(m => m.uid));
        const memberCountChanged = currentMemberIds.size !== newMemberIds.size;
        const membersChanged = [...currentMemberIds].some(id => !newMemberIds.has(id)) ||
                              [...newMemberIds].some(id => !currentMemberIds.has(id));

        if (memberCountChanged || membersChanged) {
          setDraftOrder([...members]);
        }
      }
    }
  }, [members, leagueData?.draft_order_type, leagueData?.custom_draft_order, draftStarted, draftOrder]);

  const isLeagueFull = members.length === leagueData?.max_managers;

  const handleInputChange = (field, value) => {
    setFormState((prev) => ({ ...prev, [field]: value }));
  };

  const handleDraftOrderChange = (fromIndex, toIndex) => {
    const newOrder = [...draftOrder];
    const [movedItem] = newOrder.splice(fromIndex, 1);
    newOrder.splice(toIndex, 0, movedItem);
    setDraftOrder(newOrder);
  };

  const saveDraftOrder = async () => {
    if (!isLeagueFull) {
      setError("League must be full before setting draft order.");
      return;
    }
    try {
      const orderUids = draftOrder.map(member => member.uid);
      const { error: updateError } = await supabase
        .from('leagues')
        .update({ custom_draft_order: orderUids })
        .eq('id', leagueId);
      if (updateError) throw updateError;
      setError("");
      showSuccess("Draft Order Saved!", "The draft order has been successfully saved.");
    } catch (error) {
      console.error("Error saving draft order:", error);
      setError("Failed to save draft order. Please try again.");
    }
  };

  const randomizeDraftOrder = () => {
    const shuffled = [...draftOrder].sort(() => Math.random() - 0.5);
    setDraftOrder(shuffled);
  };

  const handleDeleteLeague = async () => {
    try {
      await supabase.from('league_members').delete().eq('league_id', leagueId);
      await supabase.from('drafts').delete().eq('league_id', leagueId);
      const { error: deleteError } = await supabase.from('leagues').delete().eq('id', leagueId);
      if (deleteError) throw deleteError;
      showSuccess("League Deleted", "League has been permanently deleted!");
      setTimeout(() => navigate("/home"), 2000);
    } catch (error) {
      console.error("Error deleting league:", error);
      showError("Error", "Failed to delete league. Please try again.");
    }
  };

  const handleConfirmChanges = async () => {
    if (members.length > formState.maxManagers) {
      setError(`Reduce managers to ${formState.maxManagers} or fewer before changing this setting.`);
      return;
    }

    if (formState.draftType === "live" && formState.draftDate) {
      const [datePart, timePart] = formState.draftDate.split('T');
      const [year, month, day] = datePart.split('-').map(Number);
      const [hours, minutes] = timePart.split(':').map(Number);
      const draftDateTime = new Date(year, month - 1, day, hours, minutes, 0);
      const minTime = new Date(new Date().getTime() + 15 * 60 * 1000);
      if (draftDateTime < minTime) {
        setError("Draft must be scheduled at least 15 minutes in the future.");
        return;
      }
    }

    const update = {
      name: formState.name,
      draft_type: formState.draftType,
      draft_order_type: formState.draftOrderType,
      max_managers: formState.maxManagers,
      scoring_type: leagueData.scoring_type
    };

    if (formState.draftType === "live" && formState.draftDate) {
      const [datePart, timePart] = formState.draftDate.split('T');
      const [year, month, day] = datePart.split('-').map(Number);
      const [hours, minutes] = timePart.split(':').map(Number);
      update.draft_date = new Date(year, month - 1, day, hours, minutes, 0).toISOString();
      update.time_per_pick = Number(formState.timePerPick);
    } else {
      update.draft_date = null;
      update.time_per_pick = null;
    }

    try {
      const { error: updateError } = await supabase.from('leagues').update(update).eq('id', leagueId);
      if (updateError) throw updateError;
      setError("");
      showSuccess("Settings Updated!", "League settings have been successfully updated.");
      setTimeout(() => window.location.reload(), 1500);
    } catch (error) {
      console.error("Error updating league:", error);
      setError("Failed to update league settings. Please try again.");
    }
  };

  const getMinDateTime = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today.toISOString().slice(0, 16);
  };

  const getMaxDate = () => {
    return new Date('2025-08-20T23:59').toISOString().slice(0, 16);
  };

  const getDraftOrderTypeDisplay = (type) => {
    switch (type) {
      case "random": return "Random Order (Determined at Draft Start)";
      case "admin":  return "Commissioner Sets Order";
      default:       return type;
    }
  };

  const getDraftDisplayText = (draftType) => {
    switch (draftType) {
      case "manual": return "Manual Draft (Commissioner Enters Teams)";
      case "live":   return "Live Draft";
      default:       return draftType;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 overflow-x-hidden">
        <LeagueNav />
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <div className="text-4xl mb-4 animate-spin">⚙️</div>
            <p className="text-lg text-gray-500">Loading league settings...</p>
          </div>
        </div>
        <BottomNavBar />
      </div>
    );
  }

  if (!leagueData) {
    return (
      <div className="min-h-screen bg-gray-50 overflow-x-hidden">
        <LeagueNav />
        <div className="flex items-center justify-center min-h-[60vh]">
          <p className="text-lg text-red-500">League not found.</p>
        </div>
        <BottomNavBar />
      </div>
    );
  }

  const weeks = [
    "Aug 23 - Sep 1", "Sep 2 - 7", "Sep 8 - 14", "Sep 15 - 21", "Sep 22 - 28",
    "Sep 29 - Oct 5", "Oct 6 - 12", "Oct 13 - 19", "Oct 20 - 26", "Oct 27 - Nov 2",
    "Nov 3 - 9", "Nov 10 - 16", "Nov 17 - 23", "Nov 24 - 30",
  ];

  const getWeekLabel = (i) => {
    const m = formState.maxManagers;
    if (m === 8 && i >= 12) return i === 12 ? "Playoffs • Free Agency Closed" : "Championship • Free Agency Closed";
    if ((m === 10 || m === 12) && i >= 11)
      return i === 11 ? "Playoffs • Free Agency Closed" : i === 12 ? "Semifinals • Free Agency Closed" : "Championship • Free Agency Closed";
    return "Regular Season";
  };

  const getWeekColor = (i) => {
    const m = formState.maxManagers;
    const isPlayoff = (m === 8 && i >= 12) || ((m === 10 || m === 12) && i >= 11);
    if (i < 3) return "from-red-100 to-red-50 border-red-200";
    if (isPlayoff) return "from-blue-100 to-blue-50 border-blue-200";
    return "from-green-100 to-green-50 border-green-200";
  };

  const inputClass = "w-full px-4 py-3 bg-white border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-colors disabled:opacity-50 disabled:bg-gray-50";
  const labelClass = "block text-sm font-medium text-gray-600 mb-2";
  const cardClass = "bg-white rounded-2xl p-6 border border-gray-200 shadow-sm w-full";

  const getWeekPhase = (i) => {
    const m = formState.maxManagers;
    const isPlayoff = (m === 8 && i >= 12) || ((m === 10 || m === 12) && i >= 11);
    if (i < 3) return { label: 'Pre-Season', color: 'bg-orange-100 text-orange-700' };
    if (isPlayoff) {
      if ((m === 8 && i === 13) || ((m === 10 || m === 12) && i === 13)) return { label: 'Championship', color: 'bg-blue-100 text-blue-700' };
      if ((m === 10 || m === 12) && i === 12) return { label: 'Semifinals', color: 'bg-blue-100 text-blue-700' };
      return { label: 'Playoffs', color: 'bg-blue-100 text-blue-700' };
    }
    return { label: 'Regular Season', color: 'bg-green-100 text-green-700' };
  };

  return (
    <div className="min-h-screen bg-gray-50 overflow-x-hidden">
      <LeagueNav />

      <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-8 pb-40">

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3">
            <span className="text-3xl">⚙️</span>
            <div>
              <h1 className="text-2xl font-black text-gray-900 leading-tight">League Settings</h1>
              <p className="text-gray-500 text-sm mt-0.5">{leagueData?.name}</p>
            </div>
          </div>
        </div>

        {/* Draft Status Alert */}
        {draftStarted && (
          <div className={`mb-6 p-4 rounded-2xl border flex items-center gap-3 ${
            leagueData?.draft_complete ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'
          }`}>
            {leagueData?.draft_complete
              ? <CheckCircle size={20} className="text-green-600 flex-shrink-0" />
              : <Lock size={20} className="text-yellow-600 flex-shrink-0" />
            }
            <div>
              <span className={`font-semibold text-sm ${leagueData?.draft_complete ? 'text-green-800' : 'text-yellow-800'}`}>
                {leagueData?.draft_complete ? "Draft Completed — " : "Draft In Progress — "}
              </span>
              <span className={`text-sm ${leagueData?.draft_complete ? 'text-green-600' : 'text-yellow-600'}`}>
                League settings are locked and cannot be changed.
              </span>
            </div>
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div className="mb-6 p-4 rounded-2xl border bg-red-50 border-red-200 flex items-center gap-3">
            <AlertTriangle size={20} className="text-red-500 flex-shrink-0" />
            <div className="text-red-700 text-sm">{error}</div>
          </div>
        )}

        {/* ── Two-column desktop layout ── */}
        <div className="flex flex-col lg:flex-row gap-6 items-start">

          {/* ── LEFT: Config / Info ── */}
          <div className="w-full lg:w-[360px] lg:flex-shrink-0 space-y-5">

            {isAdmin ? (
              <>
                {/* League Configuration */}
                <div className={cardClass}>
                  <div className="flex items-center gap-2.5 mb-5">
                    <Settings size={20} className="text-blue-600 flex-shrink-0" />
                    <h2 className="text-base font-bold text-gray-900">League Configuration</h2>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className={labelClass}>League Name</label>
                      <input
                        value={formState.name || ''}
                        onChange={(e) => handleInputChange("name", e.target.value)}
                        disabled={draftStarted}
                        className={inputClass}
                      />
                    </div>

                    <div>
                      <label className={labelClass}>Draft Type</label>
                      <select
                        value={formState.draftType || ''}
                        onChange={(e) => handleInputChange("draftType", e.target.value)}
                        disabled={draftStarted}
                        className={inputClass}
                      >
                        <option value="manual">Manual Draft</option>
                        <option value="live">Live Draft</option>
                      </select>
                    </div>

                    <div>
                      <label className={labelClass}>Draft Order</label>
                      <select
                        value={formState.draftOrderType || ''}
                        onChange={(e) => handleInputChange("draftOrderType", e.target.value)}
                        disabled={draftStarted}
                        className={inputClass}
                      >
                        <option value="random">Random (at draft start)</option>
                        <option value="admin">Commissioner sets order</option>
                      </select>
                    </div>

                    {formState.draftType === "live" && (
                      <>
                        <div>
                          <label className={labelClass}>Draft Date &amp; Time</label>
                          <input
                            type="datetime-local"
                            value={formState.draftDate || ''}
                            onChange={(e) => handleInputChange("draftDate", e.target.value)}
                            min={getMinDateTime()}
                            max={getMaxDate()}
                            disabled={draftStarted}
                            className={inputClass}
                          />
                          <p className="text-xs text-gray-400 mt-1.5">At least 15 minutes from now.</p>
                        </div>

                        <div>
                          <label className={labelClass}>Time Per Pick</label>
                          <select
                            value={formState.timePerPick || ''}
                            onChange={(e) => handleInputChange("timePerPick", e.target.value)}
                            disabled={draftStarted}
                            className={inputClass}
                          >
                            <option value={1}>1 minute</option>
                            <option value={2}>2 minutes</option>
                            <option value={5}>5 minutes</option>
                            <option value={10}>10 minutes</option>
                          </select>
                        </div>
                      </>
                    )}

                    <div>
                      <label className={labelClass}>Max Managers</label>
                      <select
                        value={formState.maxManagers || ''}
                        onChange={(e) => handleInputChange("maxManagers", parseInt(e.target.value))}
                        disabled={draftStarted}
                        className={inputClass}
                      >
                        {[8, 10, 12].map((num) => (
                          <option key={num} value={num}>{num} managers</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="flex gap-3 mt-6">
                    <button
                      onClick={handleConfirmChanges}
                      disabled={draftStarted}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-semibold rounded-xl transition-colors disabled:cursor-not-allowed text-sm"
                    >
                      <Save size={15} />
                      {draftStarted ? "Locked" : "Save Changes"}
                    </button>
                    <button
                      onClick={() => setShowDeleteModal(true)}
                      className="flex items-center justify-center gap-2 px-4 py-2.5 bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 font-semibold rounded-xl transition-colors text-sm"
                    >
                      <Trash2 size={15} />
                      Delete
                    </button>
                  </div>
                </div>

                {/* Draft Order Management */}
                {formState.draftOrderType === "admin" && !draftStarted && (
                  <div className={cardClass}>
                    <div className="flex items-center gap-2.5 mb-5">
                      <Trophy size={20} className="text-yellow-500 flex-shrink-0" />
                      <h2 className="text-base font-bold text-gray-900">Draft Order</h2>
                    </div>

                    {!isLeagueFull ? (
                      <div className="p-4 rounded-xl border bg-yellow-50 border-yellow-200 flex items-start gap-3">
                        <AlertTriangle size={18} className="text-yellow-600 flex-shrink-0 mt-0.5" />
                        <div>
                          <div className="text-sm font-semibold text-yellow-800">League must be full first</div>
                          <div className="text-yellow-600 text-xs mt-0.5">{members.length}/{leagueData.max_managers} managers joined</div>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex gap-2 mb-4">
                          <button
                            onClick={randomizeDraftOrder}
                            className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors"
                          >
                            <Shuffle size={14} />
                            Randomize
                          </button>
                          <button
                            onClick={saveDraftOrder}
                            className="flex items-center gap-1.5 px-3 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors"
                          >
                            <Save size={14} />
                            Save Order
                          </button>
                        </div>

                        <div className="space-y-2">
                          {draftOrder.map((member, index) => (
                            <div key={member.uid} className="flex items-center gap-3 p-3 bg-gray-50 border border-gray-100 rounded-xl">
                              <div className="w-7 h-7 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
                                {index + 1}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-gray-900 font-semibold text-sm truncate">{member.name || member.username}</div>
                                <div className="text-gray-500 text-xs truncate">{member.teamName}</div>
                              </div>
                              <div className="flex flex-col gap-0.5 flex-shrink-0">
                                <button
                                  onClick={() => handleDraftOrderChange(index, Math.max(0, index - 1))}
                                  disabled={index === 0}
                                  className="p-1 bg-white border border-gray-200 rounded text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                >
                                  <ChevronUp size={13} />
                                </button>
                                <button
                                  onClick={() => handleDraftOrderChange(index, Math.min(draftOrder.length - 1, index + 1))}
                                  disabled={index === draftOrder.length - 1}
                                  className="p-1 bg-white border border-gray-200 rounded text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                >
                                  <ChevronDown size={13} />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                        <p className="text-xs text-gray-400 mt-3 text-center">Snake draft — round 2 reverses</p>
                      </>
                    )}
                  </div>
                )}
              </>
            ) : (
              /* Non-Admin: League Info */
              <div className={cardClass}>
                <div className="flex items-center gap-2.5 mb-5">
                  <Shield size={20} className="text-blue-600 flex-shrink-0" />
                  <h2 className="text-base font-bold text-gray-900">League Information</h2>
                </div>

                <div className="space-y-0">
                  {[
                    { label: 'League Name', value: leagueData.name },
                    { label: 'Commissioner', value: adminName || 'Unknown' },
                    { label: 'Draft Type', value: getDraftDisplayText(leagueData.draft_type) },
                    { label: 'Draft Order', value: getDraftOrderTypeDisplay(leagueData.draft_order_type) },
                    ...(leagueData.draft_type === "live" && leagueData.draft_date ? [
                      { label: 'Draft Date', value: new Date(leagueData.draft_date).toLocaleString("en-US", {
                        timeZone: "America/New_York", weekday: "short", month: "short",
                        day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short"
                      })},
                      { label: 'Time Per Pick', value: `${leagueData.time_per_pick} min` },
                    ] : []),
                  ].map(({ label, value }, i, arr) => (
                    <div key={label} className={`flex justify-between items-start py-3 gap-4 ${i < arr.length - 1 ? 'border-b border-gray-100' : ''}`}>
                      <span className="text-gray-500 text-sm flex-shrink-0">{label}</span>
                      <span className="text-gray-900 text-sm font-medium text-right">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── RIGHT: Timeline + FAQ ── */}
          <div className="flex-1 min-w-0 space-y-5">

            {/* Season Timeline */}
            <div className={cardClass}>
              <div className="flex items-center gap-2.5 mb-5">
                <Calendar size={20} className="text-blue-600 flex-shrink-0" />
                <h2 className="text-base font-bold text-gray-900">{SEASON_YEAR} Season Timeline</h2>
              </div>

              {/* Legend */}
              <div className="flex flex-wrap gap-3 mb-4">
                <span className="flex items-center gap-1.5 text-xs text-gray-500">
                  <span className="w-2.5 h-2.5 rounded-full bg-orange-400 inline-block" />Pre-Season (no captain bonus)
                </span>
                <span className="flex items-center gap-1.5 text-xs text-gray-500">
                  <span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" />Regular Season
                </span>
                <span className="flex items-center gap-1.5 text-xs text-gray-500">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" />Playoffs / Championship
                </span>
              </div>

              {/* Week rows */}
              <div className="divide-y divide-gray-100 -mx-6">
                {weeks.map((date, i) => {
                  const phase = getWeekPhase(i);
                  const isFreeAgencyClose = i === 9;
                  const isNoFreeAgency = getWeekLabel(i).includes('Free Agency Closed');
                  return (
                    <div key={i} className="flex items-center gap-4 px-6 py-3 hover:bg-gray-50 transition-colors">
                      <div className="w-12 flex-shrink-0">
                        <span className="text-sm font-bold text-gray-900">Wk {i + 1}</span>
                      </div>
                      <div className="w-28 flex-shrink-0 hidden sm:block">
                        <span className="text-xs text-gray-500">{date}</span>
                      </div>
                      <div className="flex-1 min-w-0 flex flex-wrap items-center gap-2">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${phase.color}`}>
                          {phase.label}
                        </span>
                        {isFreeAgencyClose && (
                          <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
                            Last FA week
                          </span>
                        )}
                        {isNoFreeAgency && (
                          <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                            FA closed
                          </span>
                        )}
                      </div>
                      <div className="flex-shrink-0 text-xs text-gray-400">
                        {i === 0 ? 'No captain' : 'Captain ✓'}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* FAQ */}
            <div className={cardClass}>
              <div className="flex items-center gap-2.5 mb-5">
                <span className="text-lg">❓</span>
                <h2 className="text-base font-bold text-gray-900">Frequently Asked Questions</h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">

                <div>
                  <h3 className="text-sm font-semibold text-gray-900 mb-1.5">Do I have to set a lineup every week?</h3>
                  <p className="text-gray-500 text-sm leading-relaxed">
                    No — it's optional. If you skip a week, you simply score zero points for that week.
                  </p>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-gray-900 mb-1.5">How does team scoring work?</h3>
                  <p className="text-gray-500 text-sm leading-relaxed mb-2">
                    Teams earn points based on real-world performance — wins, losses, and spread covers. Points can go negative.
                  </p>
                  <button
                    onClick={() => setShowScoringModal(true)}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors"
                  >
                    View full scoring breakdown →
                  </button>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-gray-900 mb-1.5">What is the captain system?</h3>
                  <p className="text-gray-500 text-sm leading-relaxed">
                    From Week 2 onwards, you can mark one starter as captain for 2x points (positive or negative). It's optional but high-upside.
                  </p>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-gray-900 mb-1.5">What is the 3x Play Chip?</h3>
                  <p className="text-gray-500 text-sm leading-relaxed">
                    One per season. Use it from Week 4 to the week before playoffs to triple a starter's points. Stack with captain for a 5x total.
                  </p>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-gray-900 mb-1.5">What is the Freeze Play?</h3>
                  <p className="text-gray-500 text-sm leading-relaxed">
                    You get 3 per season. Lock in a team's live score in the second half — their final fantasy total won't change after that. Cannot be undone.
                  </p>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-gray-900 mb-1.5">Can I combine bonuses?</h3>
                  <p className="text-gray-500 text-sm leading-relaxed">
                    Yes. You can freeze a captain or a 3x Play team to lock in the multiplied score. You can't apply the same bonus type twice on one team.
                  </p>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-gray-900 mb-1.5">How do playoffs work?</h3>
                  <p className="text-gray-500 text-sm leading-relaxed">
                    Head-to-head matchups replace cumulative scoring. Whoever scores more that week advances. Format depends on league size.
                  </p>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-gray-900 mb-1.5">When does free agency close?</h3>
                  <p className="text-gray-500 text-sm leading-relaxed">
                    Free agency closes at the start of playoff weeks. Week 10 is the last week you can add or drop teams.
                  </p>
                </div>

              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Scoring System Modal */}
      {showScoringModal && (
        <ScoringSystemModal onClose={() => setShowScoringModal(false)} />
      )}

      {/* Delete League Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-8 max-w-md w-full border border-gray-200 shadow-xl">
            <div className="text-center">
              <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-5">
                <AlertTriangle size={28} className="text-red-600" />
              </div>

              <h3 className="text-xl font-bold text-gray-900 mb-3">
                Delete League "{leagueData.name}"?
              </h3>

              <div className="text-gray-600 text-left mb-6 text-sm">
                <p className="mb-3">This will permanently:</p>
                <ul className="list-disc list-inside space-y-1.5 mb-4">
                  <li>Delete the league and all its data</li>
                  <li>Remove it from all members' league lists</li>
                  <li>Delete all draft data and settings</li>
                </ul>
                <p className="text-red-600 font-semibold text-center">
                  THIS CANNOT BE UNDONE!
                </p>
              </div>

              <div className="flex space-x-3">
                <button
                  onClick={closeModals}
                  className="flex-1 px-6 py-3 bg-white border border-gray-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteLeague}
                  className="flex-1 px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl transition-colors"
                >
                  Delete League
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Success Modal */}
      {showSuccessModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-8 max-w-md w-full border border-gray-200 shadow-xl">
            <div className="text-center">
              <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
                <CheckCircle size={28} className="text-green-600" />
              </div>

              <h3 className="text-xl font-bold text-gray-900 mb-2">
                {modalTitle}
              </h3>

              <p className="text-gray-500 text-sm mb-6">
                {modalMessage}
              </p>

              <button
                onClick={closeModals}
                className="w-full px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-xl transition-colors"
              >
                Great!
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error Modal */}
      {showErrorModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-8 max-w-md w-full border border-gray-200 shadow-xl">
            <div className="text-center">
              <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-5">
                <AlertTriangle size={28} className="text-red-600" />
              </div>

              <h3 className="text-xl font-bold text-gray-900 mb-2">
                {modalTitle}
              </h3>

              <p className="text-gray-500 text-sm mb-6">
                {modalMessage}
              </p>

              <button
                onClick={closeModals}
                className="w-full px-6 py-3 bg-gray-100 border border-gray-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-200 transition-colors"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}

      <BottomNavBar />
    </div>
  );
}

export default LeagueRules;
