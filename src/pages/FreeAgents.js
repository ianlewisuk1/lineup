import React, { useEffect, useState } from "react";
import { db, auth } from "../firebase/firebase";
import {
  collection,
  getDocs,
  getDoc,
  doc,
} from "firebase/firestore";
import { useParams, useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import LeagueNavBar from "../components/LeagueNavBar";

function FreeAgents() {
  const { leagueId } = useParams();
  const navigate = useNavigate();
  const [teamsByConference, setTeamsByConference] = useState({});
  const [conferenceList, setConferenceList] = useState([]);
  const [activeConference, setActiveConference] = useState("National");
  const [draftedTeams, setDraftedTeams] = useState({});
  const [loading, setLoading] = useState(true);
  const [userTeams, setUserTeams] = useState([]);
  const [selectedDropTeam, setSelectedDropTeam] = useState("");
  const [pendingAddTeam, setPendingAddTeam] = useState("");
  const [showSwapUI, setShowSwapUI] = useState(false);
  const [sortConfig, setSortConfig] = useState({ key: "school", direction: "asc" });
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const fetchData = async () => {
      const teamsSnap = await getDocs(collection(db, "teams"));
      const membersSnap = await getDocs(collection(db, "leagues", leagueId, "members"));

      const teamsMap = {};
      const drafted = {};
      membersSnap.forEach(doc => {
        const { displayName, teamName, lineup } = doc.data();
        const starters = lineup?.starters || [];
        const bench = lineup?.bench || [];
        const current = [...starters, ...bench];

        current.forEach(team => {
          drafted[team] = {
            ownerName: displayName,
            teamName: teamName || "Unnamed Squad"
          };
        });
      });

      teamsSnap.forEach(doc => {
        const data = doc.data();
        if ((data.classification || "").toUpperCase() !== "FBS") return;

        const conf = data.conference || "Unknown";
        if (!teamsMap[conf]) teamsMap[conf] = [];

        teamsMap[conf].push({
          id: doc.id,
          ...data,
        });
      });

      const sortedConf = Object.keys(teamsMap).sort();
      setConferenceList(["National", ...sortedConf]);
      setTeamsByConference(teamsMap);
      setActiveConference("National");
      setDraftedTeams(drafted);

      const user = auth.currentUser;
      if (!user) return;

      const memberRef = doc(db, "leagues", leagueId, "members", user.uid);
      const memberSnap = await getDoc(memberRef);
      const lineup = memberSnap.data()?.lineup || {};

      const starters = lineup.starters || [];
      const bench = lineup.bench || [];
      setUserTeams([...starters, ...bench]);

      setLoading(false);
    };

    fetchData();
  }, [leagueId]);

  const handleTeamClick = (teamName) => {
    navigate(`/${leagueId}/team/${encodeURIComponent(teamName)}`);
  };

  const handleAddTeam = (teamName) => {
    const user = auth.currentUser;
    if (!user) return;

    if (userTeams.length < 7) {
      navigate(`/confirm-add/${leagueId}/${teamName}`);
    } else {
      setPendingAddTeam(teamName);
      setSelectedDropTeam("");
      setShowSwapUI(true);
    }
  };

  const handleConfirmSwap = () => {
    if (!selectedDropTeam || !pendingAddTeam) return;
    navigate(`/confirm-swap/${leagueId}/${pendingAddTeam}/${selectedDropTeam}`);
  };

  const getVisibleFreeAgents = () => {
    let teams;
    if (activeConference === "National") {
      teams = Object.values(teamsByConference)
        .flat()
        .filter(team => !draftedTeams[team.school]);
    } else {
      teams = (teamsByConference[activeConference] || []).filter(team => !draftedTeams[team.school]);
    }

    // Filter by search query
    if (searchQuery) {
      teams = teams.filter(team => 
        team.school.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    return teams;
  };

  const sortedTeams = [...getVisibleFreeAgents()].sort((a, b) => {
    const key = sortConfig.key;
    const aValue = a[key] || "";
    const bValue = b[key] || "";

    if (typeof aValue === "number" && typeof bValue === "number") {
      return sortConfig.direction === "asc" ? aValue - bValue : bValue - aValue;
    }

    return sortConfig.direction === "asc"
      ? String(aValue).localeCompare(String(bValue))
      : String(bValue).localeCompare(String(aValue));
  });

  const toggleSort = (key) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc",
    }));
  };

  const formatNextGame = (season) => {
    if (!season?.nextOpponent) return "—";
    const isHome = season.nextGameIsHome;
    const spread = season.nextOpponentSpread ?? "TBD";
    const prefix = isHome === false ? "@" : isHome === true ? "vs" : "?";
    return `${prefix} ${season.nextOpponent} (${spread})`;
  };

  if (loading) return <p>Loading Free Agents...</p>;

  return (
    <div>
      <LeagueNavBar />
      <h2>Free Agents</h2>

      <div style={{ display: "flex", gap: "1rem", marginBottom: "1rem", flexWrap: "wrap" }}>
        <input
          type="text"
          placeholder="Search by team name..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ padding: "6px", fontSize: "0.9rem", minWidth: "200px" }}
        />

        <label>
          Filter by Conference:{" "}
          <select
            value={activeConference}
            onChange={(e) => setActiveConference(e.target.value)}
            style={{ padding: "6px", fontSize: "0.9rem" }}
          >
            {conferenceList.map(conf => (
              <option key={conf} value={conf}>
                {conf}
              </option>
            ))}
          </select>
        </label>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <SortableHeader 
              label="School" 
              sortKey="school" 
              onSort={toggleSort} 
              sortConfig={sortConfig} 
            />
            <SortableHeader 
              label="Points" 
              sortKey="gamePoints" 
              onSort={toggleSort} 
              sortConfig={sortConfig} 
            />
            <SortableHeader 
              label="Record" 
              sortKey="currentSeason.record" 
              onSort={toggleSort} 
              sortConfig={sortConfig} 
            />
            <SortableHeader 
              label="Next Game" 
              sortKey="currentSeason.nextOpponent" 
              onSort={toggleSort} 
              sortConfig={sortConfig} 
            />
            <th style={{ padding: "0.75rem", textAlign: "left", borderBottom: "2px solid #ccc" }}>
              Remaining Schedule
            </th>
            <th style={{ padding: "0.75rem", textAlign: "center", borderBottom: "2px solid #ccc" }}>
              Add
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedTeams.map((team) => {
            const season = team.currentSeason || {};
            const scheduleTBD = [
              "Week 1: TBD vs TBD",
              "Week 2: TBD vs TBD",
              "Week 3: TBD vs TBD",
            ];

            return (
              <tr key={team.id} style={{ borderBottom: "1px solid #ddd" }}>
                <td>
                  <strong 
                    onClick={() => handleTeamClick(team.school)}
                    style={{ cursor: "pointer", color: "#0066cc", textDecoration: "underline" }}
                  >
                    {team.school}
                  </strong>{" "}
                  <span style={{ color: "#666" }}>({team.conference || "N/A"})</span>
                </td>
                <td>{season.gamePoints ?? 0}</td>
                <td>{season.record || "—"}</td>
                <td>{formatNextGame(season)}</td>
                <td>
                  <details>
                    <summary>View</summary>
                    <ul style={{ paddingLeft: "1rem", margin: 0 }}>
                      {scheduleTBD.map((item, idx) => (
                        <li key={idx}>{item}</li>
                      ))}
                    </ul>
                  </details>
                </td>
                <td>
                  <button onClick={() => handleAddTeam(team.school)}>
                    <Plus color="green" />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {showSwapUI && (
        <div style={{ marginTop: "1rem", padding: "1rem", border: "1px solid #ccc" }}>
          <h4>Swap in: {pendingAddTeam}</h4>
          <label>
            Drop:
            <select
              value={selectedDropTeam}
              onChange={(e) => setSelectedDropTeam(e.target.value)}
              style={{ marginLeft: "1rem" }}
            >
              <option value="">Select one of your teams</option>
              {userTeams.map((team) => (
                <option key={team} value={team}>
                  {team}
                </option>
              ))}
            </select>
          </label>
          <button
            onClick={handleConfirmSwap}
            disabled={!selectedDropTeam}
            style={{ marginLeft: "1rem" }}
          >
            Confirm Swap
          </button>
        </div>
      )}
    </div>
  );
}

const SortableHeader = ({ label, sortKey, onSort, sortConfig }) => (
  <th
    onClick={() => onSort(sortKey)}
    style={{ 
      cursor: "pointer", 
      textAlign: "left", 
      borderBottom: "2px solid #ccc",
      padding: "0.75rem",
      userSelect: "none",
      backgroundColor: sortConfig.key === sortKey ? "#f0f0f0" : "transparent"
    }}
  >
    {label} {sortConfig.key === sortKey ? (sortConfig.direction === "asc" ? "▲" : "▼") : "⇅"}
  </th>
);

export default FreeAgents;