import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase/firebase";

function LeagueNavBar() {
  const { leagueId } = useParams();
  const [draftComplete, setDraftComplete] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDraftStatus = async () => {
      try {
        const draftRef = doc(db, "leagues", leagueId, "meta", "draft");
        const draftSnap = await getDoc(draftRef);
        const draftData = draftSnap.data();
        setDraftComplete(draftData?.draftComplete || false);
      } catch (err) {
        console.error("Error fetching draft status:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchDraftStatus();
  }, [leagueId]);

  if (loading) return null;

  return (
    <nav style={{ marginBottom: "10px" }}>
      {draftComplete ? (
        <>
          <Link to={`/${leagueId}/my-lineup`}>My Lineup</Link> {" | "}
          <Link to={`/${leagueId}/free-agents`}>Free Agents</Link> {" | "}
          <Link to={`/${leagueId}/stats`}>Stats</Link> {" | "}
          <Link to={`/${leagueId}/draft-room`}>Draft Room</Link> {" | "}
          <Link to={`/${leagueId}/league-rules`}>League Rules</Link> {" | "}
          <Link to={`/${leagueId}/my-league`}>My League</Link>
        </>
      ) : (
        <>
          <Link to={`/${leagueId}/draft-room`}>Draft Room</Link> {" | "}
          <Link to={`/${leagueId}/scouting`}>Scouting</Link> {" | "}
          <Link to={`/${leagueId}/league-rules`}>League Rules</Link>
        </>
      )}
    </nav>
  );
}

export default LeagueNavBar;
