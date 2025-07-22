import React, { useEffect, useState } from "react";
import { db } from "../firebase/firebase";
import {
  collection,
  getDocs,
} from "firebase/firestore";
import { useParams } from "react-router-dom";
import { Plus } from "lucide-react";

function FreeAgents() {
  const { leagueId } = useParams();
  const [teamsByConference, setTeamsByConference] = useState({});
  const [conferenceList, setConferenceList] = useState([]);
  const [activeConference, setActiveConference] = useState("");
  const [draftedTeams, setDraftedTeams] = useState(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      const teamsSnap = await getDocs(collection(db, "teams"));
      const membersSnap = await getDocs(collection(db, "leagues", leagueId, "members"));

      const teamsMap = {};
      const drafted = new Set();

      membersSnap.forEach(doc => {
        const { lineup } = doc.data();
        if (lineup?.drafted) {
          lineup.drafted.forEach(team => drafted.add(team));
        }
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

      // Sort conferences and their teams alphabetically
      const sortedConf = Object.keys(teamsMap).sort();
      sortedConf.forEach(conf => {
        teamsMap[conf].sort((a, b) => a.school.localeCompare(b.school));
      });

      setTeamsByConference(teamsMap);
      setConferenceList(sortedConf);
      setActiveConference(sortedConf[0]);
      setDraftedTeams(drafted);
      setLoading(false);
    };

    fetchData();
  }, [leagueId]);

  if (loading) return <p>Loading Free Agents...</p>;

  const handleAddTeam = (teamName) => {
    // TODO: Add pickup logic
    alert(`Add ${teamName} to your roster`);
  };

  return (
    <div>
      <h2>Free Agents</h2>

      {/* Conference Toggle */}
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

      {/* Team Table for Active Conference */}
      {teamsByConference[activeConference]?.map(team => {
        const owned = draftedTeams.has(team.school);
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
              <strong>{team.school}</strong> | Record: {season.record} | Conf: {season.confRecord} | Next: {season.nextOpponent} | Points For: {season.totalPointsFor} | Points Against: {season.totalPointsAgainst} | Status: {owned ? "Owned" : "Available"}
            </div>
            {!owned && (
              <button onClick={() => handleAddTeam(team.school)}>
                <Plus color="green" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default FreeAgents;
