import React, { useEffect, useState, useRef } from "react";
import { supabase } from "../supabase/supabase";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { Trophy, Users, ArrowRight, Plus, WifiOff } from "lucide-react";
import { SEASON_YEAR } from "../utils/season";
import ProfileDropdown from "../components/ProfileDropdown";
import logoWordmark from "../assets/logo-wordmark-transparent.png";

function Home() {
  const [leagueList, setLeagueList] = useState([]);
  const [isAdmin, setIsAdmin] = useState(null);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState("");
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const navigate = useNavigate();
  const location = useLocation();
  const flashMessage = location.state?.message;
  const userChannel = useRef(null);
  const leagueChannels = useRef([]);

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

  useEffect(() => {
    return () => {
      if (userChannel.current) supabase.removeChannel(userChannel.current);
      leagueChannels.current.forEach(ch => supabase.removeChannel(ch));
    };
  }, []);

  useEffect(() => {
    const setupUserListener = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      try {
        const { data: userData, error: userError } = await supabase
          .from('users').select('*').eq('id', user.id).single();

        if (userError || !userData) { setLoading(false); return; }

        const adminStatus = userData?.is_admin || false;
        setIsAdmin(adminStatus);
        setUserName(userData?.first_name || user.email?.split('@')[0] || 'there');

        if (adminStatus) { navigate("/admin"); return; }

        const { data: memberRows } = await supabase
          .from('league_members').select('league_id').eq('user_id', user.id);

        const leagueIds = (memberRows || []).map(row => row.league_id);
        await setupLeagueListeners(leagueIds, user.id);
        setLoading(false);

        userChannel.current = supabase
          .channel(`user-${user.id}`)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'users', filter: `id=eq.${user.id}` },
            async (payload) => {
              const updatedUser = payload.new;
              if (updatedUser?.is_admin) { navigate("/admin"); return; }
              if (updatedUser?.first_name) setUserName(updatedUser.first_name);
            })
          .subscribe();

      } catch (error) {
        setLoading(false);
      }
    };

    const setupLeagueListeners = async (leagueIds, userId) => {
      leagueChannels.current.forEach(ch => supabase.removeChannel(ch));
      leagueChannels.current = [];

      if (leagueIds.length === 0) { setLeagueList([]); return; }

      const { data: leaguesData } = await supabase.from('leagues').select('*').in('id', leagueIds);
      const { data: allMemberRows } = await supabase.from('league_members').select('league_id').in('league_id', (leaguesData || []).map(l => l.id));
      const countByLeague = {};
      (allMemberRows || []).forEach(m => { countByLeague[m.league_id] = (countByLeague[m.league_id] || 0) + 1; });
      const leaguesWithCounts = (leaguesData || []).map(league => ({ ...league, memberCount: countByLeague[league.id] || 0 }));
      setLeagueList(leaguesWithCounts.sort((a, b) => (a.name || "").localeCompare(b.name || "")));

      leagueIds.forEach(leagueId => {
        const ch = supabase
          .channel(`league-${leagueId}`)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'leagues', filter: `id=eq.${leagueId}` },
            async (payload) => {
              if (payload.eventType === 'DELETE') { setLeagueList(prev => prev.filter(l => l.id !== leagueId)); return; }
              const { count } = await supabase.from('league_members').select('*', { count: 'exact', head: true }).eq('league_id', leagueId);
              setLeagueList(prev => {
                const filtered = prev.filter(l => l.id !== leagueId);
                return [...filtered, { ...payload.new, memberCount: count || 0 }].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
              });
            })
          .subscribe();
        leagueChannels.current.push(ch);
      });
    };

    setupUserListener();
  }, [navigate]);

  const handleLogout = async () => {
    if (window.confirm("Are you sure you want to log out?")) {
      if (userChannel.current) supabase.removeChannel(userChannel.current);
      leagueChannels.current.forEach(ch => supabase.removeChannel(ch));
      await supabase.auth.signOut();
      navigate("/");
    }
  };

  if (isAdmin) return null;

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 32, height: 32, borderRadius: '50%', border: '2.5px solid #0072BC', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#F9FAFB', paddingBottom: 80 }}>

      {/* Offline banner */}
      {!isOnline && (
        <div style={{ backgroundColor: '#FEF2F2', borderBottom: '1px solid #FECACA', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <WifiOff size={14} color="#DC2626" />
          <span style={{ fontSize: 13, color: '#DC2626', fontWeight: 500 }}>You're offline. Updates will sync when reconnected.</span>
        </div>
      )}

      {/* Nav */}
      <nav style={{ backgroundColor: '#ffffff', borderBottom: '1px solid #F3F4F6', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px', position: 'sticky', top: 0, zIndex: 40 }}>
        <Link to="/home"><img src={logoWordmark} alt="Lineup" style={{ width: 'clamp(80px, 20vw, 140px)' }} /></Link>
        <ProfileDropdown />
      </nav>

      {/* Content */}
      <div style={{ maxWidth: 600, margin: '0 auto', padding: '24px 16px' }}>

        {/* Greeting */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 24, fontWeight: 900, color: '#111827', margin: 0 }}>
            Welcome back, {userName}
          </h1>
          <p style={{ fontSize: 14, color: '#6B7280', marginTop: 4 }}>
            {leagueList.length === 0 ? "Get started by creating or joining a league." : `${SEASON_YEAR} season`}
          </p>
        </div>

        {/* Flash message */}
        {flashMessage && (
          <div style={{ backgroundColor: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 10, padding: '12px 16px', marginBottom: 20 }}>
            <p style={{ fontSize: 14, color: '#065F46', margin: 0 }}>{flashMessage}</p>
          </div>
        )}

        {leagueList.length === 0 ? (
          /* Empty state */
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
          /* League list */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Your leagues
              </span>
              {isOnline && <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: '#22C55E', display: 'inline-block' }} title="Live" />}
            </div>

            {leagueList.map(league => (
              <div
                key={league.id}
                onClick={() => navigate(`/${league.id}/my-lineup`)}
                style={{ backgroundColor: '#ffffff', border: '1.5px solid #F3F4F6', borderRadius: 16, padding: '16px 20px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 16 }}
              >
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
            ))}

            {/* Create / Join buttons */}
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
      </div>
    </div>
  );
}

export default Home;
