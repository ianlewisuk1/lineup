import { Outlet, Navigate } from "react-router-dom";
import { LeagueProvider, useLeague } from "../context/LeagueContext";
import { DraftProvider, useDraftContext } from "../context/DraftContext";
import SplashScreen from "./SplashScreen";

function LeagueLayoutInner() {
  const { loading: leagueLoading, unavailable } = useLeague();
  const { loading: draftLoading } = useDraftContext();

  if (leagueLoading || draftLoading) return <SplashScreen />;

  // The league was deleted, or belongs to someone else and RLS hides it. Either
  // way the child pages have nothing to render, so send the user home instead of
  // letting them fail one query at a time.
  if (unavailable) return <Navigate to="/home" replace />;

  return <Outlet />;
}

function LeagueLayout() {
  return (
    <LeagueProvider>
      <DraftProvider>
        <LeagueLayoutInner />
      </DraftProvider>
    </LeagueProvider>
  );
}

export default LeagueLayout;
