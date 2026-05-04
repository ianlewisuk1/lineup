import { Outlet } from "react-router-dom";
import { LeagueProvider, useLeague } from "../context/LeagueContext";
import { DraftProvider, useDraftContext } from "../context/DraftContext";
import SplashScreen from "./SplashScreen";

function LeagueLayoutInner() {
  const { loading: leagueLoading } = useLeague();
  const { loading: draftLoading } = useDraftContext();

  if (leagueLoading || draftLoading) return <SplashScreen />;

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
