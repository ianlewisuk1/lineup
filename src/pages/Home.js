import React, { useEffect, useState } from "react";
import { auth, db } from "../firebase/firebase";
import { doc, getDoc } from "firebase/firestore";
import { useNavigate } from "react-router-dom";

function Home() {
  const [leagueList, setLeagueList] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchLeagues = async () => {
      const currentUser = auth.currentUser;
      if (!currentUser) return;

      const userRef = doc(db, "users", currentUser.uid);
      const userSnap = await getDoc(userRef);
      const leagueIds = userSnap.data()?.leagueIds || [];

      const leaguesData = [];
      for (let leagueId of leagueIds) {
        const leagueRef = doc(db, "leagues", leagueId);
        const leagueSnap = await getDoc(leagueRef);
        if (leagueSnap.exists()) {
          leaguesData.push({ id: leagueId, ...leagueSnap.data() });
        }
      }

      setLeagueList(leaguesData);
    };

    fetchLeagues();
  }, []);

  return (
    <div>
      <h2>My Leagues</h2>
      {leagueList.length === 0 ? (
        <p>You are not part of any leagues yet.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0 }}>
          {leagueList.map((league) => (
            <li key={league.id} style={{ margin: "10px 0" }}>
              <button onClick={() => navigate(`/league/${league.id}`)}>
                {league.name || "Unnamed League"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default Home;
