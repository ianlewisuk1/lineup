import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { auth, db } from "../firebase/firebase";
import {
  doc,
  getDoc,
  collection,
  getDocs
} from "firebase/firestore";
import LeagueNavBar from "../components/LeagueNavBar";

function MyLineup() {
  const { leagueId } = useParams();
  const [loading, setLoading] = useState(true);
  const [teamName, setTeamName] = useState("");
  const [lineup, setLineup] = useState([]);
  const [startersSet, setStartersSet] = useState(new Set());

  useEffect(() => {
    const fetchLineup = async () => {
      const currentUser = auth.currentUser;
      if (!currentUser) return;

      const memberRef = doc(db, "leagues", leagueId, "members", currentUser.uid);
      const memberSnap = await getDoc(memberRef);
      const memberData = memberSnap.data();

      const drafted = memberData?.lineup?.drafted || [];
      const starters = memberData?.lineup?.starters || [];
      const startersSet = new Set(starters);
      setTeamName(memberData?.teamName || "Unnamed Squad");

      const teamsSnap = await getDocs(collection(db, "teams"));
      const allTeams = {};
      teamsSnap.forEach(doc => {
        allTeams[doc.data().school] = {
          id: doc.id,
          ...doc.data()
        };
      });

      const enrichedLineup = drafted.map(teamName => ({
        ...allTeams[teamName],
        isStarter: startersSet.has(teamName)
      }));

      setStartersSet(startersSet);
      setLineup(enrichedLineup);
      setLoading(false);
    };

    fetchLineup();
  }, [leagueId]);

  if (loading) return <p>Loading your lineup...</p>;

  return (
    <div>
      <LeagueNavBar />

      <h2>{teamName} — My Lineup</h2>

      {lineup.map(team => {
        const season = team.currentSeason || {};
        return (
          <div
            key={team.id}
            style={{
              padding: "0.5rem",
              borderBottom: "1px solid #ddd",
              backgroundColor: team.isStarter ? "#f0f8ff" : "#f9f9f9"
            }}
          >
            <strong>{team.school}</strong> ({team.isStarter ? "Starter" : "Bench"})<br />
            Record: {season.record} | Conf: {season.confRecord} | Next: {season.nextOpponent}<br />
            Points For: {season.totalPointsFor} | Against: {season.totalPointsAgainst}
          </div>
        );
      })}
    </div>
  );
}

export default MyLineup;
