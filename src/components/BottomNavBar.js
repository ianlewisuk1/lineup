import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

function BottomNavBar({ leagueId, isDraftComplete = false }) {
  const location = useLocation();
  const navigate = useNavigate();

  // Pre/During Draft Navigation
  const preDraftNav = [
    {
      key: 'scouting',
      label: 'Scouting',
      icon: '🔍',
      path: `/${leagueId}/scouting`
    },
    {
      key: 'draft-room',
      label: 'Draft Room',
      icon: '🏈',
      path: `/${leagueId}/draft-room`
    },
    {
      key: 'league-rules',
      label: 'League Rules',
      icon: '📋',
      path: `/${leagueId}/league-rules`
    }
  ];

  // Post Draft Navigation  
  const postDraftNav = [
    {
      key: 'my-lineup',
      label: 'My Lineup',
      icon: '👤',
      path: `/${leagueId}/my-lineup`
    },
    {
      key: 'my-league',
      label: 'My League',
      icon: '🏆',
      path: `/${leagueId}/my-league`
    },
    {
      key: 'stats',
      label: 'Stats',
      icon: '📊',
      path: `/${leagueId}/stats`
    },
    {
      key: 'free-agents',
      label: 'Free Agents',
      icon: '🆓',
      path: `/${leagueId}/free-agents`
    },
    {
      key: 'draft-room',
      label: 'Draft Room',
      icon: '🏈',
      path: `/${leagueId}/draft-room`
    }
  ];

  const navItems = isDraftComplete ? postDraftNav : preDraftNav;

  const isActiveTab = (path) => {
    return location.pathname === path;
  };

  const handleNavigation = (path) => {
    navigate(path);
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50">
      {/* Background with blur effect */}
      <div className="bg-slate-900/90 backdrop-blur-lg border-t border-white/20">
        <div className="max-w-md mx-auto px-2 py-2">
          <div className={`grid gap-1 ${navItems.length === 3 ? 'grid-cols-3' : 'grid-cols-5'}`}>
            {navItems.map((item) => {
              const isActive = isActiveTab(item.path);
              
              return (
                <button
                  key={item.key}
                  onClick={() => handleNavigation(item.path)}
                  className={`
                    flex flex-col items-center justify-center py-3 px-2 rounded-lg transition-all duration-300 transform
                    ${isActive 
                      ? 'bg-gradient-to-r from-purple-500 to-blue-500 text-white scale-105 shadow-lg' 
                      : 'text-white/70 hover:text-white hover:bg-white/10'
                    }
                  `}
                >
                  <span className="text-lg mb-1">{item.icon}</span>
                  <span className={`text-xs font-medium leading-tight text-center ${
                    navItems.length === 5 ? 'text-[10px]' : 'text-xs'
                  }`}>
                    {item.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export default BottomNavBar;