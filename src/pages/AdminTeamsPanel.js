import React, { useEffect, useState } from "react";
import { supabase } from "../supabase/supabase";

function AdminTeamsPanel() {
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortConfig, setSortConfig] = useState({ key: "school", direction: "asc" });
  const [conferenceFilter, setConferenceFilter] = useState("");
  const [newTeam, setNewTeam] = useState({
    school: "",
    conference: "",
    confOdds: 0,
    powerRank: 0,
    retStarters: 0,
    sosRank: 0,
    predictedWins: 0,
  });

  useEffect(() => {
    const fetchTeams = async () => {
      const { data } = await supabase.from("teams").select("*");
      const list = (data || []).map(t => ({ id: t.id, ...t }));
      setTeams(list);
      setLoading(false);
    };
    fetchTeams();
  }, []);

  const handleUpdate = async (id, field, value) => {
    await supabase.from("teams").update({ [field]: value }).eq("id", id);
    setTeams(prev =>
      prev.map(t => (t.id === id ? { ...t, [field]: value } : t))
    );
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this team?")) return;
    await supabase.from("teams").delete().eq("id", id);
    setTeams(prev => prev.filter(t => t.id !== id));
  };

  const handleAddTeam = async () => {
    const newDoc = {
      ...newTeam,
      id: newTeam.school,
      classification: "FBS",
    };
    await supabase.from("teams").upsert(newDoc);
    setTeams(prev => [...prev, { id: newDoc.school, ...newDoc }]);
    setNewTeam({
      school: "",
      conference: "",
      confOdds: 0,
      powerRank: 0,
      retStarters: 0,
      sosRank: 0,
      predictedWins: 0,
    });
  };

  const handleSort = (key) => {
    const direction =
      sortConfig.key === key && sortConfig.direction === "asc" ? "desc" : "asc";
    setSortConfig({ key, direction });
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
    const headers = ["school", "conference", "confOdds", "powerRank", "retStarters", "sosRank", "predictedWins"];
    const rows = filteredTeams.map(team =>
      headers.map(h => team[h] ?? "").join(",")
    );
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "teams.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) return <p>Loading teams...</p>;

  return (
    <div style={{ padding: "2rem" }}>
      <h2>Admin Panel: Teams</h2>

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
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0.5rem", marginBottom: "1rem" }}>
        {Object.entries(newTeam).map(([key, value]) => (
          <input
            key={key}
            type={typeof value === "number" ? "number" : "text"}
            placeholder={key}
            value={value}
            onChange={e =>
              setNewTeam({
                ...newTeam,
                [key]: typeof value === "number"
                  ? parseFloat(e.target.value) || 0
                  : e.target.value
              })
            }
          />
        ))}
        <button onClick={handleAddTeam} style={{ gridColumn: "span 4" }}>➕ Add Team</button>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
        <thead>
          <tr style={{ background: "#f0f0f0", cursor: "pointer" }}>
            <th onClick={() => handleSort("school")}>School</th>
            <th onClick={() => handleSort("conference")}>Conf</th>
            <th onClick={() => handleSort("confOdds")}>Odds</th>
            <th onClick={() => handleSort("powerRank")}>Power</th>
            <th onClick={() => handleSort("retStarters")}>RS</th>
            <th onClick={() => handleSort("sosRank")}>SOS</th>
            <th onClick={() => handleSort("predictedWins")}>Pred Wins</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {filteredTeams.map(team => (
            <tr key={team.id} style={{ borderBottom: "1px solid #ccc" }}>
              <td>{team.school}</td>
              <td>
                <input
                  value={team.conference || ""}
                  onChange={e => handleUpdate(team.id, "conference", e.target.value)}
                />
              </td>
              <td>
                <input
                  type="number"
                  value={team.confOdds ?? 0}
                  onChange={e => handleUpdate(team.id, "confOdds", parseFloat(e.target.value))}
                  style={{ width: "4rem" }}
                />
              </td>
              <td>
                <input
                  type="number"
                  value={team.powerRank ?? 0}
                  onChange={e => handleUpdate(team.id, "powerRank", parseInt(e.target.value))}
                  style={{ width: "4rem" }}
                />
              </td>
              <td>
                <input
                  type="number"
                  value={team.retStarters ?? 0}
                  onChange={e => handleUpdate(team.id, "retStarters", parseInt(e.target.value))}
                  style={{ width: "4rem" }}
                />
              </td>
              <td>
                <input
                  type="number"
                  value={team.sosRank ?? 0}
                  onChange={e => handleUpdate(team.id, "sosRank", parseInt(e.target.value))}
                  style={{ width: "4rem" }}
                />
              </td>
              <td>
                <input
                  type="number"
                  value={team.predictedWins ?? 0}
                  onChange={e => handleUpdate(team.id, "predictedWins", parseFloat(e.target.value))}
                  style={{ width: "4rem" }}
                />
              </td>
              <td>
                <button
                  onClick={() => handleDelete(team.id)}
                  style={{ color: "red", fontWeight: "bold" }}
                >
                  🗑
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default AdminTeamsPanel;
