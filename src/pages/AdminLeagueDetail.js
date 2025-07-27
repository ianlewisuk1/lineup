// AdminLeagueDetail.js
import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  doc,
  getDoc,
  collection,
  getDocs,
  updateDoc,
  deleteDoc,
  arrayRemove,
  arrayUnion,
  setDoc
} from "firebase/firestore";
import { db } from "../firebase/firebase";

function AdminLeagueDetail() {
  const { leagueId } = useParams();
  const [league, setLeague] = useState(null);
  const [members, setMembers] = useState([]);
  const [draftMeta, setDraftMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshFlag, setRefreshFlag] = useState(false);

  useEffect(() => {
    const fetchLeagueAndMembers = async () => {
      try {
        const leagueDoc = await getDoc(doc(db, "leagues", leagueId));
        if (!leagueDoc.exists()) {
          setLeague(null);
          return;
        }

        const leagueData = { id: leagueDoc.id, ...leagueDoc.data() };
        setLeague(leagueData);

        const membersSnap = await getDocs(collection(db, "leagues", leagueId, "members"));
        const membersList = membersSnap.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setMembers(membersList);

        const draftDoc = await getDoc(doc(db, "leagues", leagueId, "meta", "draft"));
        if (draftDoc.exists()) {
          setDraftMeta(draftDoc.data());
        } else {
          setDraftMeta(null);
        }

      } catch (err) {
        console.error("Error fetching league detail:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchLeagueAndMembers();
  }, [leagueId, refreshFlag]);

  const refresh = () => setRefreshFlag(f => !f);

  const handleKick = async (userId) => {
    if (!window.confirm("Kick this user from the league? This cannot be undone.")) return;
    try {
      await deleteDoc(doc(db, "leagues", leagueId, "members", userId));
      await updateDoc(doc(db, "leagues", leagueId), {
        members: arrayRemove(userId)
      });
      refresh();
    } catch (err) {
      console.error("Error kicking user:", err);
    }
  };

  const handlePromote = async (userId) => {
    if (!window.confirm("Promote this user to league admin?")) return;
    try {
      await updateDoc(doc(db, "leagues", leagueId), {
        admin: userId
      });
      refresh();
    } catch (err) {
      console.error("Error promoting user:", err);
    }
  };

  const handleSimulateDraft = async () => {
  try {
    // Step 1: Fetch FBS teams
    const teamsSnap = await getDocs(collection(db, "teams"));
    const allTeams = teamsSnap.docs
      .map(doc => doc.data())
      .filter(team => team.classification === "fbs" && typeof team.school === "string");

    const shuffledTeams = allTeams.map(t => t.school).sort(() => 0.5 - Math.random());

    // Step 2: Assign 7 teams per member
    const draftOrder = members.map(m => m.id);
    const selectedTeams = {};
    const memberUpdates = [];

    draftOrder.forEach((uid, idx) => {
      const picks = shuffledTeams.slice(idx * 7, idx * 7 + 7);
      selectedTeams[uid] = picks;

      const memberRef = doc(db, "leagues", leagueId, "members", uid);
      memberUpdates.push(
        setDoc(memberRef, {
          lineup: {
            drafted: picks,
            starters: picks.slice(0, 5),
            bench: picks.slice(5)
          }
        }, { merge: true }) // ✅ Ensures existing data is preserved
      );
    });

    // Step 3: Write draft metadata
    await setDoc(doc(db, "leagues", leagueId, "meta", "draft"), {
      draftOrder,
      currentPickIndex: draftOrder.length * 7,
      availableTeams: [],
      selectedTeams,
      draftComplete: true
    });

    await updateDoc(doc(db, "leagues", leagueId), {
      draftComplete: true
    });

    await Promise.all(memberUpdates);
    alert("✅ Draft simulated.");
    refresh();
  } catch (err) {
    console.error("Error simulating draft:", err);
    alert("Error: " + err.message);
  }
};



  const handleSeedRemainingUsers = async () => {
    if (!league) return;

    const needed = league.maxManagers - members.length;
    if (needed <= 0) {
      alert("League is already full.");
      return;
    }

    try {
      const usersSnap = await getDocs(collection(db, "users"));
      const currentIds = new Set(members.map(m => m.id));
      const available = usersSnap.docs.filter(doc => !currentIds.has(doc.id));

      if (available.length < needed) {
        alert("Not enough users to fill the league.");
        return;
      }

      const selected = available.sort(() => 0.5 - Math.random()).slice(0, needed);

      const batchAdds = selected.map(async (docSnap) => {
        const data = docSnap.data();
        const uidSuffix = docSnap.id.slice(-4);

        const displayName =
          data.displayName?.trim() ||
          (data.email?.split("@")[0]?.replace(/\W/g, "") || `User${uidSuffix}`);

        const teamName =
          data.teamName?.trim() ||
          `Team ${uidSuffix}`;

        const memberRef = doc(db, "leagues", leagueId, "members", docSnap.id);
        await setDoc(memberRef, {
          displayName,
          email: data.email || "",
          teamName,
          lineup: {
            drafted: [],
            starters: [],
            bench: []
          },
          joinedAt: new Date()
        });

        // ✅ Push UID to top-level members array
        await updateDoc(doc(db, "leagues", leagueId), {
          members: arrayUnion(docSnap.id)
        });
      });

      await Promise.all(batchAdds);
      alert(`Added ${needed} user(s) to the league.`);
      refresh(); // ✅ Trigger re-fetch of league and members

    } catch (err) {
      console.error("Error seeding users:", err);
      alert("Failed to add users: " + err.message);
    }
  };


  const formatList = (arr) => {
    if (!Array.isArray(arr) || arr.length === 0) return "-";
    return arr.join(", ");
  };

  const draftStatus = () => {
    if (!draftMeta) return <span style={{ color: "gray" }}>Not started</span>;
    if (draftMeta.draftComplete) return <span style={{ color: "green" }}>✅ Complete</span>;
    return <span style={{ color: "orange" }}>🕐 In Progress</span>;
  };

  if (loading) return <p>Loading league data...</p>;
  if (!league) return <p>League not found.</p>;

  return (
    <div style={{ padding: "2rem" }}>
      <h2>Admin View: {league.name}</h2>
      <p><strong>League ID:</strong> {league.id}</p>
      <p><strong>Admin UID:</strong> {league.admin}</p>
      <p><strong>Created By:</strong> {league.createdBy}</p>
      <p><strong>Scoring Type:</strong> {league.scoringType}</p>
      <p><strong>Max Managers:</strong> {league.maxManagers}</p>
      <p><strong>Members:</strong> {league.members?.length || 0}</p>
      <p><strong>Draft Status:</strong> {draftStatus()}</p>
      <p><strong>Created At:</strong> {league.createdAt?.toDate().toLocaleString()}</p>

      <div style={{ marginTop: "1rem" }}>
        <button onClick={handleSeedRemainingUsers}>
          Seed Remaining Users
        </button>

        <button onClick={handleSimulateDraft} style={{ marginLeft: "1rem" }}>
          Simulate Draft
        </button>
      </div>

      <h3 style={{ marginTop: "2rem" }}>League Members</h3>
      {members.length === 0 ? (
        <p>No members in this league.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "1rem", fontSize: "0.9rem" }}>
          <thead>
            <tr style={{ backgroundColor: "#f5f5f5" }}>
              <th style={th}>UID</th>
              <th style={th}>Display Name</th>
              <th style={th}>Team Name</th>
              <th style={th}>Email</th>
              <th style={th}>Starters</th>
              <th style={th}>Bench</th>
              <th style={th}>Drafted</th>
              <th style={th}>Joined</th>
              <th style={th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m, idx) => (
              <tr key={m.id} style={{ backgroundColor: idx % 2 === 0 ? "#fafafa" : "white" }}>
                <td style={td}>{m.id}</td>
                <td style={td}>{m.displayName}</td>
                <td style={td}>{m.teamName}</td>
                <td style={td}>{m.email}</td>
                <td style={td}>{formatList(m.lineup?.starters)}</td>
                <td style={td}>{formatList(m.lineup?.bench)}</td>
                <td style={td}>{formatList(m.lineup?.drafted)}</td>
                <td style={td}>
                  {m.joinedAt?.toDate().toLocaleString() || "-"}
                </td>
                <td style={td}>
                  {m.id !== league.admin ? (
                    <>
                      <button onClick={() => handleKick(m.id)} style={{ marginRight: "0.5rem", color: "red" }}>
                        Kick
                      </button>
                      <button onClick={() => handlePromote(m.id)}>
                        Promote
                      </button>
                    </>
                  ) : (
                    <em>Admin</em>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

const th = {
  padding: "8px",
  borderBottom: "1px solid #ccc",
  textAlign: "left"
};

const td = {
  padding: "8px",
  borderBottom: "1px solid #eee",
  verticalAlign: "top",
  fontFamily: "monospace"
};

export default AdminLeagueDetail;
