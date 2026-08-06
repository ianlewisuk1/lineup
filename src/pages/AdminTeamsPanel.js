import React, { useEffect, useState } from "react";
import { supabase } from "../supabase/supabase";
import { SEASON_YEAR } from "../utils/season";
import { normalizeTeamName } from "../utils/teamName";

function AdminTeamsPanel() {
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortConfig, setSortConfig] = useState({ key: "school", direction: "asc" });
  const [conferenceFilter, setConferenceFilter] = useState("");
  const [newTeam, setNewTeam] = useState({ school: "", conference: "" });

  useEffect(() => {
    const fetchData = async () => {
      const [{ data: teamsData }, { data: preseasonData }] = await Promise.all([
        supabase.from("teams").select("id, school, conference, classification"),
        supabase.from("team_preseason_stats").select("*").eq("season_year", SEASON_YEAR),
      ]);

      const preseasonMap = {};
      (preseasonData || []).forEach(r => { preseasonMap[r.team_id] = r; });

      const merged = (teamsData || [])
        .filter(t => (t.classification || "").toLowerCase() === "fbs")
        .map(t => ({
          id:               t.id,
          school:           t.school,
          conference:       t.conference,
          conf_odds:        preseasonMap[t.id]?.conf_odds        ?? null,
          phil_metric_rank: preseasonMap[t.id]?.phil_metric_rank ?? null,
          power_rank:       preseasonMap[t.id]?.power_rank       ?? null,
          ret_starters:     preseasonMap[t.id]?.ret_starters     ?? null,
          predicted_wins:   preseasonMap[t.id]?.predicted_wins   ?? null,
          prev_year_record: preseasonMap[t.id]?.prev_year_record ?? "",
          prev_year_ats:    preseasonMap[t.id]?.prev_year_ats    ?? "",
          prev_year_points: preseasonMap[t.id]?.prev_year_points ?? null,
        }));

      setTeams(merged);
      setLoading(false);
    };
    fetchData();
  }, []);

  const handleUpdate = async (teamId, field, value) => {
    await supabase.from("team_preseason_stats").upsert(
      { team_id: teamId, season_year: SEASON_YEAR, [field]: value === "" ? null : value },
      { onConflict: "team_id,season_year" }
    );
    setTeams(prev =>
      prev.map(t => t.id === teamId ? { ...t, [field]: value } : t)
    );
  };

  const handleAddTeam = async () => {
    if (!newTeam.school) return;
    // teams.id must be the canonical slug — it is the join key for rosters and logos
    const id = normalizeTeamName(newTeam.school);
    await supabase.from("teams").upsert({ id, school: newTeam.school, conference: newTeam.conference, classification: "FBS" });
    setTeams(prev => [...prev, { id, ...newTeam, conf_odds: null, phil_metric_rank: null, power_rank: null, ret_starters: null, predicted_wins: null, prev_year_record: "", prev_year_ats: "", prev_year_points: null }]);
    setNewTeam({ school: "", conference: "" });
  };

  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc",
    }));
  };

  const sortedTeams = [...teams].sort((a, b) => {
    const aVal = a[sortConfig.key] ?? "";
    const bVal = b[sortConfig.key] ?? "";
    if (typeof aVal === "number" && typeof bVal === "number") {
      return sortConfig.direction === "asc" ? aVal - bVal : bVal - aVal;
    }
    return sortConfig.direction === "asc"
      ? String(aVal).localeCompare(String(bVal))
      : String(bVal).localeCompare(String(aVal));
  });

  const filteredTeams = sortedTeams.filter(t =>
    conferenceFilter === "" ||
    t.conference?.toLowerCase().includes(conferenceFilter.toLowerCase())
  );

  const exportToCSV = () => {
    const headers = ["school", "conference", "conf_odds", "phil_metric_rank", "power_rank", "ret_starters", "predicted_wins", "prev_year_record", "prev_year_ats", "prev_year_points"];
    const rows = filteredTeams.map(team => headers.map(h => team[h] ?? "").join(","));
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `preseason-${SEASON_YEAR}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) return <p>Loading teams...</p>;

  const numericFields = ["conf_odds", "phil_metric_rank", "power_rank", "ret_starters", "predicted_wins", "prev_year_points"];
  const textFields    = ["prev_year_record", "prev_year_ats"];

  return (
    <div style={{ padding: "2rem" }}>
      <h2>Admin Panel: Pre-Season Stats ({SEASON_YEAR})</h2>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <input
          type="text"
          placeholder="Filter by conference..."
          value={conferenceFilter}
          onChange={(e) => setConferenceFilter(e.target.value)}
          style={{ width: "40%", padding: "0.5rem" }}
        />
        <button onClick={exportToCSV}>📤 Export to CSV</button>
      </div>

      <h3>Add New Team</h3>
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
        <input
          type="text"
          placeholder="School name"
          value={newTeam.school}
          onChange={e => setNewTeam(prev => ({ ...prev, school: e.target.value }))}
        />
        <input
          type="text"
          placeholder="Conference"
          value={newTeam.conference}
          onChange={e => setNewTeam(prev => ({ ...prev, conference: e.target.value }))}
        />
        <button onClick={handleAddTeam}>➕ Add Team</button>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
        <thead>
          <tr style={{ background: "#f0f0f0", cursor: "pointer" }}>
            <th onClick={() => handleSort("school")} style={thStyle}>School</th>
            <th onClick={() => handleSort("conference")} style={thStyle}>Conf</th>
            <th onClick={() => handleSort("phil_metric_rank")} style={thStyle}>Phil Rank</th>
            <th onClick={() => handleSort("conf_odds")} style={thStyle}>Conf Odds</th>
            <th onClick={() => handleSort("power_rank")} style={thStyle}>Power Rank</th>
            <th onClick={() => handleSort("ret_starters")} style={thStyle}>Ret Starters</th>
            <th onClick={() => handleSort("predicted_wins")} style={thStyle}>Pred Wins</th>
            <th onClick={() => handleSort("prev_year_record")} style={thStyle}>Prev Record</th>
            <th onClick={() => handleSort("prev_year_ats")} style={thStyle}>Prev ATS</th>
            <th onClick={() => handleSort("prev_year_points")} style={thStyle}>Prev Pts</th>
          </tr>
        </thead>
        <tbody>
          {filteredTeams.map(team => (
            <tr key={team.id} style={{ borderBottom: "1px solid #ccc" }}>
              <td style={{ padding: "4px 8px", fontWeight: "600" }}>{team.school}</td>
              <td style={{ padding: "4px 8px", color: "#666" }}>{team.conference}</td>
              {numericFields.map(field => (
                <td key={field} style={{ padding: "4px 8px" }}>
                  <input
                    type="number"
                    value={team[field] ?? ""}
                    placeholder="—"
                    onChange={e => handleUpdate(team.id, field, e.target.value === "" ? null : parseFloat(e.target.value))}
                    style={{ width: "5rem" }}
                  />
                </td>
              ))}
              {textFields.map(field => (
                <td key={field} style={{ padding: "4px 8px" }}>
                  <input
                    type="text"
                    value={team[field] ?? ""}
                    placeholder="—"
                    onChange={e => handleUpdate(team.id, field, e.target.value)}
                    style={{ width: "6rem" }}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const thStyle = {
  padding: "6px 8px",
  textAlign: "left",
  borderBottom: "2px solid #ccc",
  userSelect: "none",
};

export default AdminTeamsPanel;
