import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { db } from "../firebase/firebase";
import { collection, getDocs } from "firebase/firestore";
import LeagueNavBar from "../components/LeagueNavBar";

function MyLeague() {
  const { leagueId } = useParams();
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMembers = async () => {
      try {
        console.log("Using leagueId:", leagueId); // DEBUG

        const membersRef = collection(db, "leagues", leagueId, "members");
        const snapshot = await getDocs(membersRef);
        const membersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        console.log("Fetched members:", membersData); // DEBUG

        setMembers(membersData);
        setLoading(false);
      } catch (error) {
        console.error("Error fetching members:", error);
      }
    };

    fetchMembers();
  }, [leagueId]);

  if (loading) return <p>Loading...</p>;

  // Sort by wins descending, then points if you have them
  const sortedMembers = [...members].sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (b.points !== a.points) return b.points - a.points;
    return 0;
  });

  return (
    <div style={{ padding: "1rem" }}>
      <LeagueNavBar />

      <h2>League Standings</h2>
      {sortedMembers.length === 0 ? (
        <p>No members found in this league.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Team</th>
              <th>Wins</th>
              <th>Losses</th>
              <th>Points</th>
            </tr>
          </thead>
          <tbody>
            {sortedMembers.map((member, idx) => (
              <tr key={member.id}>
                <td>{idx + 1}</td>
                <td>{member.teamName || "Unnamed Team"}</td>
                <td>{member.wins ?? 0}</td>
                <td>{member.losses ?? 0}</td>
                <td>{member.points ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2 style={{ marginTop: "2rem" }}>National Comparison</h2>
      <p>(Coming soon...)</p>
    </div>
  );
}

export default MyLeague;
