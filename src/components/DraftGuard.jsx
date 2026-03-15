import React, { useEffect, useState } from "react";
import { useParams, Navigate } from "react-router-dom";
import { supabase } from "../supabase/supabase";

function DraftGuard({ children }) {
  const { leagueId } = useParams();
  const [loading, setLoading] = useState(true);
  const [draftComplete, setDraftComplete] = useState(false);

  useEffect(() => {
    const checkDraftStatus = async () => {
      try {
        const { data } = await supabase
          .from("drafts")
          .select("is_complete")
          .eq("league_id", leagueId)
          .single();
        setDraftComplete(data?.is_complete === true);
      } catch (err) {
        console.error("Error checking draft status:", err);
      } finally {
        setLoading(false);
      }
    };
    checkDraftStatus();
  }, [leagueId]);

  if (loading) return <p>Checking draft status...</p>;
  if (!draftComplete) return <Navigate to={`/${leagueId}/draft-room`} />;
  return children;
}

export default DraftGuard;
