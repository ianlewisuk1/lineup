import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
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
  Lock
} from "lucide-react";
import LeagueNavBar from "../components/LeagueNavBar";

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
      <div style={{ backgroundColor: "#f8fafc", minHeight: "100vh" }}>
        <LeagueNavBar />
        <div style={{ 
          padding: "40px 20px", 
          textAlign: "center",
          color: "#64748b",
          fontSize: "16px"
        }}>
          Loading league settings...
        </div>
      </div>
    );
  }

  if (!leagueData) {
    return (
      <div style={{ backgroundColor: "#f8fafc", minHeight: "100vh" }}>
        <LeagueNavBar />
        <div style={{ 
          padding: "40px 20px", 
          textAlign: "center",
          color: "#dc2626",
          fontSize: "16px"
        }}>
          League not found.
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
    if (m === 8 && i >= 12) return i === 12 ? "Playoffs" : "Championship";
    if ((m === 10 || m === 12) && i >= 11)
      return i === 11 ? "Playoffs" : i === 12 ? "Semifinals" : "Championship";
    return "Regular Season";
  };

  const getWeekColor = (i) => {
    const m = formState.maxManagers;
    const isPlayoff = (m === 8 && i >= 12) || ((m === 10 || m === 12) && i >= 11);
    if (i < 3) return "#fecaca";
    if (isPlayoff) return "#bfdbfe";
    return "#bbf7d0";
  };

  return (
    <div style={{ backgroundColor: "#f8fafc", minHeight: "100vh" }}>
      <LeagueNavBar />

      {/* Header */}
      <div style={{ 
        padding: "20px 16px 16px 16px",
        background: "linear-gradient(135deg, #1e40af 0%, #0ea5e9 100%)",
        color: "white"
      }}>
        <h1 style={{ 
          fontSize: "24px", 
          fontWeight: "700", 
          margin: "0 0 8px 0",
          textAlign: "center"
        }}>
          League Settings
        </h1>
        <p style={{
          fontSize: "14px",
          opacity: "0.9",
          textAlign: "center",
          margin: 0
        }}>
          League ID: {leagueId}
        </p>
      </div>

      <div style={{ padding: "20px 16px" }}>
        {/* Draft Status Alert */}
        {draftStarted && (
          <div style={{ 
            padding: "16px", 
            backgroundColor: leagueData?.draftComplete ? "#ecfdf5" : "#fef3c7", 
            border: `2px solid ${leagueData?.draftComplete ? "#10b981" : "#f59e0b"}`, 
            borderRadius: "12px", 
            marginBottom: "20px",
            display: "flex",
            alignItems: "center",
            gap: "12px"
          }}>
            {leagueData?.draftComplete ? (
              <CheckCircle size={24} style={{ color: "#059669", flexShrink: 0 }} />
            ) : (
              <Lock size={24} style={{ color: "#d97706", flexShrink: 0 }} />
            )}
            <div>
              <div style={{ 
                fontWeight: "600", 
                color: leagueData?.draftComplete ? "#059669" : "#92400e",
                marginBottom: "4px"
              }}>
                {leagueData?.draftComplete ? "Draft Completed" : "Draft In Progress"}
              </div>
              <div style={{ 
                fontSize: "14px", 
                color: leagueData?.draftComplete ? "#047857" : "#a16207"
              }}>
                League settings are now locked and cannot be changed.
              </div>
            </div>
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div style={{ 
            padding: "16px", 
            backgroundColor: "#fef2f2", 
            border: "2px solid #ef4444", 
            borderRadius: "12px", 
            marginBottom: "20px",
            display: "flex",
            alignItems: "center",
            gap: "12px"
          }}>
            <AlertTriangle size={24} style={{ color: "#dc2626", flexShrink: 0 }} />
            <div style={{ color: "#dc2626", fontSize: "14px" }}>
              {error}
            </div>
          </div>
        )}

        {isAdmin ? (
          <>
            {/* League Settings */}
            <div style={{
              backgroundColor: "white",
              borderRadius: "12px",
              padding: "20px",
              marginBottom: "20px",
              boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
            }}>
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                marginBottom: "20px"
              }}>
                <Settings size={24} style={{ color: "#1e40af" }} />
                <h2 style={{
                  fontSize: "18px",
                  fontWeight: "600",
                  color: "#1e293b",
                  margin: 0
                }}>
                  League Configuration
                </h2>
              </div>

              <div style={{ display: "grid", gap: "16px" }}>
                {/* League Name */}
                <div>
                  <label style={{
                    display: "block",
                    fontSize: "14px",
                    fontWeight: "500",
                    color: "#374151",
                    marginBottom: "6px"
                  }}>
                    League Name
                  </label>
                  <input 
                    value={formState.name} 
                    onChange={(e) => handleInputChange("name", e.target.value)}
                    disabled={draftStarted}
                    style={{
                      width: "100%",
                      padding: "12px",
                      border: "2px solid #e5e7eb",
                      borderRadius: "8px",
                      fontSize: "14px",
                      backgroundColor: draftStarted ? "#f9fafb" : "white",
                      opacity: draftStarted ? 0.6 : 1,
                      boxSizing: "border-box"
                    }}
                  />
                </div>

                {/* Draft Type */}
                <div>
                  <label style={{
                    display: "block",
                    fontSize: "14px",
                    fontWeight: "500",
                    color: "#374151",
                    marginBottom: "6px"
                  }}>
                    Draft Type
                  </label>
                  <select 
                    value={formState.draftType} 
                    onChange={(e) => handleInputChange("draftType", e.target.value)}
                    disabled={draftStarted}
                    style={{
                      width: "100%",
                      padding: "12px",
                      border: "2px solid #e5e7eb",
                      borderRadius: "8px",
                      fontSize: "14px",
                      backgroundColor: draftStarted ? "#f9fafb" : "white",
                      opacity: draftStarted ? 0.6 : 1,
                      boxSizing: "border-box"
                    }}
                  >
                    <option value="manual">Manual Draft (Commissioner Enters Teams)</option>
                    <option value="live">Live Draft</option>
                  </select>
                </div>

                {/* Draft Order */}
                <div>
                  <label style={{
                    display: "block",
                    fontSize: "14px",
                    fontWeight: "500",
                    color: "#374151",
                    marginBottom: "6px"
                  }}>
                    Draft Order
                  </label>
                  <select 
                    value={formState.draftOrderType} 
                    onChange={(e) => handleInputChange("draftOrderType", e.target.value)}
                    disabled={draftStarted}
                    style={{
                      width: "100%",
                      padding: "12px",
                      border: "2px solid #e5e7eb",
                      borderRadius: "8px",
                      fontSize: "14px",
                      backgroundColor: draftStarted ? "#f9fafb" : "white",
                      opacity: draftStarted ? 0.6 : 1,
                      boxSizing: "border-box"
                    }}
                  >
                    <option value="random">Random Order (Determined at Draft Start)</option>
                    <option value="admin">Commissioner Sets Order</option>
                  </select>
                </div>

                {/* Live Draft Settings */}
                {formState.draftType === "live" && (
                  <>
                    <div>
                      <label style={{
                        display: "block",
                        fontSize: "14px",
                        fontWeight: "500",
                        color: "#374151",
                        marginBottom: "6px"
                      }}>
                        Draft Date & Time
                      </label>
                      <input 
                        type="datetime-local" 
                        value={formState.draftDate} 
                        onChange={(e) => handleInputChange("draftDate", e.target.value)}
                        min={getMinDateTime()}
                        max={getMaxDate()}
                        disabled={draftStarted}
                        style={{
                          width: "100%",
                          padding: "12px",
                          border: "2px solid #e5e7eb",
                          borderRadius: "8px",
                          fontSize: "14px",
                          backgroundColor: draftStarted ? "#f9fafb" : "white",
                          opacity: draftStarted ? 0.6 : 1,
                          boxSizing: "border-box"
                        }}
                      />
                      <div style={{
                        fontSize: "12px",
                        color: "#64748b",
                        marginTop: "4px"
                      }}>
                        Draft must be scheduled at least 15 minutes from now.
                      </div>
                    </div>

                    <div>
                      <label style={{
                        display: "block",
                        fontSize: "14px",
                        fontWeight: "500",
                        color: "#374151",
                        marginBottom: "6px"
                      }}>
                        Time Per Pick (minutes)
                      </label>
                      <select 
                        value={formState.timePerPick} 
                        onChange={(e) => handleInputChange("timePerPick", e.target.value)}
                        disabled={draftStarted}
                        style={{
                          width: "100%",
                          padding: "12px",
                          border: "2px solid #e5e7eb",
                          borderRadius: "8px",
                          fontSize: "14px",
                          backgroundColor: draftStarted ? "#f9fafb" : "white",
                          opacity: draftStarted ? 0.6 : 1,
                          boxSizing: "border-box"
                        }}
                      >
                        <option value={1}>1 minute</option>
                        <option value={2}>2 minutes</option>
                        <option value={5}>5 minutes</option>
                        <option value={10}>10 minutes</option>
                      </select>
                    </div>
                  </>
                )}

                {/* Max Managers */}
                <div>
                  <label style={{
                    display: "block",
                    fontSize: "14px",
                    fontWeight: "500",
                    color: "#374151",
                    marginBottom: "6px"
                  }}>
                    Max Managers
                  </label>
                  <select 
                    value={formState.maxManagers} 
                    onChange={(e) => handleInputChange("maxManagers", parseInt(e.target.value))}
                    disabled={draftStarted}
                    style={{
                      width: "100%",
                      padding: "12px",
                      border: "2px solid #e5e7eb",
                      borderRadius: "8px",
                      fontSize: "14px",
                      backgroundColor: draftStarted ? "#f9fafb" : "white",
                      opacity: draftStarted ? 0.6 : 1,
                      boxSizing: "border-box"
                    }}
                  >
                    {[8, 10, 12].map((num) => (
                      <option key={num} value={num}>{num}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ 
                display: "flex", 
                gap: "12px", 
                marginTop: "20px",
                flexWrap: "wrap"
              }}>
                <button 
                  onClick={handleConfirmChanges}
                  disabled={draftStarted}
                  style={{ 
                    padding: "12px 24px",
                    backgroundColor: draftStarted ? "#9ca3af" : "#1e40af",
                    color: "white",
                    border: "none",
                    borderRadius: "8px",
                    fontSize: "14px",
                    fontWeight: "500",
                    cursor: draftStarted ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    transition: "all 0.2s ease"
                  }}
                  onMouseEnter={(e) => {
                    if (!draftStarted) e.target.style.backgroundColor = "#1d4ed8";
                  }}
                  onMouseLeave={(e) => {
                    if (!draftStarted) e.target.style.backgroundColor = "#1e40af";
                  }}
                >
                  <Save size={16} />
                  {draftStarted ? "Settings Locked" : "Save Changes"}
                </button>
                
                <button 
                  onClick={() => setShowDeleteModal(true)}
                  style={{ 
                    padding: "12px 24px",
                    backgroundColor: "#dc2626",
                    color: "white",
                    border: "none",
                    borderRadius: "8px",
                    fontSize: "14px",
                    fontWeight: "500",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    transition: "all 0.2s ease"
                  }}
                  onMouseEnter={(e) => e.target.style.backgroundColor = "#b91c1c"}
                  onMouseLeave={(e) => e.target.style.backgroundColor = "#dc2626"}
                >
                  <Trash2 size={16} />
                  Delete League
                </button>
              </div>
            </div>

            {/* Draft Order Management */}
            {formState.draftOrderType === "admin" && !draftStarted && (
              <div style={{
                backgroundColor: "white",
                borderRadius: "12px",
                padding: "20px",
                marginBottom: "20px",
                boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
              }}>
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  marginBottom: "20px"
                }}>
                  <Trophy size={24} style={{ color: "#1e40af" }} />
                  <h2 style={{
                    fontSize: "18px",
                    fontWeight: "600",
                    color: "#1e293b",
                    margin: 0
                  }}>
                    Draft Order Management
                  </h2>
                </div>
                
                {!isLeagueFull ? (
                  <div style={{ 
                    padding: "16px", 
                    backgroundColor: "#fef3c7", 
                    border: "2px solid #f59e0b", 
                    borderRadius: "12px", 
                    marginBottom: "16px",
                    display: "flex",
                    alignItems: "center",
                    gap: "12px"
                  }}>
                    <AlertTriangle size={24} style={{ color: "#d97706", flexShrink: 0 }} />
                    <div>
                      <div style={{ fontWeight: "600", color: "#92400e", marginBottom: "4px" }}>
                        League must be full before setting draft order
                      </div>
                      <div style={{ fontSize: "14px", color: "#a16207" }}>
                        Current: {members.length}/{leagueData.maxManagers} managers
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <p style={{ 
                      color: "#64748b", 
                      marginBottom: "16px",
                      fontSize: "14px"
                    }}>
                      Drag and drop to reorder managers. Position 1 gets the first pick.
                    </p>
                    
                    <div style={{ 
                      display: "flex", 
                      gap: "12px", 
                      marginBottom: "20px",
                      flexWrap: "wrap"
                    }}>
                      <button 
                        onClick={randomizeDraftOrder}
                        style={{ 
                          padding: "12px 20px",
                          backgroundColor: "#6b7280",
                          color: "white",
                          border: "none",
                          borderRadius: "8px",
                          fontSize: "14px",
                          fontWeight: "500",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          transition: "all 0.2s ease"
                        }}
                        onMouseEnter={(e) => e.target.style.backgroundColor = "#4b5563"}
                        onMouseLeave={(e) => e.target.style.backgroundColor = "#6b7280"}
                      >
                        <Shuffle size={16} />
                        Randomize Order
                      </button>
                      
                      <button 
                        onClick={saveDraftOrder}
                        style={{ 
                          padding: "12px 20px",
                          backgroundColor: "#059669",
                          color: "white",
                          border: "none",
                          borderRadius: "8px",
                          fontSize: "14px",
                          fontWeight: "500",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          transition: "all 0.2s ease"
                        }}
                        onMouseEnter={(e) => e.target.style.backgroundColor = "#047857"}
                        onMouseLeave={(e) => e.target.style.backgroundColor = "#059669"}
                      >
                        <Save size={16} />
                        Save Draft Order
                      </button>
                    </div>

                    <div style={{ maxWidth: "600px" }}>
                      {draftOrder.map((member, index) => (
                        <div key={member.uid} style={{
                          display: "flex",
                          alignItems: "center",
                          padding: "12px",
                          margin: "8px 0",
                          backgroundColor: "#f8fafc",
                          border: "2px solid #e2e8f0",
                          borderRadius: "12px",
                          transition: "all 0.2s ease"
                        }}>
                          <div style={{ 
                            marginRight: "16px", 
                            fontWeight: "700", 
                            minWidth: "40px",
                            textAlign: "center",
                            backgroundColor: "#1e40af",
                            color: "white",
                            borderRadius: "50%",
                            width: "40px",
                            height: "40px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: "16px"
                          }}>
                            {index + 1}
                          </div>
                          
                          <div style={{ flex: 1 }}>
                            <div style={{ 
                              fontWeight: "600", 
                              color: "#1e293b",
                              fontSize: "16px",
                              marginBottom: "2px"
                            }}>
                              {member.name || member.username}
                            </div>
                            <div style={{ 
                              fontSize: "14px", 
                              color: "#64748b" 
                            }}>
                              {member.teamName}
                            </div>
                          </div>
                          
                          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                            <button 
                              onClick={() => handleDraftOrderChange(index, Math.max(0, index - 1))}
                              disabled={index === 0}
                              style={{ 
                                padding: "6px 12px",
                                backgroundColor: index === 0 ? "#e5e7eb" : "#1e40af",
                                color: index === 0 ? "#9ca3af" : "white",
                                border: "none",
                                borderRadius: "6px",
                                fontSize: "12px",
                                fontWeight: "500",
                                cursor: index === 0 ? "not-allowed" : "pointer",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                transition: "all 0.2s ease"
                              }}
                            >
                              <ChevronUp size={14} />
                            </button>
                            <button 
                              onClick={() => handleDraftOrderChange(index, Math.min(draftOrder.length - 1, index + 1))}
                              disabled={index === draftOrder.length - 1}
                              style={{ 
                                padding: "6px 12px",
                                backgroundColor: index === draftOrder.length - 1 ? "#e5e7eb" : "#1e40af",
                                color: index === draftOrder.length - 1 ? "#9ca3af" : "white",
                                border: "none",
                                borderRadius: "6px",
                                fontSize: "12px",
                                fontWeight: "500",
                                cursor: index === draftOrder.length - 1 ? "not-allowed" : "pointer",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                transition: "all 0.2s ease"
                              }}
                            >
                              <ChevronDown size={14} />
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
          <div style={{
            backgroundColor: "white",
            borderRadius: "12px",
            padding: "20px",
            marginBottom: "20px",
            boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
          }}>
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              marginBottom: "20px"
            }}>
              <Shield size={24} style={{ color: "#1e40af" }} />
              <h2 style={{
                fontSize: "18px",
                fontWeight: "600",
                color: "#1e293b",
                margin: 0
              }}>
                League Information
              </h2>
            </div>

            <div style={{ display: "grid", gap: "12px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontWeight: "500", color: "#374151" }}>League Name:</span>
                <span style={{ color: "#1e293b" }}>{leagueData.name}</span>
              </div>
              
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontWeight: "500", color: "#374151" }}>Commissioner:</span>
                <span style={{ color: "#1e293b" }}>{adminName || "Unknown"}</span>
              </div>
              
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontWeight: "500", color: "#374151" }}>Draft Type:</span>
                <span style={{ color: "#1e293b" }}>{getDraftDisplayText(leagueData.draftType)}</span>
              </div>
              
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontWeight: "500", color: "#374151" }}>Draft Order:</span>
                <span style={{ color: "#1e293b" }}>{getDraftOrderTypeDisplay(leagueData.draftOrderType)}</span>
              </div>

              {leagueData.draftType === "live" && leagueData.draftDate && (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontWeight: "500", color: "#374151" }}>Draft Date:</span>
                    <span style={{ color: "#1e293b" }}>
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
                  
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontWeight: "500", color: "#374151" }}>Time Per Pick:</span>
                    <span style={{ color: "#1e293b" }}>{leagueData.timePerPick} minutes</span>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* League Members */}
        <div style={{
          backgroundColor: "white",
          borderRadius: "12px",
          padding: "20px",
          marginBottom: "20px",
          boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
        }}>
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            marginBottom: "20px"
          }}>
            <Users size={24} style={{ color: "#1e40af" }} />
            <h2 style={{
              fontSize: "18px",
              fontWeight: "600",
              color: "#1e293b",
              margin: 0
            }}>
              League Members ({members.length}/{leagueData.maxManagers})
            </h2>
          </div>

          {members.length === 0 ? (
            <div style={{
              textAlign: "center",
              color: "#64748b",
              padding: "40px 20px",
              fontSize: "16px"
            }}>
              No members in this league yet.
            </div>
          ) : (
            <div style={{ display: "grid", gap: "8px" }}>
              {members.map((member, idx) => (
                <div key={idx} style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "12px",
                  backgroundColor: "#f8fafc",
                  borderRadius: "8px",
                  border: "1px solid #e2e8f0"
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{
                      fontWeight: "600",
                      color: "#1e293b",
                      marginBottom: "2px"
                    }}>
                      {member.name || "Unknown"}
                    </div>
                    <div style={{
                      fontSize: "14px",
                      color: "#64748b"
                    }}>
                      {member.teamName} • @{member.username}
                    </div>
                  </div>
                  
                  {isAdmin && (
                    <button 
                      onClick={() => handleRemoveManager(member.uid, member.name || member.username)}
                      disabled={draftStarted}
                      style={{ 
                        padding: "8px 16px",
                        backgroundColor: draftStarted ? "#e5e7eb" : "#dc2626",
                        color: draftStarted ? "#9ca3af" : "white",
                        border: "none",
                        borderRadius: "6px",
                        fontSize: "12px",
                        fontWeight: "500",
                        cursor: draftStarted ? "not-allowed" : "pointer",
                        transition: "all 0.2s ease"
                      }}
                    >
                      {draftStarted ? "Locked" : "Remove"}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Season Timeline */}
        <div style={{
          backgroundColor: "white",
          borderRadius: "12px",
          padding: "20px",
          marginBottom: "20px",
          boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
        }}>
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            marginBottom: "20px"
          }}>
            <Calendar size={24} style={{ color: "#1e40af" }} />
            <h2 style={{
              fontSize: "18px",
              fontWeight: "600",
              color: "#1e293b",
              margin: 0
            }}>
              2025 Season Timeline
            </h2>
          </div>

          <div style={{ 
            display: "grid", 
            gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", 
            gap: "8px"
          }}>
            {weeks.map((date, i) => (
              <div key={i} style={{
                border: "2px solid #e2e8f0",
                backgroundColor: getWeekColor(i),
                padding: "12px 8px",
                fontSize: "12px",
                borderRadius: "8px",
                textAlign: "center"
              }}>
                <div style={{ fontWeight: "700", marginBottom: "4px" }}>
                  Week {i + 1}
                </div>
                <div style={{ marginBottom: "4px", fontSize: "11px" }}>
                  {date}
                </div>
                <div style={{ 
                  fontSize: "10px", 
                  fontWeight: "600",
                  color: "#374151",
                  marginBottom: "4px"
                }}>
                  {getWeekLabel(i)}
                </div>
                {i === 9 && (
                  <div style={{ 
                    fontSize: "9px", 
                    fontStyle: "italic",
                    color: "#64748b",
                    marginBottom: "4px"
                  }}>
                    Last week of free agency
                  </div>
                )}
                <div style={{ fontSize: "10px", color: "#374151" }}>
                  Captain Bonus: {i === 0 ? "No" : "Yes"}
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: "16px", fontSize: "12px", color: "#64748b" }}>
            <div style={{ marginBottom: "4px" }}>
              <span style={{ 
                display: "inline-block", 
                width: "12px", 
                height: "12px", 
                backgroundColor: "#bbf7d0", 
                marginRight: "8px",
                borderRadius: "2px"
              }}></span>
              Green = Game bonuses active
            </div>
            <div style={{ marginBottom: "4px" }}>
              <span style={{ 
                display: "inline-block", 
                width: "12px", 
                height: "12px", 
                backgroundColor: "#fecaca", 
                marginRight: "8px",
                borderRadius: "2px"
              }}></span>
              Red = Game bonuses not active
            </div>
            <div>
              <span style={{ 
                display: "inline-block", 
                width: "12px", 
                height: "12px", 
                backgroundColor: "#bfdbfe", 
                marginRight: "8px",
                borderRadius: "2px"
              }}></span>
              Blue = Playoffs or Championship
            </div>
          </div>
        </div>
      </div>

      {/* Delete League Modal */}
      {showDeleteModal && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(0, 0, 0, 0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000,
          padding: "16px"
        }}>
          <div style={{
            backgroundColor: "white",
            borderRadius: "16px",
            padding: "24px",
            maxWidth: "500px",
            width: "100%",
            textAlign: "center",
            boxShadow: "0 20px 40px rgba(0, 0, 0, 0.3)"
          }}>
            <div style={{
              width: "60px",
              height: "60px",
              backgroundColor: "#dc2626",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 16px auto"
            }}>
              <AlertTriangle size={32} style={{ color: "white" }} />
            </div>

            <h3 style={{ 
              fontSize: "20px", 
              fontWeight: "700", 
              marginBottom: "12px",
              color: "#1e293b"
            }}>
              Delete League "{leagueData.name}"?
            </h3>
            
            <div style={{ 
              marginBottom: "24px",
              color: "#64748b",
              fontSize: "14px",
              textAlign: "left"
            }}>
              <p style={{ marginBottom: "12px" }}>This will permanently:</p>
              <ul style={{ marginLeft: "20px", marginBottom: "16px" }}>
                <li>Delete the league and all its data</li>
                <li>Remove it from all members' league lists</li>
                <li>Delete all draft data and settings</li>
              </ul>
              <p style={{ 
                fontWeight: "600", 
                color: "#dc2626",
                textAlign: "center"
              }}>
                THIS CANNOT BE UNDONE!
              </p>
            </div>

            <div style={{ display: "flex", gap: "12px" }}>
              <button
                onClick={closeModals}
                style={{
                  flex: 1,
                  padding: "12px",
                  backgroundColor: "#6b7280",
                  color: "white",
                  border: "none",
                  borderRadius: "8px",
                  fontSize: "14px",
                  fontWeight: "500",
                  cursor: "pointer"
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteLeague}
                style={{
                  flex: 1,
                  padding: "12px",
                  backgroundColor: "#dc2626",
                  color: "white",
                  border: "none",
                  borderRadius: "8px",
                  fontSize: "14px",
                  fontWeight: "500",
                  cursor: "pointer"
                }}
              >
                Delete League
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success Modal */}
      {showSuccessModal && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(0, 0, 0, 0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000,
          padding: "16px"
        }}>
          <div style={{
            backgroundColor: "white",
            borderRadius: "16px",
            padding: "24px",
            maxWidth: "400px",
            width: "100%",
            textAlign: "center",
            boxShadow: "0 20px 40px rgba(0, 0, 0, 0.3)"
          }}>
            <div style={{
              width: "60px",
              height: "60px",
              backgroundColor: "#10b981",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 16px auto"
            }}>
              <CheckCircle size={32} style={{ color: "white" }} />
            </div>

            <h3 style={{ 
              fontSize: "18px", 
              fontWeight: "600", 
              marginBottom: "8px",
              color: "#1e293b"
            }}>
              {modalTitle}
            </h3>
            
            <p style={{ 
              marginBottom: "24px",
              color: "#64748b",
              fontSize: "14px"
            }}>
              {modalMessage}
            </p>

            <button
              onClick={closeModals}
              style={{
                width: "100%",
                padding: "12px",
                backgroundColor: "#10b981",
                color: "white",
                border: "none",
                borderRadius: "8px",
                fontSize: "14px",
                fontWeight: "500",
                cursor: "pointer"
              }}
            >
              Great!
            </button>
          </div>
        </div>
      )}

      {/* Error Modal */}
      {showErrorModal && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(0, 0, 0, 0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000,
          padding: "16px"
        }}>
          <div style={{
            backgroundColor: "white",
            borderRadius: "16px",
            padding: "24px",
            maxWidth: "400px",
            width: "100%",
            textAlign: "center",
            boxShadow: "0 20px 40px rgba(0, 0, 0, 0.3)"
          }}>
            <div style={{
              width: "60px",
              height: "60px",
              backgroundColor: "#ef4444",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 16px auto"
            }}>
              <AlertTriangle size={32} style={{ color: "white" }} />
            </div>

            <h3 style={{ 
              fontSize: "18px", 
              fontWeight: "600", 
              marginBottom: "8px",
              color: "#1e293b"
            }}>
              {modalTitle}
            </h3>
            
            <p style={{ 
              marginBottom: "24px",
              color: "#64748b",
              fontSize: "14px"
            }}>
              {modalMessage}
            </p>

            <button
              onClick={closeModals}
              style={{
                width: "100%",
                padding: "12px",
                backgroundColor: "#6b7280",
                color: "white",
                border: "none",
                borderRadius: "8px",
                fontSize: "14px",
                fontWeight: "500",
                cursor: "pointer"
              }}
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {/* Bottom spacing */}
      <div style={{ height: "80px" }} />
    </div>
  );
}

export default LeagueRules;