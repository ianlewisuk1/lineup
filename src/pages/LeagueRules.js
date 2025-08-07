import React, { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { db, auth } from "../firebase/firebase";
import {
  doc,
  getDoc,
  collection,
  getDocs,
  updateDoc,
  deleteDoc,
  arrayRemove
} from "firebase/firestore";
import { 
  Settings, 
  Users, 
  Calendar, 
  Trophy, 
  Shield, 
  Clock, 
  ChevronUp, 
  ChevronDown, 
  Shuffle, 
  Save, 
  Trash2,
  AlertTriangle,
  CheckCircle,
  Lock,
  ArrowLeft
} from "lucide-react";
import BottomNavBar from "../components/BottomNavBar";

function LeagueRules() {
  const { leagueId } = useParams();
  const navigate = useNavigate();
  const [leagueData, setLeagueData] = useState(null);
  const [adminName, setAdminName] = useState("");
  const [members, setMembers] = useState([]);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [formState, setFormState] = useState({});
  const [draftOrder, setDraftOrder] = useState([]);
  const [error, setError] = useState("");
  const [draftStarted, setDraftStarted] = useState(false);
  const [loading, setLoading] = useState(true);

  // Custom modal states
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [modalMessage, setModalMessage] = useState("");
  const [modalTitle, setModalTitle] = useState("");

  // Helper functions for modals
  const showSuccess = (title, message) => {
    setModalTitle(title);
    setModalMessage(message);
    setShowSuccessModal(true);
  };

  const showError = (title, message) => {
    setModalTitle(title);
    setModalMessage(message);
    setShowErrorModal(true);
  };

  const closeModals = () => {
    setShowSuccessModal(false);
    setShowErrorModal(false);
    setShowDeleteModal(false);
    setModalTitle("");
    setModalMessage("");
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        const user = auth.currentUser;
        if (user) setCurrentUserId(user.uid);

        const leagueRef = doc(db, "leagues", leagueId);
        const leagueSnap = await getDoc(leagueRef);
        const data = leagueSnap.data();
        setLeagueData(data);
        
        // Handle draftDate properly for datetime-local input
        let formattedDraftDate = "";
        if (data.draftDate) {
          const draftDateTime = data.draftDate.toDate();
          const year = draftDateTime.getFullYear();
          const month = String(draftDateTime.getMonth() + 1).padStart(2, '0');
          const day = String(draftDateTime.getDate()).padStart(2, '0');
          const hours = String(draftDateTime.getHours()).padStart(2, '0');
          const minutes = String(draftDateTime.getMinutes()).padStart(2, '0');
          formattedDraftDate = `${year}-${month}-${day}T${hours}:${minutes}`;
        }

        setFormState({
          name: data.name,
          draftType: data.draftType,
          draftOrderType: data.draftOrderType || "random",
          draftDate: formattedDraftDate,
          timePerPick: data.timePerPick || 5,
          maxManagers: data.maxManagers
        });

        // Check if draft has started
        const draftRef = doc(db, "leagues", leagueId, "meta", "draft");
        const draftSnap = await getDoc(draftRef);
        setDraftStarted(draftSnap.exists() || data.draftComplete);

        if (data?.createdBy) {
          const userSnap = await getDoc(doc(db, "users", data.createdBy));
          const userData = userSnap.data();
          setAdminName(`${userData.firstName || ""} ${userData.lastName || ""}`.trim());
        }

        const membersRef = collection(db, "leagues", leagueId, "members");
        const memberDocs = await getDocs(membersRef);

        const memberList = await Promise.all(
          memberDocs.docs.map(async (memberDoc) => {
            const userId = memberDoc.id;
            const memberData = memberDoc.data();
            const userSnap = await getDoc(doc(db, "users", userId));
            const userData = userSnap.exists() ? userSnap.data() : {};

            return {
              uid: userId,
              name: `${userData.firstName || ""} ${userData.lastName || ""}`.trim(),
              username: userData.username || userData.email || "Unknown",
              teamName: memberData.teamName || "Untitled Team",
            };
          })
        );

        setMembers(memberList);
        
        // Initialize draft order
        if (data.draftOrderType === "admin" && data.customDraftOrder) {
          const orderedMembers = data.customDraftOrder.map(uid => 
            memberList.find(m => m.uid === uid)
          ).filter(Boolean);
          setDraftOrder(orderedMembers);
        } else if (data.draftOrderType === "admin") {
          setDraftOrder([...memberList]);
        }

        setLoading(false);
      } catch (error) {
        console.error("Error fetching league data:", error);
        setLoading(false);
      }
    };

    fetchData();
  }, [leagueId]);

  // Handle member changes and refresh draft order
  useEffect(() => {
    if (leagueData?.draftOrderType === "admin" && members.length > 0 && !draftStarted) {
      if (leagueData.customDraftOrder && leagueData.customDraftOrder.length > 0) {
        const orderedMembers = leagueData.customDraftOrder
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
  }, [members, leagueData?.draftOrderType, leagueData?.customDraftOrder, draftStarted]);

  const isAdmin = currentUserId && leagueData?.admin === currentUserId;
  const isLeagueFull = members.length === leagueData?.maxManagers;

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
      await updateDoc(doc(db, "leagues", leagueId), {
        customDraftOrder: orderUids
      });
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

  const handleRemoveManager = async (uid, memberName) => {
    try {
      await deleteDoc(doc(db, "leagues", leagueId, "members", uid));
      
      const leagueRef = doc(db, "leagues", leagueId);
      const currentMembers = leagueData.members || [];
      const updatedMembers = currentMembers.filter(memberId => memberId !== uid);
      
      await updateDoc(leagueRef, {
        members: updatedMembers
      });
      
      const userRef = doc(db, "users", uid);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        const userData = userSnap.data();
        const currentLeagueIds = userData.leagueIds || [];
        const updatedLeagueIds = currentLeagueIds.filter(id => id !== leagueId);
        
        await updateDoc(userRef, {
          leagueIds: updatedLeagueIds
        });
      }
      
      const updatedMembersList = members.filter((m) => m.uid !== uid);
      setMembers(updatedMembersList);
      setDraftOrder((prev) => prev.filter((m) => m.uid !== uid));
      setLeagueData((prev) => ({
        ...prev,
        members: updatedMembers
      }));

      showSuccess("Manager Removed", `${memberName} has been successfully removed from the league.`);
      
    } catch (error) {
      console.error("Error removing manager:", error);
      showError("Error", "Failed to remove manager. Please try again.");
    }
  };

  const handleDeleteLeague = async () => {
    try {
      const membersToUpdate = leagueData.members || [];
      
      for (const memberId of membersToUpdate) {
        try {
          const userRef = doc(db, "users", memberId);
          await updateDoc(userRef, {
            leagueIds: arrayRemove(leagueId)
          });
        } catch (error) {
          console.warn(`Failed to update user ${memberId}:`, error);
        }
      }

      const membersRef = collection(db, "leagues", leagueId, "members");
      const memberDocs = await getDocs(membersRef);
      for (const memberDoc of memberDocs.docs) {
        await deleteDoc(memberDoc.ref);
      }

      try {
        const draftRef = doc(db, "leagues", leagueId, "meta", "draft");
        await deleteDoc(draftRef);
      } catch (error) {
        console.warn("No draft metadata to delete:", error);
      }

      await deleteDoc(doc(db, "leagues", leagueId));

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
      const now = new Date();
      const minTime = new Date(now.getTime() + 15 * 60 * 1000);

      if (draftDateTime < minTime) {
        setError("Draft must be scheduled at least 15 minutes in the future.");
        return;
      }
    }

    const update = {
      name: formState.name,
      draftType: formState.draftType,
      draftOrderType: formState.draftOrderType,
      maxManagers: formState.maxManagers,
      scoringType: leagueData.scoringType
    };

    if (formState.draftType === "live" && formState.draftDate) {
      const [datePart, timePart] = formState.draftDate.split('T');
      const [year, month, day] = datePart.split('-').map(Number);
      const [hours, minutes] = timePart.split(':').map(Number);
      
      update.draftDate = new Date(year, month - 1, day, hours, minutes, 0);
      update.timePerPick = Number(formState.timePerPick);
    } else {
      update.draftDate = null;
      update.timePerPick = null;
    }

    try {
      await updateDoc(doc(db, "leagues", leagueId), update);
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
    const maxDate = new Date('2025-08-20T23:59');
    return maxDate.toISOString().slice(0, 16);
  };

  const getDraftOrderTypeDisplay = (type) => {
    switch (type) {
      case "random":
        return "Random Order (Determined at Draft Start)";
      case "admin":
        return "Commissioner Sets Order";
      default:
        return type;
    }
  };

  const getDraftDisplayText = (draftType) => {
    switch (draftType) {
      case "manual":
        return "Manual Draft (Commissioner Enters Teams)";
      case "live":
        return "Live Draft";
      default:
        return draftType;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white overflow-x-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-4 sm:left-10 w-48 sm:w-72 h-48 sm:h-72 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full blur-3xl animate-pulse"></div>
        </div>
        <div className="relative z-10 flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="text-4xl mb-4 animate-spin">⚙️</div>
            <p className="text-xl text-white/80">Loading league settings...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!leagueData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white overflow-x-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-4 sm:left-10 w-48 sm:w-72 h-48 sm:h-72 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full blur-3xl animate-pulse"></div>
        </div>
        <div className="relative z-10 flex items-center justify-center min-h-screen">
          <div className="text-center">
            <p className="text-xl text-red-400">League not found.</p>
          </div>
        </div>
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
    if (i < 3) return "from-red-400/20 to-red-500/20 border-red-400/30";
    if (isPlayoff) return "from-blue-400/20 to-blue-500/20 border-blue-400/30";
    return "from-green-400/20 to-green-500/20 border-green-400/30";
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white overflow-x-hidden">
      
      {/* Animated Background Elements */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-20 left-4 sm:left-10 w-48 sm:w-72 h-48 sm:h-72 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-20 right-4 sm:right-10 w-56 sm:w-96 h-56 sm:h-96 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full blur-3xl animate-pulse delay-1000"></div>
      </div>

      {/* Navigation */}
      <nav className="relative z-10 flex justify-between items-center p-4 sm:p-6 lg:p-8">
        <Link to="/home" className="flex items-center space-x-3">
          <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-r from-purple-500 to-blue-500 rounded-lg flex items-center justify-center font-bold text-lg sm:text-xl">
            L
          </div>
          <span className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
            Lineup
          </span>
        </Link>
        <div className="flex items-center space-x-4">
          <button 
            onClick={() => navigate(`/${leagueId}/my-lineup`)}
            className="flex items-center space-x-2 px-4 py-2 text-sm sm:text-base text-white/80 hover:text-white transition-colors duration-300 font-medium"
          >
            <ArrowLeft size={16} />
            <span>Back to League</span>
          </button>
        </div>
      </nav>

      {/* Main Content */}
      <div className="relative z-10 w-full max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12 pb-32">
        {/* Header */}
        <div className="text-center mb-8 sm:mb-12">
          <div className="mb-4 sm:mb-6">
            <span className="inline-block text-4xl sm:text-5xl mb-2 sm:mb-4">⚙️</span>
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black mb-4 leading-tight">
            <span className="bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
              League Settings
            </span>
          </h1>
          <p className="text-lg sm:text-xl text-white/80 max-w-2xl mx-auto break-all">
            League ID: {leagueId}
          </p>
        </div>

        {/* Draft Status Alert */}
        {draftStarted && (
          <div className={`mb-8 p-6 rounded-2xl border backdrop-blur-lg w-full ${
            leagueData?.draftComplete 
              ? 'bg-green-500/20 border-green-400/30' 
              : 'bg-yellow-500/20 border-yellow-400/30'
          }`}>
            <div className="flex items-center space-x-4">
              {leagueData?.draftComplete ? (
                <CheckCircle size={32} className="text-green-400 flex-shrink-0" />
              ) : (
                <Lock size={32} className="text-yellow-400 flex-shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <div className={`text-xl font-bold mb-2 ${
                  leagueData?.draftComplete ? 'text-green-300' : 'text-yellow-300'
                }`}>
                  {leagueData?.draftComplete ? "Draft Completed" : "Draft In Progress"}
                </div>
                <div className={`text-sm ${
                  leagueData?.draftComplete ? 'text-green-200' : 'text-yellow-200'
                }`}>
                  League settings are now locked and cannot be changed.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div className="mb-8 p-6 rounded-2xl border bg-red-500/20 border-red-400/30 backdrop-blur-lg w-full">
            <div className="flex items-center space-x-4">
              <AlertTriangle size={32} className="text-red-400 flex-shrink-0" />
              <div className="text-red-200 break-words min-w-0 flex-1">{error}</div>
            </div>
          </div>
        )}

        <div className="w-full space-y-8 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-8">
          {isAdmin ? (
            <>
              {/* League Settings */}
              <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 sm:p-8 border border-white/20 w-full">
                <div className="flex items-center space-x-4 mb-6">
                  <Settings size={32} className="text-purple-400 flex-shrink-0" />
                  <h2 className="text-2xl font-bold text-white min-w-0">League Configuration</h2>
                </div>

                <div className="space-y-6 w-full">
                  {/* League Name */}
                  <div className="w-full">
                    <label className="block text-sm font-medium text-white/80 mb-2">
                      League Name
                    </label>
                    <input 
                      value={formState.name || ''} 
                      onChange={(e) => handleInputChange("name", e.target.value)}
                      disabled={draftStarted}
                      className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/50 focus:border-purple-400 focus:outline-none transition-colors disabled:opacity-50"
                    />
                  </div>

                  {/* Draft Type */}
                  <div className="w-full">
                    <label className="block text-sm font-medium text-white/80 mb-2">
                      Draft Type
                    </label>
                    <select 
                      value={formState.draftType || ''} 
                      onChange={(e) => handleInputChange("draftType", e.target.value)}
                      disabled={draftStarted}
                      className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white focus:border-purple-400 focus:outline-none transition-colors disabled:opacity-50"
                    >
                      <option value="manual" className="bg-slate-800">Manual Draft (Commissioner Enters Teams)</option>
                      <option value="live" className="bg-slate-800">Live Draft</option>
                    </select>
                  </div>

                  {/* Draft Order */}
                  <div className="w-full">
                    <label className="block text-sm font-medium text-white/80 mb-2">
                      Draft Order
                    </label>
                    <select 
                      value={formState.draftOrderType || ''} 
                      onChange={(e) => handleInputChange("draftOrderType", e.target.value)}
                      disabled={draftStarted}
                      className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white focus:border-purple-400 focus:outline-none transition-colors disabled:opacity-50"
                    >
                      <option value="random" className="bg-slate-800">Random Order (Determined at Draft Start)</option>
                      <option value="admin" className="bg-slate-800">Commissioner Sets Order</option>
                    </select>
                  </div>

                  {/* Live Draft Settings */}
                  {formState.draftType === "live" && (
                    <>
                      <div className="w-full">
                        <label className="block text-sm font-medium text-white/80 mb-2">
                          Draft Date & Time
                        </label>
                        <input 
                          type="datetime-local" 
                          value={formState.draftDate || ''} 
                          onChange={(e) => handleInputChange("draftDate", e.target.value)}
                          min={getMinDateTime()}
                          max={getMaxDate()}
                          disabled={draftStarted}
                          className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white focus:border-purple-400 focus:outline-none transition-colors disabled:opacity-50"
                        />
                        <p className="text-xs text-white/60 mt-2">
                          Draft must be scheduled at least 15 minutes from now.
                        </p>
                      </div>

                      <div className="w-full">
                        <label className="block text-sm font-medium text-white/80 mb-2">
                          Time Per Pick (minutes)
                        </label>
                        <select 
                          value={formState.timePerPick || ''} 
                          onChange={(e) => handleInputChange("timePerPick", e.target.value)}
                          disabled={draftStarted}
                          className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white focus:border-purple-400 focus:outline-none transition-colors disabled:opacity-50"
                        >
                          <option value={0.1667} className="bg-slate-800">10 seconds</option>
                          <option value={1} className="bg-slate-800">1 minute</option>
                          <option value={2} className="bg-slate-800">2 minutes</option>
                          <option value={5} className="bg-slate-800">5 minutes</option>
                          <option value={10} className="bg-slate-800">10 minutes</option>
                        </select>
                      </div>
                    </>
                  )}

                  {/* Max Managers */}
                  <div className="w-full">
                    <label className="block text-sm font-medium text-white/80 mb-2">
                      Max Managers
                    </label>
                    <select 
                      value={formState.maxManagers || ''} 
                      onChange={(e) => handleInputChange("maxManagers", parseInt(e.target.value))}
                      disabled={draftStarted}
                      className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white focus:border-purple-400 focus:outline-none transition-colors disabled:opacity-50"
                    >
                      {[8, 10, 12].map((num) => (
                        <option key={num} value={num} className="bg-slate-800">{num}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-col sm:flex-row gap-4 mt-8 w-full">
                  <button 
                    onClick={handleConfirmChanges}
                    disabled={draftStarted}
                    className="flex items-center justify-center space-x-2 px-6 py-3 bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 disabled:from-gray-500 disabled:to-gray-600 text-white font-semibold rounded-xl transition-all duration-300 disabled:cursor-not-allowed"
                  >
                    <Save size={16} />
                    <span>{draftStarted ? "Settings Locked" : "Save Changes"}</span>
                  </button>
                  
                  <button 
                    onClick={() => setShowDeleteModal(true)}
                    className="flex items-center justify-center space-x-2 px-6 py-3 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white font-semibold rounded-xl transition-all duration-300"
                  >
                    <Trash2 size={16} />
                    <span>Delete League</span>
                  </button>
                </div>
              </div>

              {/* Draft Order Management */}
              {formState.draftOrderType === "admin" && !draftStarted && (
                <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 sm:p-8 border border-white/20 w-full">
                  <div className="flex items-center space-x-4 mb-6">
                    <Trophy size={32} className="text-yellow-400 flex-shrink-0" />
                    <h2 className="text-2xl font-bold text-white min-w-0">Draft Order Management</h2>
                  </div>
                  
                  {!isLeagueFull ? (
                    <div className="p-6 rounded-2xl border bg-yellow-500/20 border-yellow-400/30 backdrop-blur-lg mb-6 w-full">
                      <div className="flex items-center space-x-4">
                        <AlertTriangle size={32} className="text-yellow-400 flex-shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="text-xl font-bold text-yellow-300 mb-2">
                            League must be full before setting draft order
                          </div>
                          <div className="text-yellow-200">
                            Current: {members.length}/{leagueData.maxManagers} managers
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="text-white/70 mb-6">
                        Drag and drop to reorder managers. Position 1 gets the first pick.
                      </p>
                      
                      <div className="flex flex-col sm:flex-row gap-4 mb-6 w-full">
                        <button 
                          onClick={randomizeDraftOrder}
                          className="flex items-center justify-center space-x-2 px-4 py-2 bg-white/10 border border-white/20 rounded-xl text-white font-medium hover:bg-white/20 transition-all duration-300"
                        >
                          <Shuffle size={16} />
                          <span>Randomize Order</span>
                        </button>
                        
                        <button 
                          onClick={saveDraftOrder}
                          className="flex items-center justify-center space-x-2 px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white font-medium rounded-xl transition-all duration-300"
                        >
                          <Save size={16} />
                          <span>Save Draft Order</span>
                        </button>
                      </div>

                      <div className="space-y-3 w-full">
                        {draftOrder.map((member, index) => (
                          <div key={member.uid} className="flex items-center p-4 bg-white/5 border border-white/10 rounded-xl w-full">
                            <div className="w-12 h-12 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full flex items-center justify-center text-white font-bold text-lg mr-4 flex-shrink-0">
                              {index + 1}
                            </div>
                            
                            <div className="flex-1 min-w-0">
                              <div className="text-white font-semibold text-lg truncate">
                                {member.name || member.username}
                              </div>
                              <div className="text-white/60 text-sm truncate">
                                {member.teamName}
                              </div>
                            </div>
                            
                            <div className="flex flex-col space-y-2 flex-shrink-0">
                              <button 
                                onClick={() => handleDraftOrderChange(index, Math.max(0, index - 1))}
                                disabled={index === 0}
                                className="p-2 bg-white/10 border border-white/20 rounded-lg text-white hover:bg-white/20 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                <ChevronUp size={16} />
                              </button>
                              <button 
                                onClick={() => handleDraftOrderChange(index, Math.min(draftOrder.length - 1, index + 1))}
                                disabled={index === draftOrder.length - 1}
                                className="p-2 bg-white/10 border border-white/20 rounded-lg text-white hover:bg-white/20 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
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
            <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 sm:p-8 border border-white/20 w-full">
              <div className="flex items-center space-x-4 mb-6">
                <Shield size={32} className="text-blue-400 flex-shrink-0" />
                <h2 className="text-2xl font-bold text-white min-w-0">League Information</h2>
              </div>

              <div className="space-y-4 w-full">
                <div className="flex justify-between items-center py-3 border-b border-white/10">
                  <span className="text-white/70 font-medium">League Name:</span>
                  <span className="text-white break-words text-right">{leagueData.name}</span>
                </div>
                
                <div className="flex justify-between items-center py-3 border-b border-white/10">
                  <span className="text-white/70 font-medium">Commissioner:</span>
                  <span className="text-white break-words text-right">{adminName || "Unknown"}</span>
                </div>
                
                <div className="flex justify-between items-center py-3 border-b border-white/10">
                  <span className="text-white/70 font-medium">Draft Type:</span>
                  <span className="text-white break-words text-right">{getDraftDisplayText(leagueData.draftType)}</span>
                </div>
                
                <div className="flex justify-between items-center py-3 border-b border-white/10">
                  <span className="text-white/70 font-medium">Draft Order:</span>
                  <span className="text-white break-words text-right">{getDraftOrderTypeDisplay(leagueData.draftOrderType)}</span>
                </div>

                {leagueData.draftType === "live" && leagueData.draftDate && (
                  <>
                    <div className="flex justify-between items-center py-3 border-b border-white/10">
                      <span className="text-white/70 font-medium">Draft Date:</span>
                      <span className="text-white text-sm break-words text-right">
                        {leagueData.draftDate?.toDate().toLocaleString("en-US", {
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
                      <span className="text-white/70 font-medium">Time Per Pick:</span>
                      <span className="text-white break-words text-right">{leagueData.timePerPick} minutes</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* League Members */}
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 sm:p-8 border border-white/20 w-full">
            <div className="flex items-center space-x-4 mb-6">
              <Users size={32} className="text-green-400 flex-shrink-0" />
              <h2 className="text-2xl font-bold text-white min-w-0">
                League Members ({members.length}/{leagueData.maxManagers})
              </h2>
            </div>

            {members.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-white/60 text-lg">No members in this league yet.</p>
              </div>
            ) : (
              <div className="space-y-3 w-full">
                {members.map((member, idx) => (
                  <div key={idx} className="flex items-center justify-between p-4 bg-white/5 border border-white/10 rounded-xl w-full">
                    <div className="flex-1 min-w-0">
                      <div className="text-white font-semibold truncate">
                        {member.name || "Unknown"}
                      </div>
                      <div className="text-white/60 text-sm truncate">
                        {member.teamName} • @{member.username}
                      </div>
                    </div>
                    
                    {isAdmin && (
                      <button 
                        onClick={() => handleRemoveManager(member.uid, member.name || member.username)}
                        disabled={draftStarted}
                        className="px-4 py-2 bg-red-500/20 border border-red-400/30 text-red-300 font-medium rounded-lg hover:bg-red-500/30 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
                      >
                        {draftStarted ? "Locked" : "Remove"}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Season Timeline */}
        <div className="mt-8 bg-white/10 backdrop-blur-lg rounded-2xl p-6 sm:p-8 border border-white/20 w-full">
          <div className="flex items-center space-x-4 mb-6">
            <Calendar size={32} className="text-purple-400 flex-shrink-0" />
            <h2 className="text-2xl font-bold text-white min-w-0">2025 Season Timeline</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3 w-full">
            {weeks.map((date, i) => (
              <div key={i} className={`p-4 rounded-xl border bg-gradient-to-br ${getWeekColor(i)} text-center`}>
                <div className="text-white font-bold text-sm mb-1">
                  Week {i + 1}
                </div>
                <div className="text-white/80 text-xs mb-2">
                  {date}
                </div>
                <div className="text-white/90 text-xs font-semibold mb-2">
                  {getWeekLabel(i)}
                </div>
                {i === 9 && (
                  <div className="text-white/70 text-xs italic mb-2">
                    Last week of free agency
                  </div>
                )}
                <div className="text-white/80 text-xs">
                  Captain Bonus: {i === 0 ? "No" : "Yes"}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap gap-4 text-sm text-white/70">
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 bg-gradient-to-br from-green-400/20 to-green-500/20 border border-green-400/30 rounded"></div>
              <span>Game bonuses active</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 bg-gradient-to-br from-red-400/20 to-red-500/20 border border-red-400/30 rounded"></div>
              <span>Game bonuses not active</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 bg-gradient-to-br from-blue-400/20 to-blue-500/20 border border-blue-400/30 rounded"></div>
              <span>Playoffs/Championship (Free agency closed)</span>
            </div>
          </div>
        </div>

        {/* FAQ Section */}
        <div className="mt-8 bg-white/10 backdrop-blur-lg rounded-2xl p-6 sm:p-8 border border-white/20 w-full">
          <div className="flex items-center space-x-4 mb-6">
            <div className="text-3xl">❓</div>
            <h2 className="text-2xl font-bold text-white min-w-0">Frequently Asked Questions</h2>
          </div>

          <div className="space-y-6 w-full">
            {/* Lineup Management */}
            <div className="border-b border-white/10 pb-4">
              <h3 className="text-lg font-semibold text-white mb-2">Am I required to set a lineup each week?</h3>
              <p className="text-white/80 text-sm leading-relaxed">
                No, setting a lineup is optional. If you don't set a lineup for a particular week, you simply won't score any points for that week.
              </p>
            </div>

            <div className="border-b border-white/10 pb-4">
              <h3 className="text-lg font-semibold text-white mb-2">How does team scoring work?</h3>
              <p className="text-white/80 text-sm leading-relaxed mb-3">
                Teams in your starting lineup accumulate points based on their real-world performance each week. Points can be positive or negative depending on how the team performs. For detailed scoring information:
              </p>
              <button 
                onClick={() => {
                  // TODO: Link to scoring system page when available
                  alert("Scoring system page coming soon!");
                }}
                className="px-4 py-2 bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 text-white font-medium rounded-lg transition-all duration-300"
              >
                View Detailed Scoring System
              </button>
            </div>

            {/* Captain System */}
            <div className="border-b border-white/10 pb-4">
              <h3 className="text-lg font-semibold text-white mb-2">What is the captain system?</h3>
              <p className="text-white/80 text-sm leading-relaxed">
                Starting in Week 2, you can designate one team in your lineup as captain. The captain receives double points (positive or negative) for their performance that week. Captain selection is available from Week 2 through the championship game.
              </p>
            </div>

            <div className="border-b border-white/10 pb-4">
              <h3 className="text-lg font-semibold text-white mb-2">Do I have to select a captain?</h3>
              <p className="text-white/80 text-sm leading-relaxed">
                No, captain selection is optional. However, using the captain feature strategically can significantly boost your weekly score.
              </p>
            </div>

            {/* Game Bonuses */}
            <div className="border-b border-white/10 pb-4">
              <h3 className="text-lg font-semibold text-white mb-2">What are game bonuses and how do they work?</h3>
              <p className="text-white/80 text-sm leading-relaxed mb-3">
                There are two types of game bonuses available:
              </p>
              <div className="ml-4 space-y-3">
                <div>
                  <p className="text-white font-medium text-sm mb-1">3x Play Chip (1 per season)</p>
                  <p className="text-white/80 text-xs leading-relaxed">
                    Can be used from Week 4 until the week before playoffs begin. Multiplies a team's points by 3x. When combined with a captain, creates a 5x multiplier (2x captain + 3x chip).
                  </p>
                </div>
                <div>
                  <p className="text-white font-medium text-sm mb-1">Freeze Play (3 per season)</p>
                  <p className="text-white/80 text-xs leading-relaxed">
                    Locks in a team's current point total during the second half of their game. Once used, the freeze cannot be undone, and the team's score won't change regardless of subsequent performance.
                  </p>
                </div>
              </div>
            </div>

            <div className="border-b border-white/10 pb-4">
              <h3 className="text-lg font-semibold text-white mb-2">Can I combine different bonuses?</h3>
              <p className="text-white/80 text-sm leading-relaxed">
                Yes! You can combine freeze plays with both captain bonuses and 3x play chips. However, you cannot use multiple bonuses of the same type on one team in a single week.
              </p>
            </div>

            {/* League Structure */}
            <div className="border-b border-white/10 pb-4">
              <h3 className="text-lg font-semibold text-white mb-2">How do playoffs work?</h3>
              <p className="text-white/80 text-sm leading-relaxed">
                Unlike the regular season, playoffs are conducted head-to-head. You'll be matched against another manager, and whoever scores more points that week advances. The playoff format depends on your league size.
              </p>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-white mb-2">When does free agency close?</h3>
              <p className="text-white/80 text-sm leading-relaxed">
                Free agency closes at the start of playoff weeks. Once playoffs begin, you cannot add or drop teams from your roster. Plan your roster moves accordingly during the regular season.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      {/* Delete League Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 rounded-2xl p-8 max-w-md w-full border border-white/20">
            <div className="text-center">
              <div className="w-16 h-16 bg-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
                <AlertTriangle size={32} className="text-white" />
              </div>

              <h3 className="text-2xl font-bold text-white mb-4">
                Delete League "{leagueData.name}"?
              </h3>
              
              <div className="text-white/70 text-left mb-6">
                <p className="mb-4">This will permanently:</p>
                <ul className="list-disc list-inside space-y-2 mb-4">
                  <li>Delete the league and all its data</li>
                  <li>Remove it from all members' league lists</li>
                  <li>Delete all draft data and settings</li>
                </ul>
                <p className="text-red-400 font-semibold text-center">
                  THIS CANNOT BE UNDONE!
                </p>
              </div>

              <div className="flex space-x-4">
                <button
                  onClick={closeModals}
                  className="flex-1 px-6 py-3 bg-white/10 border border-white/20 text-white font-semibold rounded-xl hover:bg-white/20 transition-all duration-300"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteLeague}
                  className="flex-1 px-6 py-3 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-xl transition-all duration-300"
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
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 rounded-2xl p-8 max-w-md w-full border border-white/20">
            <div className="text-center">
              <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle size={32} className="text-white" />
              </div>

              <h3 className="text-xl font-bold text-white mb-3">
                {modalTitle}
              </h3>
              
              <p className="text-white/70 mb-6">
                {modalMessage}
              </p>

              <button
                onClick={closeModals}
                className="w-full px-6 py-3 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-xl transition-all duration-300"
              >
                Great!
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error Modal */}
      {showErrorModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 rounded-2xl p-8 max-w-md w-full border border-white/20">
            <div className="text-center">
              <div className="w-16 h-16 bg-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
                <AlertTriangle size={32} className="text-white" />
              </div>

              <h3 className="text-xl font-bold text-white mb-3">
                {modalTitle}
              </h3>
              
              <p className="text-white/70 mb-6">
                {modalMessage}
              </p>

              <button
                onClick={closeModals}
                className="w-full px-6 py-3 bg-white/10 border border-white/20 text-white font-semibold rounded-xl hover:bg-white/20 transition-all duration-300"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
      <BottomNavBar leagueId={leagueId} isDraftComplete={leagueData?.draftComplete || false} />
    </div>
  );
}

export default LeagueRules;