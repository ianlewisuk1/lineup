import React, { useEffect, useState } from "react";
import { useParams, Navigate } from "react-router-dom";
import { supabase } from "../supabase/supabase";

function PreDraftOnly({ children }) {
  const { leagueId } = useParams();
  const [isLoading, setIsLoading] = useState(true);
  const [draftStarted, setDraftStarted] = useState(false);

  useEffect(() => {
    const checkDraft = async () => {
      const { data } = await supabase.from("leagues").select("*").eq("id", leagueId).single();
      setDraftStarted(data?.draft?.started || false);
      setIsLoading(false);
    };
    checkDraft();
  }, [leagueId]);

  if (isLoading) return <p>Checking draft status...</p>;
  return draftStarted ? <Navigate to={`/home`} /> : children;
}

export default PreDraftOnly;
