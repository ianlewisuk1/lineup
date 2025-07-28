import React, { useEffect, useState } from "react";
import { auth, db } from "../firebase/firebase";
import { doc, getDoc } from "firebase/firestore";
import { useNavigate, useLocation } from "react-router-dom";

function Home() {
  const [leagueList, setLeagueList] = useState([]);
  const [isAdmin, setIsAdmin] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();
  const flashMessage = location.state?.message;

  useEffect(() => {
    const fetchUserAndLeagues = async () => {
      const currentUser = auth.currentUser;
      if (!currentUser) return;

      const userRef = doc(db, "users", currentUser.uid);
      const userSnap = await getDoc(userRef);
      const userData = userSnap.data();
      const adminStatus = userData?.isAdmin || false;
      setIsAdmin(adminStatus);

      if (adminStatus) {
        navigate("/admin");
        return;
      }

      const leagueIds = userData?.leagueIds || [];
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

    fetchUserAndLeagues();
  }, [navigate]);

  if (isAdmin) return null;

  return (
    <div>
      {flashMessage && (
        <div style={{ padding: "10px", backgroundColor: "#d4edda", color: "#155724", marginBottom: "1rem", borderRadius: "4px" }}>
          {flashMessage}
        </div>
      )}

      <h2>My Leagues</h2>
      {leagueList.length === 0 ? (
        <p>You are not part of any leagues yet.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0 }}>
          {leagueList.map((league) => (
            <li key={league.id} style={{ margin: "10px 0" }}>
              <button onClick={() => navigate(`/${league.id}/my-lineup`)}>
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
