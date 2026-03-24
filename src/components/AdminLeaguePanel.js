import React, { useEffect, useState } from "react";
import { supabase } from "../supabase/supabase";
import { Link } from "react-router-dom";

const LEAGUES_PER_PAGE = 25;

function AdminLeaguePanel() {
  const [leagues, setLeagues] = useState([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [searchField, setSearchField] = useState("name");
  const [searchInput, setSearchInput] = useState("");
  const [deletingAll, setDeletingAll] = useState(false);

  const formatTimestamp = (ts) => {
    if (!ts) return "-";
    try {
      return new Date(ts).toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      });
    } catch {
      return "-";
    }
  };

  const fetchLeagues = async (pageNum = 0) => {
    const trimmed = searchInput.trim();
    const from = pageNum * LEAGUES_PER_PAGE;
    const to = from + LEAGUES_PER_PAGE - 1;

    let query = supabase.from("leagues").select("*");

    if (trimmed) {
      query = query.ilike(searchField, `${trimmed}%`).order(searchField);
    } else {
      query = query.order("name");
    }

    query = query.range(from, to);

    const { data } = await query;

    // Fetch member counts via league_members
    const leagueIds = (data || []).map(l => l.id);
    let memberCounts = {};
    if (leagueIds.length > 0) {
      const { data: memberData } = await supabase
        .from("league_members")
        .select("league_id")
        .in("league_id", leagueIds);
      (memberData || []).forEach(m => {
        memberCounts[m.league_id] = (memberCounts[m.league_id] || 0) + 1;
      });
    }

    const docs = (data || []).map(l => ({
      ...l,
      memberCount: memberCounts[l.id] || 0
    }));

    setLeagues(docs);
    setHasMore(docs.length === LEAGUES_PER_PAGE);
    setPage(pageNum);
  };

  useEffect(() => {
    fetchLeagues();
  }, []);

  const handleSearch = async (e) => {
    e.preventDefault();
    await fetchLeagues(0);
  };

  const deleteLeague = async (leagueId) => {
    if (!window.confirm(`Delete league ${leagueId}? This cannot be undone.`)) return;

    await supabase.from("league_members").delete().eq("league_id", leagueId);
    await supabase.from("drafts").delete().eq("league_id", leagueId);
    await supabase.from("leagues").delete().eq("id", leagueId);
    setLeagues(prev => prev.filter(l => l.id !== leagueId));
  };

  const deleteAllLeagues = async () => {
    if (!window.confirm("⚠️ This will permanently delete ALL leagues and their members/draft data. Users will NOT be deleted.\n\nProceed?")) return;

    setDeletingAll(true);

    const { data: leaguesData } = await supabase.from("leagues").select("id");

    for (const league of (leaguesData || [])) {
      const leagueId = league.id;
      await supabase.from("league_members").delete().eq("league_id", leagueId);
      await supabase.from("drafts").delete().eq("league_id", leagueId);
      await supabase.from("leagues").delete().eq("id", leagueId);
    }

    setDeletingAll(false);
    fetchLeagues(0);
  };

  const generateSmackTalk = () => {
    const smackTalkOptions = [
      "Prepare to get destroyed!",
      "This is my year!",
      "You're all going down!",
      "Championship bound!",
      "Ready to dominate!",
      "Time to show who's boss!",
      "Victory is mine!",
      "Bring on the competition!",
      "Let's gooooo!",
      "No mercy this season!",
      "Draft day champion!",
      "Fantasy football legend in the making!",
      "",
      "",
      "" // Some empty ones for variety
    ];
    return smackTalkOptions[Math.floor(Math.random() * smackTalkOptions.length)];
  };

  const seedLeagues = async () => {
    const confirm = window.confirm("Seed 10 test leagues into the database using real users as admins?");
    if (!confirm) return;

    const { data: usersData } = await supabase.from("users").select("*");
    const userDocs = (usersData || []).filter(u => !u.is_admin);
    if (userDocs.length < 10) {
      alert("❌ Not enough non-admin users to assign 10 league admins.");
      return;
    }

    const leagueNames = Array.from({ length: 10 }, (_, i) => `Test League ${i + 1}`);
    const maxOptions = [8, 10, 12];
    const draftTypes = ["manual", "live"];
    const draftOrderTypes = ["random", "admin"];

    for (let i = 0; i < 10; i++) {
      const userDoc = userDocs[i];
      const userId = userDoc.id;
      const userData = userDoc;

      const selectedDraftType = draftTypes[Math.floor(Math.random() * draftTypes.length)];
      const selectedDraftOrderType = draftOrderTypes[Math.floor(Math.random() * draftOrderTypes.length)];
      const maxManagers = maxOptions[Math.floor(Math.random() * maxOptions.length)];

      // Build league data
      const leagueData = {
        name: leagueNames[i],
        created_by: userId,
        admin_id: userId,
        max_managers: maxManagers,
        draft_complete: false,
        draft_type: selectedDraftType,
        draft_order_type: selectedDraftOrderType,
        scoring_type: "cumulative"
      };

      // Add live draft specific fields if needed
      if (selectedDraftType === "live") {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const maxDate = new Date('2025-08-20');
        const randomTime = tomorrow.getTime() + Math.random() * (maxDate.getTime() - tomorrow.getTime());
        const randomDate = new Date(randomTime);

        leagueData.draft_date = randomDate.toISOString();
        leagueData.time_per_pick = [1, 2, 5, 10][Math.floor(Math.random() * 4)];
      }

      // Create the league
      const { data: newLeague } = await supabase.from("leagues").insert(leagueData).select().single();

      if (newLeague) {
        // Create member document
        await supabase.from("league_members").insert({
          league_id: newLeague.id,
          user_id: userId,
          points: 0,
          smack_talk: generateSmackTalk(),
          team_name: `${userData.first_name || 'Test'}'s ${['Warriors', 'Dragons', 'Eagles', 'Lions', 'Tigers', 'Sharks', 'Thunder', 'Lightning', 'Storm', 'Blaze'][Math.floor(Math.random() * 10)]}`,
        });
      }
    }

    alert("✅ 10 leagues seeded with real users as admins, with proper member document structure.");
    fetchLeagues(0);
  };

  const exportToCSV = () => {
    const headers = ["ID", "League Name", "Admin UID", "Created By", "Max Managers", "Member Count"];
    const rows = leagues.map(l => [
      l.id,
      l.name || "",
      l.admin_id || "",
      l.created_by || "",
      l.max_managers || "",
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
          <option value="created_by">Created By UID</option>
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
                title={l.admin_id || "-"}
                style={{
                  maxWidth: "160px",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis"
                }}
              >
                {l.admin_id || "-"}
              </td>
              <td
                title={l.created_by || "-"}
                style={{
                  maxWidth: "160px",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis"
                }}
              >
                {l.created_by || "-"}
              </td>
              <td style={{ textAlign: "center" }}>{l.max_managers || "-"}</td>
              <td style={{ textAlign: "center" }}>{l.memberCount}</td>
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
          onClick={() => fetchLeagues(page - 1)}
          disabled={page === 0}
        >
          ← Previous
        </button>
        <button
          onClick={() => fetchLeagues(page + 1)}
          disabled={!hasMore || leagues.length < LEAGUES_PER_PAGE}
          style={{ marginLeft: "1rem" }}
        >
          Next →
        </button>
      </div>
    </div>
  );
}

export default AdminLeaguePanel;
