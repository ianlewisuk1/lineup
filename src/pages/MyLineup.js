import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { auth, db } from "../firebase/firebase";
import {
  doc,
  getDoc,
  collection,
  getDocs,
  updateDoc
} from "firebase/firestore";
import LeagueNavBar from "../components/LeagueNavBar";

function MyLineup() {
  const { leagueId } = useParams();
  const [loading, setLoading] = useState(true);
  const [teamName, setTeamName] = useState("");
  const [starters, setStarters] = useState([]);
  const [bench, setBench] = useState([]);
  const [swapTarget, setSwapTarget] = useState(null);

  useEffect(() => {
    const fetchLineup = async () => {
      const currentUser = auth.currentUser;
      if (!currentUser) return;

      const memberRef = doc(db, "leagues", leagueId, "members", currentUser.uid);
      const memberSnap = await getDoc(memberRef);
      const memberData = memberSnap.data();

      const starterList = memberData?.lineup?.starters || [];
      const benchList = memberData?.lineup?.bench || [];
      const rosterList = memberData?.lineup?.currentRoster || [];

      setTeamName(memberData?.teamName || "Unnamed Squad");

      const teamsSnap = await getDocs(collection(db, "teams"));
      const allTeams = {};
      teamsSnap.forEach(doc => {
        allTeams[doc.data().school] = {
          id: doc.id,
          ...doc.data()
        };
      });

      const startersResolved = starterList.map(name => rosterList.includes(name) ? allTeams[name] : null);
      const benchResolved = benchList.map(name => rosterList.includes(name) ? allTeams[name] : null);

      setStarters(startersResolved);
      setBench(benchResolved);
      setLoading(false);
    };

    fetchLineup();
  }, [leagueId]);

  const handleSwap = (starterIndex, benchTeam) => {
    const starterTeam = starters[starterIndex];
    const newStarters = [...starters];
    const newBench = [...bench];

    newStarters[starterIndex] = benchTeam;
    const benchIndex = newBench.findIndex(t => t?.school === benchTeam.school);
    newBench[benchIndex] = starterTeam;

    setStarters(newStarters);
    setBench(newBench);
    setSwapTarget(null);

    const currentUser = auth.currentUser;
    if (!currentUser) return;

    const memberRef = doc(db, "leagues", leagueId, "members", currentUser.uid);
    updateDoc(memberRef, {
      "lineup.starters": newStarters.map(t => t?.school || null),
      "lineup.bench": newBench.map(t => t?.school || null)
    });
  };

  if (loading) return <p>Loading your lineup...</p>;

  return (
    <div>
      <LeagueNavBar />
      <h2>{teamName} — My Lineup</h2>

      <div>
        <h3>Starters</h3>
        {Array.from({ length: 5 }).map((_, idx) => {
          const team = starters[idx];
          return (
            <div
              key={idx}
              style={{
                padding: "0.5rem",
                borderBottom: "1px solid #ddd",
                backgroundColor: "#f0f8ff",
                marginBottom: "0.25rem",
                position: "relative",
                minHeight: "4rem"
              }}
            >
              {team ? (
                <>
                  <strong>{team.school}</strong> ({team.conference})
                  <br />
                  Record: {team.currentSeason?.record} | Conf: {team.currentSeason?.confRecord}
                  <br />
                  Next: {team.currentSeason?.nextOpponent} ({team.currentSeason?.nextOpponentSpread})
                  <br />
                  Game Points: {team.currentSeason?.gamePoints ?? 0}
                  <div style={{ position: "absolute", right: "1rem", top: "0.5rem" }}>
                    <button onClick={() => setSwapTarget(idx)}>↕️</button>
                    <Link
                      to={`/cut/${leagueId}/${encodeURIComponent(team.school)}`}
                      style={{
                        marginLeft: "0.5rem",
                        backgroundColor: "#f44336",
                        color: "#fff",
                        border: "none",
                        padding: "0.25rem 0.5rem",
                        cursor: "pointer",
                        textDecoration: "none",
                        borderRadius: "4px"
                      }}
                    >
                      ❌ Cut
                    </Link>
                  </div>
                  {swapTarget === idx && (
                    <div style={{ marginTop: "0.5rem", padding: "0.5rem", background: "#eee" }}>
                      <strong>Select a bench team to swap with:</strong>
                      {bench.filter(Boolean).map(benchTeam => (
                        <div key={benchTeam.id}>
                          <button onClick={() => handleSwap(idx, benchTeam)}>
                            {benchTeam.school} ({benchTeam.conference})
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div style={{ color: "#888" }}><em>Empty Slot</em></div>
              )}
            </div>
          );
        })}
      </div>

      <div>
        <h3>Bench</h3>
        {Array.from({ length: 2 }).map((_, idx) => {
          const team = bench[idx];
          return (
            <div
              key={idx}
              style={{
                padding: "0.5rem",
                borderBottom: "1px solid #ddd",
                backgroundColor: "#f9f9f9",
                marginBottom: "0.25rem",
                minHeight: "4rem",
                position: "relative"
              }}
            >
              {team ? (
                <>
                  <strong>{team.school}</strong> ({team.conference})
                  <br />
                  Record: {team.currentSeason?.record} | Conf: {team.currentSeason?.confRecord}
                  <br />
                  Next: {team.currentSeason?.nextOpponent} ({team.currentSeason?.nextOpponentSpread})
                  <br />
                  Game Points: {team.currentSeason?.gamePoints ?? 0}
                  <Link
                    to={`/cut/${leagueId}/${encodeURIComponent(team.school)}`}
                    style={{
                      position: "absolute",
                      right: "1rem",
                      top: "0.5rem",
                      backgroundColor: "#f44336",
                      color: "#fff",
                      border: "none",
                      padding: "0.25rem 0.5rem",
                      cursor: "pointer",
                      textDecoration: "none",
                      borderRadius: "4px"
                    }}
                  >
                    ❌ Cut
                  </Link>
                </>
              ) : (
                <div style={{ color: "#888" }}><em>Empty Slot</em></div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default MyLineup;
