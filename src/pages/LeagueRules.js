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
  const cardClass = "bg-white rounded-2xl p-6 sm:p-8 border border-gray-200 shadow-sm w-full";

  return (
    <div className="min-h-screen bg-gray-50 overflow-x-hidden">
      <LeagueNav />

      <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12 pb-40">

        {/* Header */}
        <div className="text-center mb-8 sm:mb-12">
          <span className="inline-block text-4xl sm:text-5xl mb-3">⚙️</span>
          <h1 className="text-3xl sm:text-4xl font-black text-gray-900 mb-2">League Settings</h1>
          <p className="text-lg text-gray-500">{leagueData?.name}</p>
        </div>

        {/* Draft Status Alert */}
        {draftStarted && (
          <div className={`mb-8 p-5 rounded-2xl border w-full flex items-center space-x-4 ${
            leagueData?.draft_complete
              ? 'bg-green-50 border-green-200'
              : 'bg-yellow-50 border-yellow-200'
          }`}>
            {leagueData?.draft_complete ? (
              <CheckCircle size={28} className="text-green-600 flex-shrink-0" />
            ) : (
              <Lock size={28} className="text-yellow-600 flex-shrink-0" />
            )}
            <div className="min-w-0 flex-1">
              <div className={`text-base font-bold mb-1 ${
                leagueData?.draft_complete ? 'text-green-800' : 'text-yellow-800'
              }`}>
                {leagueData?.draft_complete ? "Draft Completed" : "Draft In Progress"}
              </div>
              <div className={`text-sm ${
                leagueData?.draft_complete ? 'text-green-600' : 'text-yellow-600'
              }`}>
                League settings are now locked and cannot be changed.
              </div>
            </div>
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div className="mb-8 p-5 rounded-2xl border bg-red-50 border-red-200 w-full flex items-center space-x-4">
            <AlertTriangle size={28} className="text-red-500 flex-shrink-0" />
            <div className="text-red-700 break-words min-w-0 flex-1 text-sm">{error}</div>
          </div>
        )}

        <div className="w-full space-y-8 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-8">
          {isAdmin ? (
            <>
              {/* League Settings */}
              <div className={cardClass}>
                <div className="flex items-center space-x-3 mb-6">
                  <Settings size={28} className="text-blue-600 flex-shrink-0" />
                  <h2 className="text-xl font-bold text-gray-900">League Configuration</h2>
                </div>

                <div className="space-y-5 w-full">
                  <div className="w-full">
                    <label className={labelClass}>League Name</label>
                    <input
                      value={formState.name || ''}
                      onChange={(e) => handleInputChange("name", e.target.value)}
                      disabled={draftStarted}
                      className={inputClass}
                    />
                  </div>

                  <div className="w-full">
                    <label className={labelClass}>Draft Type</label>
                    <select
                      value={formState.draftType || ''}
                      onChange={(e) => handleInputChange("draftType", e.target.value)}
                      disabled={draftStarted}
                      className={inputClass}
                    >
                      <option value="manual">Manual Draft (Commissioner Enters Teams)</option>
                      <option value="live">Live Draft</option>
                    </select>
                  </div>

                  <div className="w-full">
                    <label className={labelClass}>Draft Order</label>
                    <select
                      value={formState.draftOrderType || ''}
                      onChange={(e) => handleInputChange("draftOrderType", e.target.value)}
                      disabled={draftStarted}
                      className={inputClass}
                    >
                      <option value="random">Random Order (Determined at Draft Start)</option>
                      <option value="admin">Commissioner Sets Order</option>
                    </select>
                  </div>

                  {formState.draftType === "live" && (
                    <>
                      <div className="w-full">
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
                        <p className="text-xs text-gray-400 mt-1.5">
                          Draft must be scheduled at least 15 minutes from now.
                        </p>
                      </div>

                      <div className="w-full">
                        <label className={labelClass}>Time Per Pick (minutes)</label>
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

                  <div className="w-full">
                    <label className={labelClass}>Max Managers</label>
                    <select
                      value={formState.maxManagers || ''}
                      onChange={(e) => handleInputChange("maxManagers", parseInt(e.target.value))}
                      disabled={draftStarted}
                      className={inputClass}
                    >
                      {[8, 10, 12].map((num) => (
                        <option key={num} value={num}>{num}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 mt-8 w-full">
                  <button
                    onClick={handleConfirmChanges}
                    disabled={draftStarted}
                    className="flex items-center justify-center space-x-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-semibold rounded-xl transition-colors disabled:cursor-not-allowed"
                  >
                    <Save size={16} />
                    <span>{draftStarted ? "Settings Locked" : "Save Changes"}</span>
                  </button>

                  <button
                    onClick={() => setShowDeleteModal(true)}
                    className="flex items-center justify-center space-x-2 px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl transition-colors"
                  >
                    <Trash2 size={16} />
                    <span>Delete League</span>
                  </button>
                </div>
              </div>

              {/* Draft Order Management */}
              {formState.draftOrderType === "admin" && !draftStarted && (
                <div className={cardClass}>
                  <div className="flex items-center space-x-3 mb-6">
                    <Trophy size={28} className="text-yellow-500 flex-shrink-0" />
                    <h2 className="text-xl font-bold text-gray-900">Draft Order Management</h2>
                  </div>

                  {!isLeagueFull ? (
                    <div className="p-5 rounded-2xl border bg-yellow-50 border-yellow-200 mb-6 w-full flex items-center space-x-4">
                      <AlertTriangle size={24} className="text-yellow-600 flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="text-base font-bold text-yellow-800 mb-1">
                          League must be full before setting draft order
                        </div>
                        <div className="text-yellow-600 text-sm">
                          Current: {members.length}/{leagueData.max_managers} managers
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="text-gray-500 text-sm mb-5">
                        Drag and drop to reorder managers. Position 1 gets the first pick.
                      </p>

                      <div className="flex flex-col sm:flex-row gap-3 mb-5 w-full">
                        <button
                          onClick={randomizeDraftOrder}
                          className="flex items-center justify-center space-x-2 px-4 py-2 bg-white border border-gray-300 rounded-xl text-gray-700 font-medium hover:bg-gray-50 transition-colors"
                        >
                          <Shuffle size={16} />
                          <span>Randomize Order</span>
                        </button>

                        <button
                          onClick={saveDraftOrder}
                          className="flex items-center justify-center space-x-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-xl transition-colors"
                        >
                          <Save size={16} />
                          <span>Save Draft Order</span>
                        </button>
                      </div>

                      <div className="space-y-3 w-full">
                        {draftOrder.map((member, index) => (
                          <div key={member.uid} className="flex items-center p-4 bg-gray-50 border border-gray-200 rounded-xl w-full">
                            <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold text-base mr-4 flex-shrink-0">
                              {index + 1}
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="text-gray-900 font-semibold truncate">
                                {member.name || member.username}
                              </div>
                              <div className="text-gray-500 text-sm truncate">
                                {member.teamName}
                              </div>
                            </div>

                            <div className="flex flex-col space-y-1.5 flex-shrink-0">
                              <button
                                onClick={() => handleDraftOrderChange(index, Math.max(0, index - 1))}
                                disabled={index === 0}
                                className="p-2 bg-white border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                <ChevronUp size={16} />
                              </button>
                              <button
                                onClick={() => handleDraftOrderChange(index, Math.min(draftOrder.length - 1, index + 1))}
                                disabled={index === draftOrder.length - 1}
                                className="p-2 bg-white border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                <ChevronDown size={16} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </>
          ) : (
            /* Non-Admin View */
            <div className={cardClass}>
              <div className="flex items-center space-x-3 mb-6">
                <Shield size={28} className="text-blue-600 flex-shrink-0" />
                <h2 className="text-xl font-bold text-gray-900">League Information</h2>
              </div>

              <div className="space-y-1 w-full">
                <div className="flex justify-between items-center py-3 border-b border-gray-100">
                  <span className="text-gray-500 font-medium text-sm">League Name</span>
                  <span className="text-gray-900 break-words text-right text-sm">{leagueData.name}</span>
                </div>

                <div className="flex justify-between items-center py-3 border-b border-gray-100">
                  <span className="text-gray-500 font-medium text-sm">Commissioner</span>
                  <span className="text-gray-900 break-words text-right text-sm">{adminName || "Unknown"}</span>
                </div>

                <div className="flex justify-between items-center py-3 border-b border-gray-100">
                  <span className="text-gray-500 font-medium text-sm">Draft Type</span>
                  <span className="text-gray-900 break-words text-right text-sm">{getDraftDisplayText(leagueData.draft_type)}</span>
                </div>

                <div className="flex justify-between items-center py-3 border-b border-gray-100">
                  <span className="text-gray-500 font-medium text-sm">Draft Order</span>
                  <span className="text-gray-900 break-words text-right text-sm">{getDraftOrderTypeDisplay(leagueData.draft_order_type)}</span>
                </div>

                {leagueData.draft_type === "live" && leagueData.draft_date && (
                  <>
                    <div className="flex justify-between items-center py-3 border-b border-gray-100">
                      <span className="text-gray-500 font-medium text-sm">Draft Date</span>
                      <span className="text-gray-900 text-sm break-words text-right">
                        {new Date(leagueData.draft_date).toLocaleString("en-US", {
                          timeZone: "America/New_York",
                          weekday: "long",
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                          timeZoneName: "short"
                        })}
                      </span>
                    </div>

                    <div className="flex justify-between items-center py-3">
                      <span className="text-gray-500 font-medium text-sm">Time Per Pick</span>
                      <span className="text-gray-900 text-sm">{leagueData.time_per_pick} minutes</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Season Timeline */}
        <div className="mt-8 bg-white rounded-2xl p-6 sm:p-8 border border-gray-200 shadow-sm w-full">
          <div className="flex items-center space-x-3 mb-6">
            <Calendar size={28} className="text-blue-600 flex-shrink-0" />
            <h2 className="text-xl font-bold text-gray-900">{`${SEASON_YEAR} Season Timeline`}</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3 w-full">
            {weeks.map((date, i) => (
              <div key={i} className={`p-4 rounded-xl border bg-gradient-to-br ${getWeekColor(i)} text-center`}>
                <div className="text-gray-900 font-bold text-sm mb-1">
                  Week {i + 1}
                </div>
                <div className="text-gray-500 text-xs mb-1.5">
                  {date}
                </div>
                <div className="text-gray-700 text-xs font-semibold mb-1.5">
                  {getWeekLabel(i)}
                </div>
                {i === 9 && (
                  <div className="text-gray-500 text-xs italic mb-1.5">
                    Last week of free agency
                  </div>
                )}
                <div className="text-gray-600 text-xs">
                  Captain Bonus: {i === 0 ? "No" : "Yes"}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap gap-4 text-sm text-gray-500">
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 bg-gradient-to-br from-green-100 to-green-50 border border-green-200 rounded"></div>
              <span>Game bonuses active</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 bg-gradient-to-br from-red-100 to-red-50 border border-red-200 rounded"></div>
              <span>Game bonuses not active</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 bg-gradient-to-br from-blue-100 to-blue-50 border border-blue-200 rounded"></div>
              <span>Playoffs/Championship (Free agency closed)</span>
            </div>
          </div>
        </div>

        {/* FAQ Section */}
        <div className="mt-8 bg-white rounded-2xl p-6 sm:p-8 border border-gray-200 shadow-sm w-full">
          <div className="flex items-center space-x-3 mb-6">
            <div className="text-2xl">❓</div>
            <h2 className="text-xl font-bold text-gray-900">Frequently Asked Questions</h2>
          </div>

          <div className="space-y-5 w-full">
            <div className="border-b border-gray-100 pb-5">
              <h3 className="text-base font-semibold text-gray-900 mb-1.5">Am I required to set a lineup each week?</h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                No, setting a lineup is optional. If you don't set a lineup for a particular week, you simply won't score any points for that week.
              </p>
            </div>

            <div className="border-b border-gray-100 pb-5">
              <h3 className="text-base font-semibold text-gray-900 mb-1.5">How does team scoring work?</h3>
              <p className="text-gray-600 text-sm leading-relaxed mb-3">
                Teams in your starting lineup accumulate points based on their real-world performance each week. Points can be positive or negative depending on how the team performs. For detailed scoring information:
              </p>
              <button
                onClick={() => setShowScoringModal(true)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors text-sm"
              >
                View Detailed Scoring System
              </button>
            </div>

            <div className="border-b border-gray-100 pb-5">
              <h3 className="text-base font-semibold text-gray-900 mb-1.5">What is the captain system?</h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                Starting in Week 2, you can designate one team in your lineup as captain. The captain receives double points (positive or negative) for their performance that week. Captain selection is available from Week 2 through the championship game.
              </p>
            </div>

            <div className="border-b border-gray-100 pb-5">
              <h3 className="text-base font-semibold text-gray-900 mb-1.5">Do I have to select a captain?</h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                No, captain selection is optional. However, using the captain feature strategically can significantly boost your weekly score.
              </p>
            </div>

            <div className="border-b border-gray-100 pb-5">
              <h3 className="text-base font-semibold text-gray-900 mb-1.5">What are game bonuses and how do they work?</h3>
              <p className="text-gray-600 text-sm leading-relaxed mb-3">
                There are two types of game bonuses available:
              </p>
              <div className="ml-4 space-y-3">
                <div>
                  <p className="text-gray-800 font-medium text-sm mb-1">3x Play Chip (1 per season)</p>
                  <p className="text-gray-600 text-xs leading-relaxed">
                    Can be used from Week 4 until the week before playoffs begin. Multiplies a team's points by 3x. When combined with a captain, creates a 5x multiplier (2x captain + 3x chip).
                  </p>
                </div>
                <div>
                  <p className="text-gray-800 font-medium text-sm mb-1">Freeze Play (3 per season)</p>
                  <p className="text-gray-600 text-xs leading-relaxed">
                    Locks in a team's current point total during the second half of their game. Once used, the freeze cannot be undone, and the team's score won't change regardless of subsequent performance.
                  </p>
                </div>
              </div>
            </div>

            <div className="border-b border-gray-100 pb-5">
              <h3 className="text-base font-semibold text-gray-900 mb-1.5">Can I combine different bonuses?</h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                Yes! You can combine freeze plays with both captain bonuses and 3x play chips. However, you cannot use multiple bonuses of the same type on one team in a single week.
              </p>
            </div>

            <div className="border-b border-gray-100 pb-5">
              <h3 className="text-base font-semibold text-gray-900 mb-1.5">How do playoffs work?</h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                Unlike the regular season, playoffs are conducted head-to-head. You'll be matched against another manager, and whoever scores more points that week advances. The playoff format depends on your league size.
              </p>
            </div>

            <div>
              <h3 className="text-base font-semibold text-gray-900 mb-1.5">When does free agency close?</h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                Free agency closes at the start of playoff weeks. Once playoffs begin, you cannot add or drop teams from your roster. Plan your roster moves accordingly during the regular season.
              </p>
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
