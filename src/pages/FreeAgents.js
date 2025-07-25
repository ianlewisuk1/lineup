import React, { useEffect, useState } from "react";
import { db, auth } from "../firebase/firebase";
import {
  collection,
  getDocs,
  getDoc,
  doc,
  updateDoc,
} from "firebase/firestore";
import { useParams } from "react-router-dom";
import { Plus } from "lucide-react";
import LeagueNavBar from "../components/LeagueNavBar";

function FreeAgents() {
  const { leagueId } = useParams();
  const [teamsByConference, setTeamsByConference] = useState({});
  const [conferenceList, setConferenceList] = useState([]);
  const [activeConference, setActiveConference] = useState("");
  const [draftedTeams, setDraftedTeams] = useState({});
  const [loading, setLoading] = useState(true);
  const [userTeams, setUserTeams] = useState([]);
  const [selectedDropTeam, setSelectedDropTeam] = useState("");
  const [pendingAddTeam, setPendingAddTeam] = useState("");
  const [showSwapUI, setShowSwapUI] = useState(false);
  const [starters, setStarters] = useState([]);
  const [bench, setBench] = useState([]);

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
        if (data.classification !== "FBS") return;

        const conf = data.conference || "Unknown";
        if (!teamsMap[conf]) teamsMap[conf] = [];

        teamsMap[conf].push({
          id: doc.id,
          ...data,
        });
      });

      const sortedConf = Object.keys(teamsMap).sort();
      sortedConf.forEach(conf => {
        teamsMap[conf].sort((a, b) => a.school.localeCompare(b.school));
      });

      setTeamsByConference(teamsMap);
      setConferenceList(sortedConf);
      setActiveConference(sortedConf[0]);
      setDraftedTeams(drafted);

      // fetch current user's roster
      const user = auth.currentUser;
      if (!user) return;

      const memberRef = doc(db, "leagues", leagueId, "members", user.uid);
      const memberSnap = await getDoc(memberRef);
      const lineup = memberSnap.data()?.lineup || {};
      setUserTeams(lineup.currentRoster || []);
      setStarters(lineup.starters || []);
      setBench(lineup.bench || []);

      setLoading(false);
    };

    fetchData();
  }, [leagueId]);

  const handleAddTeam = async (teamName) => {
    const user = auth.currentUser;
    if (!user) return;

    const memberRef = doc(db, "leagues", leagueId, "members", user.uid);

    // Prefer to fill starter, then bench
    if (userTeams.length < 7) {
      const newRoster = [...userTeams, teamName];
      const newStarters = starters.length < 5 ? [...starters, teamName] : starters;
      const newBench = starters.length < 5 ? bench : [...bench, teamName];

      await updateDoc(memberRef, {
        "lineup.currentRoster": newRoster,
        "lineup.starters": newStarters,
        "lineup.bench": newBench
      });

      window.location.reload();
    } else {
      // Show swap UI if roster is full
      setPendingAddTeam(teamName);
      setSelectedDropTeam("");
      setShowSwapUI(true);
    }
  };

  const handleConfirmSwap = async () => {
    const user = auth.currentUser;
    if (!user || !selectedDropTeam || !pendingAddTeam) return;

    const memberRef = doc(db, "leagues", leagueId, "members", user.uid);
    const memberSnap = await getDoc(memberRef);
    const data = memberSnap.data();
    const lineup = data.lineup || {};

    const currentRoster = lineup.currentRoster || [];
    const starters = lineup.starters || [];
    const bench = lineup.bench || [];

    if (!currentRoster.includes(selectedDropTeam)) {
      alert("Team to drop is not in current roster.");
      return;
    }

    const newRoster = currentRoster
      .filter(t => t !== selectedDropTeam)
      .concat(pendingAddTeam);

    let newStarters = starters;
    let newBench = bench;

    if (starters.includes(selectedDropTeam)) {
      newStarters = starters.map(t => (t === selectedDropTeam ? pendingAddTeam : t));
    } else if (bench.includes(selectedDropTeam)) {
      newBench = bench.map(t => (t === selectedDropTeam ? pendingAddTeam : t));
    } else {
      newBench = [...bench, pendingAddTeam];
    }

    await updateDoc(memberRef, {
      "lineup.currentRoster": newRoster,
      "lineup.starters": newStarters,
      "lineup.bench": newBench
    });

    setPendingAddTeam("");
    setSelectedDropTeam("");
    setShowSwapUI(false);
    window.location.reload();
  };

  if (loading) return <p>Loading Free Agents...</p>;

  return (
    <div>
      <LeagueNavBar />
      <h2>Free Agents</h2>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "1rem" }}>
        {conferenceList.map(conf => (
          <button
            key={conf}
            onClick={() => setActiveConference(conf)}
            style={{ fontWeight: activeConference === conf ? "bold" : "normal" }}
          >
            {conf}
          </button>
        ))}
      </div>

      {teamsByConference[activeConference]?.map(team => {
        const owner = draftedTeams[team.school];
        const owned = Boolean(owner);
        const season = team.currentSeason || {};

        return (
          <div
            key={team.id}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "0.5rem",
              borderBottom: "1px solid #ddd"
            }}
          >
            <div>
              <strong>{team.school}</strong> | Record: {season.record} | Conf: {season.confRecord} |
              Next: {season.nextOpponent} | Points For: {season.totalPointsFor} |
              Points Against: {season.totalPointsAgainst} |
              Status: {owned ? `Owned by ${owner.ownerName} (${owner.teamName})` : "Available"}
            </div>
            {!owned && (
              <button onClick={() => handleAddTeam(team.school)}>
                <Plus color="green" />
              </button>
            )}
          </div>
        );
      })}

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
