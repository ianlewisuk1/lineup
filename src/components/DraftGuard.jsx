import React, { useEffect, useState } from "react";
import { useParams, Navigate } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase/firebase";

function DraftGuard({ children }) {
  const { leagueId } = useParams();
  const [loading, setLoading] = useState(true);
  const [draftComplete, setDraftComplete] = useState(false);

  useEffect(() => {
    const checkDraftStatus = async () => {
      try {
        const draftRef = doc(db, "leagues", leagueId, "meta", "draft");
        const draftSnap = await getDoc(draftRef);
        setDraftComplete(draftSnap.exists() && draftSnap.data().draftComplete === true);
      } catch (err) {
        console.error("Error checking draft status:", err);
      } finally {
        setLoading(false);
      }
    };

    checkDraftStatus();
  }, [leagueId]);

  if (loading) return <p>Checking draft status...</p>;

  if (!draftComplete) {
    return <Navigate to={`/${leagueId}/draft-room`} />;
  }

  return children;
}

export default DraftGuard;
