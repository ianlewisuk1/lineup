import React, { useEffect, useState } from "react";
import {
  collection,
  query,
  orderBy,
  where,
  limit,
  startAfter,
  getDocs,
  deleteDoc,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  arrayUnion
} from "firebase/firestore";
import { Link } from "react-router-dom";
import { db } from "../firebase/firebase";

const LEAGUES_PER_PAGE = 25;

function AdminLeaguePanel() {
  const [leagues, setLeagues] = useState([]);
  const [lastDoc, setLastDoc] = useState(null);
  const [pageStack, setPageStack] = useState([]);
  const [searchField, setSearchField] = useState("name");
  const [searchInput, setSearchInput] = useState("");
  const [deletingAll, setDeletingAll] = useState(false);

  const formatTimestamp = (ts) => {
    if (!ts || !ts.toDate) return "-";
    return ts.toDate().toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  const fetchLeagues = async (direction = "initial") => {
    let q;
    const trimmed = searchInput.trim();

    const base = collection(db, "leagues");

    if (trimmed) {
      q = query(
        base,
        orderBy(searchField),
        where(searchField, ">=", trimmed),
        where(searchField, "<=", trimmed + "\uf8ff"),
        limit(LEAGUES_PER_PAGE)
      );
    } else {
      q = query(base, orderBy("name"), limit(LEAGUES_PER_PAGE));

      if (direction === "next" && lastDoc) {
        q = query(q, startAfter(lastDoc));
      } else if (direction === "prev" && pageStack.length > 1) {
        const prev = pageStack[pageStack.length - 2];
        q = query(q, startAfter(prev));
        setPageStack(stack => stack.slice(0, -1));
      }
    }

    const snap = await getDocs(q);

    const docs = snap.docs.map(docRef => {
      const data = docRef.data();
      const memberCount = Array.isArray(data.members) ? data.members.length : 0;

      return {
        id: docRef.id,
        ...data,
        memberCount
      };
    });

    setLeagues(docs);
    setLastDoc(snap.docs[snap.docs.length - 1] || null);
    if (!trimmed && direction !== "prev") {
      setPageStack(prev => [...prev, snap.docs[0]]);
    }
  };

  useEffect(() => {
    fetchLeagues();
  }, []);

  const handleSearch = async (e) => {
    e.preventDefault();
    setPageStack([]);
    await fetchLeagues("initial");
  };

  const deleteLeague = async (leagueId) => {
    if (!window.confirm(`Delete league ${leagueId}? This cannot be undone.`)) return;

    const membersSnap = await getDocs(collection(db, "leagues", leagueId, "members"));
    for (const docRef of membersSnap.docs) {
      await deleteDoc(doc(db, "leagues", leagueId, "members", docRef.id));
    }

    const draftSnap = await getDocs(collection(db, "leagues", leagueId, "draft"));
    for (const docRef of draftSnap.docs) {
      await deleteDoc(doc(db, "leagues", leagueId, "draft", docRef.id));
    }

    await deleteDoc(doc(db, "leagues", leagueId));
    setLeagues(prev => prev.filter(l => l.id !== leagueId));
  };

  const deleteAllLeagues = async () => {
    if (!window.confirm("⚠️ This will permanently delete ALL leagues and their members/draft/meta data. Users will NOT be deleted.\n\nProceed?")) return;

    setDeletingAll(true);

    const leaguesSnap = await getDocs(collection(db, "leagues"));

    for (const league of leaguesSnap.docs) {
      const leagueId = league.id;

      const membersSnap = await getDocs(collection(db, "leagues", leagueId, "members"));
      for (const docRef of membersSnap.docs) {
        await deleteDoc(doc(db, "leagues", leagueId, "members", docRef.id));
      }

      const draftSnap = await getDocs(collection(db, "leagues", leagueId, "draft"));
      for (const docRef of draftSnap.docs) {
        await deleteDoc(doc(db, "leagues", leagueId, "draft", docRef.id));
      }

      const metaSnap = await getDocs(collection(db, "leagues", leagueId, "meta"));
      for (const docRef of metaSnap.docs) {
        await deleteDoc(doc(db, "leagues", leagueId, "meta", docRef.id));
      }

      await deleteDoc(doc(db, "leagues", leagueId));
    }

    setDeletingAll(false);
    fetchLeagues();
  };


  const seedLeagues = async () => {
    const confirm = window.confirm("Seed 10 test leagues into Firestore using real users as admins?");
    if (!confirm) return;

    const usersSnap = await getDocs(collection(db, "users"));
    const userDocs = usersSnap.docs.filter(doc => !doc.data()?.isAdmin);
    if (userDocs.length < 10) {
      alert("❌ Not enough non-admin users to assign 10 league admins.");
      return;
    }

    const leagueNames = Array.from({ length: 10 }, (_, i) => `Test League ${i + 1}`);
    const scoringTypes = ["head_to_head", "cumulative"];
    const maxOptions = [8, 10, 12];

    for (let i = 0; i < 10; i++) {
      const userDoc = userDocs[i];
      const userId = userDoc.id;
      const userData = userDoc.data();

      const leagueData = {
        name: leagueNames[i],
        scoringType: scoringTypes[Math.floor(Math.random() * scoringTypes.length)],
        members: [userId],
        createdAt: new Date(),
        createdBy: userId,
        admin: userId,
        maxManagers: maxOptions[Math.floor(Math.random() * maxOptions.length)],
        draftComplete: false
      };

      const leagueRef = await addDoc(collection(db, "leagues"), leagueData);

      await updateDoc(doc(db, "users", userId), {
        leagueIds: arrayUnion(leagueRef.id)
      });

      await setDoc(doc(db, "leagues", leagueRef.id, "members", userId), {
        displayName: `${userData.firstName}Bot`,
        teamName: `${userData.lastName} FC`,
        email: userData.email || "",
        lineup: {
          starters: [],
          bench: [],
          drafted: []
        },
        joinedAt: new Date()
      });
    }

    alert("✅ 10 leagues seeded with real users as admins.");
    fetchLeagues();
  };

  const exportToCSV = () => {
    const headers = ["ID", "League Name", "Admin UID", "Created By", "Max Managers", "Created At", "Member Count"];
    const rows = leagues.map(l => [
      l.id,
      l.name || "",
      l.admin || "",
      l.createdBy || "",
      l.maxManagers || "",
      formatTimestamp(l.createdAt),
      l.memberCount
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers, ...rows].map(e => e.join(",")).join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "leagues_export.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div style={{ marginTop: "3rem" }}>
      <h2>League Management</h2>

      <form onSubmit={handleSearch} style={{ marginBottom: "1rem", fontSize: "0.9rem" }}>
        <select value={searchField} onChange={(e) => setSearchField(e.target.value)}>
          <option value="name">League Name</option>
          <option value="createdBy">Created By UID</option>
        </select>
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder={`Search by ${searchField}`}
          style={{ marginLeft: "0.5rem" }}
        />
        <button type="submit" style={{ marginLeft: "0.5rem" }}>Search</button>
        <button type="button" onClick={exportToCSV} style={{ marginLeft: "1rem" }}>
          Export to CSV
        </button>
        <button
          type="button"
          onClick={deleteAllLeagues}
          style={{ marginLeft: "1rem", color: "red" }}
          disabled={deletingAll}
        >
          {deletingAll ? "Deleting..." : "Delete All Leagues"}
        </button>
        <button
          type="button"
          onClick={seedLeagues}
          style={{ marginLeft: "1rem", backgroundColor: "#e0f7fa" }}
        >
          Seed 10 Leagues
        </button>
      </form>

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
        <thead>
          <tr style={{ backgroundColor: "#f0f0f0" }}>
            <th>ID</th>
            <th>League Name</th>
            <th>Admin UID</th>
            <th>Created By</th>
            <th>Managers</th>
            <th>Members</th>
            <th>Created At</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {leagues.map((l, index) => (
            <tr
              key={l.id}
              style={{
                borderBottom: "1px solid #ccc",
                backgroundColor: index % 2 === 0 ? "#fafafa" : "white"
              }}
            >
              <td
                title={l.id}
                style={{
                  maxWidth: "160px",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  fontFamily: "monospace"
                }}
              >
                {l.id}
              </td>
              <td title={l.name}>
                <Link to={`/admin/league/${l.id}`} style={{ textDecoration: "underline", color: "#0077cc" }}>
                  {l.name || "-"}
                </Link>
              </td>
              <td
                title={l.admin || "-"}
                style={{
                  maxWidth: "160px",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis"
                }}
              >
                {l.admin || "-"}
              </td>
              <td
                title={l.createdBy || "-"}
                style={{
                  maxWidth: "160px",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis"
                }}
              >
                {l.createdBy || "-"}
              </td>
              <td style={{ textAlign: "center" }}>{l.maxManagers || "-"}</td>
              <td style={{ textAlign: "center" }}>{l.memberCount}</td>
              <td>{formatTimestamp(l.createdAt)}</td>
              <td>
                <button onClick={() => deleteLeague(l.id)} style={{ color: "red" }}>
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ marginTop: "1rem" }}>
        <button
          onClick={() => fetchLeagues("prev")}
          disabled={pageStack.length <= 1}
        >
          ← Previous
        </button>
        <button
          onClick={() => fetchLeagues("next")}
          disabled={!lastDoc || leagues.length < LEAGUES_PER_PAGE}
          style={{ marginLeft: "1rem" }}
        >
          Next →
        </button>
      </div>
    </div>
  );
}

export default AdminLeaguePanel;
