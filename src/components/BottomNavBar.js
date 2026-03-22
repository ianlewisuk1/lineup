import React from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useLeague } from '../context/LeagueContext';
import { User, Trophy, BarChart2, UserPlus, Zap, Search, Users, FileText } from 'lucide-react';

function BottomNavBar() {
  const { leagueId } = useParams();
  const { isDraftComplete, loading } = useLeague();
  const location = useLocation();
  const navigate = useNavigate();

  if (loading) return null;

  const preDraftNav = [
    { key: 'scouting',     label: 'Scouting',    icon: Search,   path: `/${leagueId}/scouting` },
    { key: 'draft-room',   label: 'Draft Room',  icon: Zap,      path: `/${leagueId}/draft-room` },
    { key: 'members',      label: 'Members',     icon: Users,    path: `/${leagueId}/members` },
    { key: 'league-rules', label: 'Rules',       icon: FileText, path: `/${leagueId}/league-rules` },
  ];

  const postDraftNav = [
    { key: 'my-lineup',   label: 'My Lineup',   icon: User,     path: `/${leagueId}/my-lineup` },
    { key: 'my-league',   label: 'My League',   icon: Trophy,   path: `/${leagueId}/my-league` },
    { key: 'stats',       label: 'Stats',       icon: BarChart2,path: `/${leagueId}/stats` },
    { key: 'free-agents', label: 'Free Agents', icon: UserPlus, path: `/${leagueId}/free-agents` },
    { key: 'draft-room',  label: 'Draft',       icon: Zap,      path: `/${leagueId}/draft-room` },
  ];

  const navItems = isDraftComplete ? postDraftNav : preDraftNav;
  const cols = navItems.length;

  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
      backgroundColor: '#ffffff',
      borderTop: '1px solid #F3F4F6',
      paddingBottom: 'env(safe-area-inset-bottom)',
    }}>
      <div style={{
        maxWidth: 480, margin: '0 auto',
        display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`,
        padding: '4px 8px',
      }}>
        {navItems.map(({ key, label, icon: Icon, path }) => {
          const isActive = location.pathname === path;
          return (
            <button
              key={key}
              onClick={() => navigate(path)}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                padding: '10px 4px', border: 'none', background: 'none', cursor: 'pointer',
                borderRadius: 12, transition: 'background 0.15s',
                color: isActive ? '#0072BC' : '#9CA3AF',
              }}
            >
              <Icon size={22} strokeWidth={isActive ? 2.5 : 1.8} />
              <span style={{
                fontSize: cols >= 5 ? 9 : 10,
                fontWeight: isActive ? 700 : 500,
                marginTop: 4,
                letterSpacing: 0.1,
              }}>
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default BottomNavBar;
