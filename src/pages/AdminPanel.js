import React, { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "../supabase/supabase";
import AdminUserPanel from "../components/AdminUserPanel";
import AdminLeaguePanel from "../components/AdminLeaguePanel";
import { useSeasonConfig } from "../hooks/useSeasonConfig";

// Week 0 is the late-August opening weekend. Those games are ingested and
// displayed like any other, but they do not score — see WEEK_ZERO in
// backend/scoring.js. It exists so the live pipeline gets a real dress
// rehearsal before week 1 counts.
const WEEK_OPTIONS = [
  "Preseason",
  "0",
  ...Array.from({ length: 15 }, (_, i) => String(i + 1)),
  "Bowl Season",
  "Playoffs",
  "Off-Season",
];

function SeasonControls() {
  const { config: seasonConfig } = useSeasonConfig();
  const [currentWeek, setCurrentWeek] = useState("Preseason");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Populate dropdown once config loads
  useEffect(() => {
    if (seasonConfig?.currentWeek) setCurrentWeek(String(seasonConfig.currentWeek));
  }, [seasonConfig]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    const { error } = await supabase.from("config").upsert({
      key: "season",
      value: { currentWeek, year: 2026 },
    });
    setSaving(false);
    if (!error) setSaved(true);
  };

  return (
    <div style={{ marginBottom: "2rem", padding: "1rem", border: "1px solid #ddd", borderRadius: "8px" }}>
      <h3>Season Controls</h3>
      <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginTop: "0.5rem" }}>
        <label htmlFor="week-select"><strong>Current Week:</strong></label>
        <select
          id="week-select"
          value={currentWeek}
          onChange={(e) => { setCurrentWeek(e.target.value); setSaved(false); }}
          style={{ padding: "0.4rem 0.8rem", fontSize: "1rem" }}
        >
          {WEEK_OPTIONS.map((w) => (
            <option key={w} value={w}>{w}</option>
          ))}
        </select>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{ padding: "0.4rem 1rem", cursor: "pointer" }}
        >
          {saving ? "Saving..." : "Save"}
        </button>
        {saved && <span style={{ color: "green" }}>Saved!</span>}
      </div>
    </div>
  );
}

function AdminPanel() {
 const [loading, setLoading] = useState(true);
 const navigate = useNavigate();

 useEffect(() => {
   const fetchData = async () => {
     const { data: { user } } = await supabase.auth.getUser();
     if (!user) {
       return navigate("/login");
     }

     const { data: userData } = await supabase.from("users").select("*").eq("id", user.id).single();

     if (!userData || !userData.is_admin) {
       console.log("Unauthorized access attempt.");
       return navigate("/");
     }

     setLoading(false);
   };

   fetchData();
 }, [navigate]);

 if (loading) return <p>Loading admin panel...</p>;

 return (
   <div style={{ backgroundColor: "white", minHeight: "100vh" }}>
     <div style={{ padding: "1rem", borderBottom: "1px solid #ddd" }}>
       <h2>Admin Panel</h2>
       <nav style={{ marginTop: "0.5rem" }}>
         <Link to="/" style={{ marginRight: "1rem", color: "#007bff", textDecoration: "none" }}>
           ← Back to Home
         </Link>
         <Link to="/logout" style={{ color: "#007bff", textDecoration: "none" }}>
           Logout
         </Link>
       </nav>
     </div>

     <div style={{ padding: "1rem" }}>
       <div style={{ marginBottom: "1rem" }}>
         <Link to="/admin/teams" style={{ marginRight: "1rem" }}>
           🛠 Manage Teams
         </Link>
         <Link to="/admin/schedule">
           📅 Manage Schedule
         </Link>
       </div>

       <SeasonControls />
       <AdminUserPanel />
       <AdminLeaguePanel />
     </div>
   </div>
 );
}

export default AdminPanel;
