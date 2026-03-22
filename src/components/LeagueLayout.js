import { Outlet } from "react-router-dom";
import { LeagueProvider } from "../context/LeagueContext";
import { useLeague } from "../context/LeagueContext";

function LeagueLayoutInner() {
  const { loading } = useLeague();

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 32, height: 32, borderRadius: '50%', border: '2.5px solid #0072BC', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
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
