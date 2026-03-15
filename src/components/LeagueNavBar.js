import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "../supabase/supabase";

function LeagueNavBar() {
  const { leagueId } = useParams();
  const [draftComplete, setDraftComplete] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDraftStatus = async () => {
      try {
        const { data: leagueData } = await supabase.from('leagues').select('draft_complete').eq('id', leagueId).single();
        setDraftComplete(leagueData?.draft_complete || false);
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
          <Link to={`/${leagueId}/members`}>Members</Link> {" | "}
          <Link to={`/${leagueId}/draft-room`}>Draft Room</Link> {" | "}
          <Link to={`/${leagueId}/league-rules`}>League Rules</Link> {" | "}
          <Link to={`/${leagueId}/my-league`}>My League</Link>
        </>
      ) : (
        <>
          <Link to={`/${leagueId}/draft-room`}>Draft Room</Link> {" | "}
          <Link to={`/${leagueId}/members`}>Members</Link> {" | "}
          <Link to={`/${leagueId}/scouting`}>Scouting</Link> {" | "}
          <Link to={`/${leagueId}/league-rules`}>League Rules</Link>
        </>
      )}
    </nav>
  );
}

export default LeagueNavBar;
