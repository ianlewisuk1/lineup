import { useParams, Navigate } from "react-router-dom";
import { useLeague } from "../context/LeagueContext";

function DraftGuard({ children }) {
  const { leagueId } = useParams();
  const { isDraftComplete, loading } = useLeague();

  if (loading) return null;
  if (!isDraftComplete) return <Navigate to={`/${leagueId}/draft-room`} />;
  return children;
}

export default DraftGuard;
