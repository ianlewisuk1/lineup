import React, { useState, useEffect } from "react";
import { supabase } from "../supabase/supabase";


const allTeams = [
  "Alabama", "Georgia", "Michigan", "Ohio State", "Texas", "LSU", "Florida State", "Oregon",
  // ... add all 130 team names here eventually
];

function AssignTeams() {
  const [users, setUsers] = useState([]);
  const [teamSelections, setTeamSelections] = useState({});

  useEffect(() => {
    const fetchLeagueUsers = async () => {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) return;

      // Get current user's leagueId
      const { data: userDoc } = await supabase.from("users").select("*").eq("id", currentUser.id).single();
      const leagueId = userDoc.leagueId;

      // Query users in that league
      const { data: usersInLeague } = await supabase.from("users").select("*").eq("leagueId", leagueId);
      setUsers(usersInLeague || []);
    };

    fetchLeagueUsers();
  }, []);

  const handleAssign = async (userId) => {
    try {
      const selectedTeams = teamSelections[userId] || [];
      if (selectedTeams.length !== 7) {
        alert("Please select 7 teams exactly.");
        return;
      }

      await supabase.from("users").update({ lineup: selectedTeams }).eq("id", userId);

      alert("Teams assigned!");
    } catch (err) {
      alert(err.message);
    }
  };

  const handleTeamChange = (userId, index, value) => {
    const current = teamSelections[userId] || Array(7).fill("");
    current[index] = value;
    setTeamSelections({ ...teamSelections, [userId]: current });
  };

  return (
    <div>
      <h2>Assign Teams (Admin Only)</h2>
      {users.map((user) => (
        <div key={user.id} style={{ border: "1px solid #ccc", marginBottom: 20, padding: 10 }}>
          <h4>{user.email}</h4>
          {Array.from({ length: 7 }).map((_, i) => (
            <select
              key={i}
              value={(teamSelections[user.id] || [])[i] || ""}
              onChange={(e) => handleTeamChange(user.id, i, e.target.value)}
            >
              <option value="">-- Select Team {i + 1} --</option>
              {allTeams.map((team) => (
                <option key={team} value={team}>{team}</option>
              ))}
            </select>
          ))}
          <br />
          <button onClick={() => handleAssign(user.id)}>Assign Teams</button>
        </div>
      ))}
    </div>
  );
}

export default AssignTeams;
