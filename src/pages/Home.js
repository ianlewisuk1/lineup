import React, { useEffect, useState } from "react";
import { supabase } from "../supabase/supabase";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { Trophy, Users, ArrowRight, Plus, WifiOff } from "lucide-react";
import { SEASON_YEAR } from "../utils/season";
import { useAuth } from "../context/AuthContext";
import ProfileDropdown from "../components/ProfileDropdown";
import CfbNewsBanner from "../components/CfbNewsBanner";
import WeeklyStatsWidget from "../components/WeeklyStatsWidget";
import logoWordmark from "../assets/logo-wordmark-transparent.png";

function Home() {
  // --- Session data from AuthContext (no extra DB queries needed) ---
  const { userData, currentUser } = useAuth();
  const isAdmin = userData?.is_admin || false;
  const userName = userData?.first_name || "";

  // --- Local state ---
  const [leagueList, setLeagueList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // --- Routing ---
  const navigate = useNavigate();
  const location = useLocation();
  const flashMessage = location.state?.message; // optional success banner passed via navigate(..., { state: { message } })

  // --- Effect 1: Online/offline detection ---
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // --- Effect 2: Redirect admin users immediately ---
  useEffect(() => {
    if (isAdmin) navigate("/admin");
  }, [isAdmin, navigate]);

  // --- Effect 3: Load league list ---
  // Fetches the leagues this user belongs to, plus member counts for each card.
  useEffect(() => {
    const loadLeagues = async () => {
      if (!currentUser) { setLoading(false); return; }

      // DB query 1: get league IDs this user belongs to
      const { data: memberRows } = await supabase
        .from('league_members').select('league_id').eq('user_id', currentUser.id);

      const leagueIds = (memberRows || []).map(r => r.league_id);
      if (leagueIds.length === 0) { setLeagueList([]); setLoading(false); return; }

      // DB query 2 + 3 in parallel: fetch league details and member counts simultaneously
      const [{ data: leaguesData }, { data: allMemberRows }] = await Promise.all([
        supabase.from('leagues').select('*').in('id', leagueIds),
        supabase.from('league_members').select('league_id').in('league_id', leagueIds),
      ]);

      // Count members per league and attach to each league object
      const countByLeague = {};
      (allMemberRows || []).forEach(m => { countByLeague[m.league_id] = (countByLeague[m.league_id] || 0) + 1; });
      const leaguesWithCounts = (leaguesData || []).map(league => ({ ...league, memberCount: countByLeague[league.id] || 0 }));
      setLeagueList(leaguesWithCounts.sort((a, b) => (a.name || "").localeCompare(b.name || "")));
      setLoading(false);
    };

    loadLeagues();
  }, []);

  // --- Early returns ---

  // Spinner shown while league list is loading
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 32, height: 32, borderRadius: '50%', border: '2.5px solid #0072BC', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // --- Render ---
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#F9FAFB', paddingBottom: 80 }}>

      {/* Offline banner — shown when browser reports no network connection */}
      {!isOnline && (
        <div style={{ backgroundColor: '#FEF2F2', borderBottom: '1px solid #FECACA', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <WifiOff size={14} color="#DC2626" />
          <span style={{ fontSize: 13, color: '#DC2626', fontWeight: 500 }}>You're offline. Updates will sync when reconnected.</span>
        </div>
      )}

      {/* Sticky top nav — logo links back to /home, ProfileDropdown handles edit profile + logout */}
      <nav style={{ backgroundColor: '#ffffff', borderBottom: '1px solid #F3F4F6', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px', position: 'sticky', top: 0, zIndex: 40 }}>
        <Link to="/home"><img src={logoWordmark} alt="Lineup" style={{ width: 'clamp(80px, 20vw, 140px)' }} /></Link>
        <ProfileDropdown />
      </nav>

      {/* Page content — max width 600px, centered */}
      <div style={{ maxWidth: 600, margin: '0 auto', padding: '24px 16px' }}>

        {/* Greeting — uses first_name from AuthContext; subtitle changes based on whether user has leagues */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 24, fontWeight: 900, color: '#111827', margin: 0 }}>
            Welcome back, {userName}
          </h1>
          <p style={{ fontSize: 14, color: '#6B7280', marginTop: 4 }}>
            {leagueList.length === 0 ? "Get started by creating or joining a league." : `${SEASON_YEAR} season`}
          </p>
        </div>

        {/* Flash message — optional green banner passed via router state (e.g. after creating a league) */}
        {flashMessage && (
          <div style={{ backgroundColor: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 10, padding: '12px 16px', marginBottom: 20 }}>
            <p style={{ fontSize: 14, color: '#065F46', margin: 0 }}>{flashMessage}</p>
          </div>
        )}

        {leagueList.length === 0 ? (
          /* Empty state — user has no leagues yet. Show prominent create + join CTAs */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div
              onClick={() => navigate("/create-league")}
              style={{ backgroundColor: '#0072BC', borderRadius: 16, padding: '24px 20px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 16 }}
            >
              <div style={{ width: 48, height: 48, borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Trophy size={24} color="#fff" />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 17, fontWeight: 700, color: '#fff' }}>Create a league</div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', marginTop: 2 }}>Start your own and invite friends</div>
              </div>
              <ArrowRight size={20} color="rgba(255,255,255,0.7)" />
            </div>

            <div
              onClick={() => navigate("/join-league")}
              style={{ backgroundColor: '#ffffff', border: '1.5px solid #E5E7EB', borderRadius: 16, padding: '24px 20px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 16 }}
            >
              <div style={{ width: 48, height: 48, borderRadius: '50%', backgroundColor: '#EFF8FF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Users size={24} color="#0072BC" />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 17, fontWeight: 700, color: '#111827' }}>Join a league</div>
                <div style={{ fontSize: 13, color: '#6B7280', marginTop: 2 }}>Got an invite code? Join now</div>
              </div>
              <ArrowRight size={20} color="#9CA3AF" />
            </div>
          </div>
        ) : (
          /* League list — user has at least one league. Each card navigates to that league's my-lineup page */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Your leagues
              </span>
              {/* Green dot indicates live network connection */}
              {isOnline && <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: '#22C55E', display: 'inline-block' }} title="Live" />}
            </div>

            {/* One card per league */}
            {leagueList.map(league => (
              <div
                key={league.id}
                style={{ backgroundColor: '#ffffff', border: '1.5px solid #F3F4F6', borderRadius: 16, overflow: 'hidden' }}
              >
                {/* Top row — league identity, tapping navigates to my-lineup */}
                <div
                  onClick={() => navigate(`/${league.id}/my-lineup`)}
                  style={{ padding: '16px 20px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 16 }}
                >
                  {/* League avatar — first 2 letters on blue background */}
                  <div style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: '#0072BC', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>{(league.name || "UL").substring(0, 2).toUpperCase()}</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {league.name || "Unnamed League"}
                    </div>
                    <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>
                      {league.memberCount || 0} / {league.max_managers || "—"} managers · {SEASON_YEAR}
                    </div>
                  </div>
                  <ArrowRight size={18} color="#D1D5DB" />
                </div>

                {/* Quick action buttons */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderTop: '1px solid #F3F4F6' }}>
                  <button
                    onClick={() => navigate(`/${league.id}/my-lineup`)}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '11px 0', backgroundColor: '#fff', border: 'none', borderRight: '1px solid #F3F4F6', color: '#0072BC', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
                  >
                    My Lineup
                  </button>
                  <button
                    onClick={() => navigate(`/${league.id}/my-league`)}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '11px 0', backgroundColor: '#fff', border: 'none', color: '#0072BC', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
                  >
                    Standings
                  </button>
                </div>
              </div>
            ))}

            {/* Secondary create/join buttons — for users who want to add another league */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 4 }}>
              <button
                onClick={() => navigate("/create-league")}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '12px 0', borderRadius: 12, border: '1.5px dashed #D1D5DB', backgroundColor: '#fff', color: '#6B7280', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
              >
                <Plus size={15} /> Create league
              </button>
              <button
                onClick={() => navigate("/join-league")}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '12px 0', borderRadius: 12, border: '1.5px dashed #D1D5DB', backgroundColor: '#fff', color: '#6B7280', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
              >
                <Users size={15} /> Join league
              </button>
            </div>
          </div>
        )}

        <div style={{ marginTop: 32 }}>
          <CfbNewsBanner />
        </div>

        <div style={{ marginTop: 32 }}>
          <WeeklyStatsWidget />
        </div>
      </div>
    </div>
  );
}

export default Home;
