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

  useEffect(() => {
    const fetchData = async () => {
      const teamsSnap = await getDocs(collection(db, "teams"));
      const membersSnap = await getDocs(collection(db, "leagues", leagueId, "members"));

      const teamsMap = {};
      const drafted = {};

      membersSnap.forEach(doc => {
        const { displayName, teamName, lineup } = doc.data();
        const currentRoster = lineup?.currentRoster || [];
        currentRoster.forEach(team => {
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
      setUserTeams(lineup.currentRoster || []);

      setLoading(false);
    };

    fetchData();
  }, [leagueId]);

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
    if (activeConference === "National") {
      return Object.values(teamsByConference)
        .flat()
        .filter(team => !draftedTeams[team.school]);
    }
    return (teamsByConference[activeConference] || []).filter(team => !draftedTeams[team.school]);
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

      <div style={{ marginBottom: "1rem" }}>
        <label>
          Filter by Conference:{" "}
          <select
            value={activeConference}
            onChange={(e) => setActiveConference(e.target.value)}
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
            <th onClick={() => toggleSort("school")}>School</th>
            <th onClick={() => toggleSort("gamePoints")}>Points</th>
            <th onClick={() => toggleSort("currentSeason.record")}>Record</th>
            <th onClick={() => toggleSort("currentSeason.nextOpponent")}>Next Game</th>
            <th>Remaining Schedule</th>
            <th></th> {/* Action column */}
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
                  <strong>{team.school}</strong>{" "}
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

export default FreeAgents;
