import React, { useEffect, useState } from "react";
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
} from "firebase/firestore";
import { db } from "../firebase/firebase";

function AdminSchedulePanel() {
  const [week, setWeek] = useState("1"); // String to support "all"
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const fetchGames = async () => {
    setLoading(true);
    let allGames = [];

    if (week === "all") {
      const weekNumbers = Array.from({ length: 20 }, (_, i) => i + 1);
      for (const w of weekNumbers) {
        const snap = await getDocs(
          collection(db, "schedule", "2025", "weeks", String(w), "games")
        );
        const gamesWithWeek = snap.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
          week: w,
        }));
        allGames = [...allGames, ...gamesWithWeek];
      }
    } else {
      const snap = await getDocs(
        collection(db, "schedule", "2025", "weeks", String(week), "games")
      );
      allGames = snap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        week: parseInt(week),
      }));
    }

    setGames(allGames);
    setLoading(false);
  };

  useEffect(() => {
    fetchGames();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [week]);

  const handleUpdate = async (id, field, value, gameWeek = week) => {
    const gameRef = doc(
      db,
      "schedule",
      "2025",
      "weeks",
      String(gameWeek),
      "games",
      id
    );
    await updateDoc(gameRef, { [field]: value });
    setGames((prev) =>
      prev.map((g) =>
        g.id === id && g.week === gameWeek ? { ...g, [field]: value } : g
      )
    );
  };

  const handleDelete = async (id, gameWeek = week) => {
    if (!window.confirm("Delete this game?")) return;
    const gameRef = doc(
      db,
      "schedule",
      "2025",
      "weeks",
      String(gameWeek),
      "games",
      id
    );
    await deleteDoc(gameRef);
    setGames((prev) => prev.filter((g) => !(g.id === id && g.week === gameWeek)));
  };

  const filteredGames = games.filter((g) => {
    const searchLower = search.toLowerCase();
    return (
      g.awayTeam?.toLowerCase().includes(searchLower) ||
      g.homeTeam?.toLowerCase().includes(searchLower) ||
      g.venue?.toLowerCase().includes(searchLower) ||
      g.status?.toLowerCase().includes(searchLower) ||
      g.date?.toLowerCase().includes(searchLower) ||
      String(g.week).includes(searchLower) ||
      String(g.awayPoints).includes(searchLower) ||
      String(g.homePoints).includes(searchLower) ||
      String(g.spread).includes(searchLower)
    );
  });

  return (
    <div style={{ padding: "2rem" }}>
      <h2>Admin Panel: Schedule</h2>

      <label>
        Select Week:{" "}
        <select value={week} onChange={(e) => setWeek(e.target.value)}>
          <option value="all">All Weeks</option>
          {Array.from({ length: 20 }, (_, i) => i + 1).map((w) => (
            <option key={w} value={String(w)}>
              Week {w}
            </option>
          ))}
        </select>
      </label>

      <div style={{ margin: "1rem 0" }}>
        <input
          type="text"
          placeholder="Search across all fields..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: "100%", padding: "0.5rem" }}
        />
      </div>

      {loading ? (
        <p>Loading games...</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
          <thead>
            <tr style={{ backgroundColor: "#f0f0f0" }}>
              <th>Week</th>
              <th>Away</th>
              <th>Home</th>
              <th>Date</th>
              <th>Venue</th>
              <th>Spread</th>
              <th>Status</th>
              <th>Away Pts</th>
              <th>Home Pts</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filteredGames.map((g) => (
              <tr key={`${g.week}-${g.id}`} style={{ borderBottom: "1px solid #ccc" }}>
                <td>{g.week}</td>
                <td>
                  <input
                    value={g.awayTeam}
                    onChange={(e) => handleUpdate(g.id, "awayTeam", e.target.value, g.week)}
                  />
                </td>
                <td>
                  <input
                    value={g.homeTeam}
                    onChange={(e) => handleUpdate(g.id, "homeTeam", e.target.value, g.week)}
                  />
                </td>
                <td>
                  <input
                    type="text"
                    value={g.date || ""}
                    onChange={(e) => handleUpdate(g.id, "date", e.target.value, g.week)}
                  />
                </td>
                <td>
                  <input
                    value={g.venue || ""}
                    onChange={(e) => handleUpdate(g.id, "venue", e.target.value, g.week)}
                  />
                </td>
                <td>
                  <input
                    value={g.spread ?? "TBD"}
                    onChange={(e) => handleUpdate(g.id, "spread", e.target.value, g.week)}
                  />
                </td>
                <td>
                  <select
                    value={g.status || "scheduled"}
                    onChange={(e) => handleUpdate(g.id, "status", e.target.value, g.week)}
                  >
                    <option value="scheduled">Scheduled</option>
                    <option value="in-progress">In Progress</option>
                    <option value="final">Final</option>
                  </select>
                </td>
                <td>
                  <input
                    type="number"
                    value={g.awayPoints ?? ""}
                    onChange={(e) =>
                      handleUpdate(g.id, "awayPoints", parseInt(e.target.value), g.week)
                    }
                    style={{ width: "4rem" }}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    value={g.homePoints ?? ""}
                    onChange={(e) =>
                      handleUpdate(g.id, "homePoints", parseInt(e.target.value), g.week)
                    }
                    style={{ width: "4rem" }}
                  />
                </td>
                <td>
                  <button
                    onClick={() => handleDelete(g.id, g.week)}
                    style={{ color: "red", fontWeight: "bold" }}
                  >
                    🗑
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default AdminSchedulePanel;
