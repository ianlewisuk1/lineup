// src/pages/LeagueRules.js
import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { db, auth } from "../firebase/firebase";
import {
  doc,
  getDoc,
  collection,
  getDocs,
  updateDoc,
  deleteDoc
} from "firebase/firestore";
import LeagueNavBar from "../components/LeagueNavBar";

function LeagueRules() {
  const { leagueId } = useParams();
  const [leagueData, setLeagueData] = useState(null);
  const [adminName, setAdminName] = useState("");
  const [members, setMembers] = useState([]);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [formState, setFormState] = useState({});
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchData = async () => {
      const user = auth.currentUser;
      if (user) setCurrentUserId(user.uid);

      const leagueRef = doc(db, "leagues", leagueId);
      const leagueSnap = await getDoc(leagueRef);
      const data = leagueSnap.data();
      setLeagueData(data);
      setFormState({
        name: data.name,
        draftType: data.draftType,
        draftDate: data.draftDate?.toDate().toISOString().slice(0, 16) || "",
        timePerPick: data.timePerPick || 5,
        maxManagers: data.maxManagers
      });

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
    };

    fetchData();
  }, [leagueId]);

  const isAdmin = currentUserId && leagueData?.admin === currentUserId;

  const handleInputChange = (field, value) => {
    setFormState((prev) => ({ ...prev, [field]: value }));
  };

  const handleRemoveManager = async (uid, memberName) => {
    const confirmRemoval = window.confirm(
      `Are you sure you want to remove ${memberName} from the league? This action cannot be undone.`
    );
    
    if (confirmRemoval) {
      try {
        // Remove from the members subcollection
        await deleteDoc(doc(db, "leagues", leagueId, "members", uid));
        
        // Remove from the members array field in the main league document
        const leagueRef = doc(db, "leagues", leagueId);
        const currentMembers = leagueData.members || [];
        const updatedMembers = currentMembers.filter(memberId => memberId !== uid);
        
        await updateDoc(leagueRef, {
          members: updatedMembers
        });
        
        // Remove league ID from user's leagueIds array
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
        
        // Update local state
        setMembers((prev) => prev.filter((m) => m.uid !== uid));
        setLeagueData((prev) => ({
          ...prev,
          members: updatedMembers
        }));
      } catch (error) {
        console.error("Error removing manager:", error);
        setError("Failed to remove manager. Please try again.");
      }
    }
  };

  const handleConfirmChanges = async () => {
    if (members.length > formState.maxManagers) {
      setError(`Reduce managers to ${formState.maxManagers} or fewer before changing this setting.`);
      return;
    }
    const update = {
      name: formState.name,
      draftType: formState.draftType,
      maxManagers: formState.maxManagers,
      scoringType: leagueData.scoringType
    };

    if (formState.draftType === "live") {
      update.draftDate = new Date(formState.draftDate);
      update.timePerPick = Number(formState.timePerPick);
    } else {
      update.draftDate = null;
      update.timePerPick = null;
    }

    await updateDoc(doc(db, "leagues", leagueId), update);
    window.location.reload();
  };

  // Get tomorrow's date in YYYY-MM-DDTHH:MM format
  const getTomorrowDate = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().slice(0, 16);
  };

  // Get max date (August 20, 2025) in YYYY-MM-DDTHH:MM format
  const getMaxDate = () => {
    const maxDate = new Date('2025-08-20T23:59');
    return maxDate.toISOString().slice(0, 16);
  };

  if (!leagueData) return <div>Loading...</div>;

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
    if (i < 3) return "red";
    if (isPlayoff) return "lightblue";
    return "lightgreen";
  };

  return (
    <div>
      <LeagueNavBar />
      <div style={{ padding: "1rem" }}>
        <h3>League ID: {leagueId}</h3>
        <h2>League Rules</h2>

        {isAdmin ? (
          <div style={{ marginBottom: "1rem" }}>
            <label>
              League Name:
              <input value={formState.name} onChange={(e) => handleInputChange("name", e.target.value)} />
            </label><br />
            <label>
              Draft Type:
              <select value={formState.draftType} onChange={(e) => handleInputChange("draftType", e.target.value)}>
                <option value="simulated">Simulated</option>
                <option value="live">Live</option>
              </select>
            </label><br />
            {formState.draftType === "live" && (
              <>
                <label>
                  Draft Date:
                  <input 
                    type="datetime-local" 
                    value={formState.draftDate} 
                    onChange={(e) => handleInputChange("draftDate", e.target.value)}
                    min={getTomorrowDate()}
                    max={getMaxDate()}
                  />
                </label><br />
                <label>
                  OTC Interval (minutes):
                  <select value={formState.timePerPick} onChange={(e) => handleInputChange("timePerPick", e.target.value)}>
                    <option value={1}>1 minute</option>
                    <option value={2}>2 minutes</option>
                    <option value={5}>5 minutes</option>
                    <option value={10}>10 minutes</option>
                  </select>
                </label><br />
              </>
            )}
            <label>
              Max Managers:
              <select value={formState.maxManagers} onChange={(e) => handleInputChange("maxManagers", parseInt(e.target.value))}>
                {[8, 10, 12].map((num) => (
                  <option key={num} value={num}>{num}</option>
                ))}
              </select>
            </label>
            {error && <p style={{ color: "red" }}>{error}</p>}
            <button onClick={handleConfirmChanges}>Confirm Changes</button>
          </div>
        ) : (
          <>
            <p><strong>League Name:</strong> {leagueData.name}</p>
            <p><strong>Admin:</strong> {adminName || "Unknown"}</p>
            <p><strong>League ID:</strong> {leagueId}</p>
            <p><strong>Draft Type:</strong> {leagueData.draftType}</p>
            {leagueData.draftType === "simulated" && (
              <p><strong>Simulated Draft Runs:</strong> August 19, 2025 at 3:00 PM EST</p>
            )}
            {leagueData.draftType === "live" && (
              <>
                <p><strong>Scheduled Draft:</strong> {leagueData.draftDate?.toDate().toLocaleString()}</p>
                <p><strong>OTC Interval:</strong> {leagueData.timePerPick} minutes</p>
              </>
            )}
          </>
        )}

        <h3>Managers</h3>
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "1.5rem" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #ccc", textAlign: "left" }}>
              <th>Name</th>
              <th>Username</th>
              <th>Team Name</th>
              {isAdmin && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {members.map((m, idx) => (
              <tr key={idx} style={{ borderBottom: "1px solid #eee" }}>
                <td>{m.name}</td>
                <td>{m.username}</td>
                <td>{m.teamName}</td>
                {isAdmin && (
                  <td>
                    <button onClick={() => handleRemoveManager(m.uid, m.name || m.username)}>Remove</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>

        <h3>Season Timeline</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(14, minmax(110px, 1fr))", gap: "6px", textAlign: "center" }}>
          {weeks.map((date, i) => (
            <div key={i} style={{
              border: "1px solid #ccc",
              background: getWeekColor(i),
              padding: "0.5rem",
              fontSize: "0.75rem",
              borderRadius: "4px"
            }}>
              <div style={{ fontWeight: "bold" }}>Week {i + 1}</div>
              <div>{date}</div>
              <div>{getWeekLabel(i)}</div>
              {i === 9 && <div><em>Last week of free agency</em></div>}
              <div>Captain Bonus: {i === 0 ? "No" : "Yes"}</div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: "1rem", fontSize: "0.85rem" }}>
          <p><strong style={{ color: "green" }}>Green</strong> = Game bonuses active</p>
          <p><strong style={{ color: "red" }}>Red</strong> = Game bonuses not active</p>
          <p><strong style={{ color: "lightblue" }}>Blue</strong> = Playoffs or Championship</p>
        </div>
      </div>
    </div>
  );
}

export default LeagueRules;