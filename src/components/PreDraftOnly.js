import React, { useEffect, useState } from "react";
import { useParams, Navigate } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase/firebase";

function PreDraftOnly({ children }) {
  const { leagueId } = useParams();
  const [isLoading, setIsLoading] = useState(true);
  const [draftStarted, setDraftStarted] = useState(false);

  useEffect(() => {
    const checkDraft = async () => {
      const ref = doc(db, "leagues", leagueId);
      const snap = await getDoc(ref);
      setDraftStarted(snap.data()?.draft?.started || false);
      setIsLoading(false);
    };
    checkDraft();
  }, [leagueId]);

  if (isLoading) return <p>Checking draft status...</p>;
  return draftStarted ? <Navigate to={`/home`} /> : children;
}

export default PreDraftOnly;
