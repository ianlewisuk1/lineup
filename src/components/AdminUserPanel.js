import React, { useEffect, useState } from "react";
import { supabase } from "../supabase/supabase";
import { v4 as uuidv4 } from "uuid";

const USERS_PER_PAGE = 25;

function AdminUserPanel() {
  const [users, setUsers] = useState([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [searchField, setSearchField] = useState("email");
  const [searchInput, setSearchInput] = useState("");
  const [leagueAdminMap, setLeagueAdminMap] = useState({});
  const [deletingAll, setDeletingAll] = useState(false);
  const [deletingNonLeague, setDeletingNonLeague] = useState(false);

  const fetchUsers = async (pageNum = 0) => {
    const trimmed = searchInput.trim();
    const from = pageNum * USERS_PER_PAGE;
    const to = from + USERS_PER_PAGE - 1;

    let query = supabase.from("users").select("*");

    if (trimmed) {
      query = query.ilike(searchField, `${trimmed}%`);
    } else {
      query = query.order("email");
    }

    query = query.range(from, to);

    const { data } = await query;
    const docs = (data || []).map(u => ({ uid: u.id, ...u }));

    setUsers(docs);
    setHasMore(docs.length === USERS_PER_PAGE);
    setPage(pageNum);
  };

  const fetchLeagueAdmins = async () => {
    const { data } = await supabase.from("leagues").select("*");
    const adminMap = {};

    (data || []).forEach(league => {
      const adminUid = league.admin_id;
      const leagueName = league.name || league.id;
      if (adminUid) {
        if (!adminMap[adminUid]) {
          adminMap[adminUid] = [];
        }
        adminMap[adminUid].push(leagueName);
      }
    });

    setLeagueAdminMap(adminMap);
  };

  useEffect(() => {
    fetchUsers();
    fetchLeagueAdmins();
  }, []);

  const handleSearch = async (e) => {
    e.preventDefault();
    await fetchUsers(0);
  };

  const deleteUser = async (uid, userEmail) => {
    if (!window.confirm("Are you sure you want to delete this user?")) return;

    try {
      // Delete the user document
      await supabase.from("users").delete().eq("id", uid);

      // Update local state
      setUsers(prev => prev.filter(user => user.uid !== uid));

      // Inform admin about manual auth cleanup if needed
      alert(`✅ User document deleted for ${userEmail}

📝 Note: If you want to prevent them from logging in completely:
1. Go to Supabase Console → Authentication → Users
2. Find and delete: ${userEmail}

Without their user record, they can't use the app anyway.`);

      console.log(`User document deleted for UID: ${uid}`);

    } catch (error) {
      console.error("Error deleting user:", error);
      alert("Error deleting user. Please try again.");
    }
  };

  const deleteAllNonAdminUsers = async () => {
    const confirm = window.confirm(
      "⚠️ This will delete ALL user documents for users who are NOT site admins. This cannot be undone.\n\nAre you sure?"
    );
    if (!confirm) return;

    setDeletingAll(true);

    try {
      const { data } = await supabase.from("users").select("*");
      const nonAdminUsers = (data || []).filter(u => !u.is_admin);

      let deletedCount = 0;
      for (const userDoc of nonAdminUsers) {
        try {
          await supabase.from("users").delete().eq("id", userDoc.id);
          deletedCount++;
        } catch (error) {
          console.error(`Error deleting user ${userDoc.id}:`, error);
        }
      }

      alert(`✅ Deleted ${deletedCount} non-admin user documents.

📝 Note: Auth accounts still exist. To prevent login:
Go to Supabase Console → Authentication → Users and delete manually if needed.`);

    } catch (error) {
      console.error("Error in bulk delete:", error);
      alert("Error during bulk delete. Please check console.");
    }

    setDeletingAll(false);
    fetchUsers(0);
  };

  const deleteUsersNotInLeagues = async () => {
    const confirm = window.confirm(
      "⚠️ This will delete ALL users who are not members of any league (have empty leagueIds). This cannot be undone.\n\nAre you sure?"
    );
    if (!confirm) return;

    setDeletingNonLeague(true);

    try {
      const { data } = await supabase.from("users").select("*");
      // Get all league member user_ids
      const { data: memberData } = await supabase.from("league_members").select("user_id");
      const memberIds = new Set((memberData || []).map(m => m.user_id));

      const usersNotInLeagues = (data || []).filter(u => {
        // Don't delete site admins
        if (u.is_admin) return false;
        // Delete if not in any league
        return !memberIds.has(u.id);
      });

      let deletedCount = 0;
      for (const userDoc of usersNotInLeagues) {
        try {
          await supabase.from("users").delete().eq("id", userDoc.id);
          deletedCount++;
        } catch (error) {
          console.error(`Error deleting user ${userDoc.id}:`, error);
        }
      }

      alert(`✅ Deleted ${deletedCount} users who were not in any leagues.`);

    } catch (error) {
      console.error("Error in bulk delete:", error);
      alert("Error during bulk delete. Please check console.");
    }

    setDeletingNonLeague(false);
    fetchUsers(0);
  };

  const seedUsers = async (count) => {
    const confirm = window.confirm(`Seed ${count} fake users into the database?`);
    if (!confirm) return;

    const firstNames = [
      "Tom", "John", "Sarah", "Alice", "Bob", "Emily", "Michael", "Emma",
      "Liam", "Olivia", "David", "Chloe", "Mark", "Sophia", "Jake", "Ava",
      "Noah", "Isabella", "William", "Mia", "James", "Charlotte", "Benjamin", "Harper"
    ];
    const lastNames = [
      "Smith", "Johnson", "Brown", "Lee", "Wilson", "Taylor", "Clark", "Hall",
      "Lewis", "Young", "Allen", "King", "Wright", "Scott", "Green", "Baker",
      "Nelson", "Carter", "Mitchell", "Perez", "Roberts", "Turner", "Phillips", "Campbell"
    ];

    const randomDate = () => {
      const start = new Date(1975, 0, 1);
      const end = new Date(2000, 0, 1);
      const date = new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
      return date.toISOString().split("T")[0]; // Format as YYYY-MM-DD
    };

    for (let i = 0; i < count; i++) {
      const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
      const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
      const uid = uuidv4();

      const userDoc = {
        id: uid,
        email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}${Math.floor(Math.random() * 1000)}@example.com`,
        first_name: firstName,
        last_name: lastName,
        is_admin: false
      };

      await supabase.from("users").upsert(userDoc);
    }

    alert(`✅ ${count} users seeded!`);
    fetchUsers(0);
  };

  const exportToCSV = () => {
    const headers = ["UID", "Email", "First Name", "Last Name", "isAdmin", "League Admin Of"];
    const rows = users.map(user => [
      user.uid,
      user.email || "",
      user.first_name || "",
      user.last_name || "",
      user.is_admin ? "Yes" : "No",
      (leagueAdminMap[user.uid] || []).join("; ")
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers, ...rows].map(e => e.join(",")).join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "users_export.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div>
      <h2>User Management</h2>

      <form onSubmit={handleSearch} style={{ marginBottom: "1rem" }}>
        <label style={{ marginRight: "0.5rem" }}>Search Field:</label>
        <select
          value={searchField}
          onChange={(e) => setSearchField(e.target.value)}
        >
          <option value="email">Email</option>
          <option value="first_name">First Name</option>
          <option value="last_name">Last Name</option>
        </select>

        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder={`Search by ${searchField}`}
          style={{ marginLeft: "0.5rem" }}
        />
        <button type="submit" style={{ marginLeft: "0.5rem" }}>Search</button>
        <button
          type="button"
          onClick={exportToCSV}
          style={{ marginLeft: "1rem" }}
        >
          Export to CSV
        </button>
      </form>

      {/* Destructive Actions */}
      <div style={{ marginBottom: "1rem", padding: "1rem", backgroundColor: "#ffebee", border: "1px solid #ffcdd2" }}>
        <h4 style={{ margin: "0 0 0.5rem 0", color: "#c62828" }}>⚠️ Destructive Actions</h4>
        <button
          type="button"
          onClick={deleteAllNonAdminUsers}
          style={{ marginRight: "0.5rem", color: "red" }}
          disabled={deletingAll}
        >
          {deletingAll ? "Deleting..." : "Delete All Non-Admin Users"}
        </button>
        <button
          type="button"
          onClick={deleteUsersNotInLeagues}
          style={{ color: "red" }}
          disabled={deletingNonLeague}
        >
          {deletingNonLeague ? "Deleting..." : "Delete Users Not in Leagues"}
        </button>
      </div>

      {/* Seed Actions */}
      <div style={{ marginBottom: "1rem", padding: "1rem", backgroundColor: "#e8f5e8", border: "1px solid #c8e6c9" }}>
        <h4 style={{ margin: "0 0 0.5rem 0", color: "#2e7d32" }}>🌱 Seed Test Data</h4>
        <button
          type="button"
          onClick={() => seedUsers(10)}
          style={{ marginRight: "0.5rem", backgroundColor: "#e0f7fa" }}
        >
          Seed 10 Users
        </button>
        <button
          type="button"
          onClick={() => seedUsers(50)}
          style={{ marginRight: "0.5rem", backgroundColor: "#e0f7fa" }}
        >
          Seed 50 Users
        </button>
        <button
          type="button"
          onClick={() => seedUsers(250)}
          style={{ backgroundColor: "#e0f7fa" }}
        >
          Seed 250 Users
        </button>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th>UID</th>
            <th>Email</th>
            <th>First</th>
            <th>Last</th>
            <th>Admin?</th>
            <th>League Admin Of</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map(user => (
            <tr key={user.uid} style={{ borderBottom: "1px solid #ccc" }}>
              <td style={{ fontSize: "0.8rem" }}>{user.uid}</td>
              <td>{user.email || "N/A"}</td>
              <td>{user.first_name || "-"}</td>
              <td>{user.last_name || "-"}</td>
              <td>{user.is_admin ? "✅" : "❌"}</td>
              <td>
                {leagueAdminMap[user.uid]?.length > 0
                  ? leagueAdminMap[user.uid].join(", ")
                  : "-"}
              </td>
              <td>
                <button
                  onClick={() => deleteUser(user.uid, user.email)}
                  style={{ color: "red" }}
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ marginTop: "1rem" }}>
        <button
          onClick={() => fetchUsers(page - 1)}
          disabled={page === 0}
        >
          ← Previous
        </button>
        <button
          onClick={() => fetchUsers(page + 1)}
          disabled={!hasMore || users.length < USERS_PER_PAGE}
          style={{ marginLeft: "1rem" }}
        >
          Next →
        </button>
      </div>
    </div>
  );
}

export default AdminUserPanel;
