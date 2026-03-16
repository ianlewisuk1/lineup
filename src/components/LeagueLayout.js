import { Outlet } from "react-router-dom";
import { LeagueProvider } from "../context/LeagueContext";
import { useLeague } from "../context/LeagueContext";

function LeagueLayoutInner() {
  const { loading } = useLeague();

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return <Outlet />;
}

function LeagueLayout() {
  return (
    <LeagueProvider>
      <LeagueLayoutInner />
    </LeagueProvider>
  );
}

export default LeagueLayout;
