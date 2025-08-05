import React, { useEffect, useState, useRef } from "react";
import { auth, db } from "../firebase/firebase";
import { doc, onSnapshot } from "firebase/firestore";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { Trophy, Users, ArrowRight, Plus, Wifi, WifiOff } from "lucide-react";

function Home() {
  const [leagueList, setLeagueList] = useState([]);
  const [isAdmin, setIsAdmin] = useState(null);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState("");
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [refreshing, setRefreshing] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const flashMessage = location.state?.message;
  
  // Refs to store unsubscribe functions
  const userListener = useRef(null);
  const leagueListeners = useRef([]);

  // Connection status tracking
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

  // Cleanup listeners on unmount
  useEffect(() => {
    return () => {
      if (userListener.current) {
        userListener.current();
      }
      if (leagueListeners.current) {
        leagueListeners.current.forEach(unsubscribe => unsubscribe());
      }
    };
  }, []);

  useEffect(() => {
    const setupUserListener = () => {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        setLoading(false);
        return;
      }

      try {
        const userRef = doc(db, "users", currentUser.uid);
        
        // Set up real-time listener for user data
        userListener.current = onSnapshot(userRef, (userSnap) => {
          if (!userSnap.exists()) {
            setLoading(false);
            return;
          }
          
          const userData = userSnap.data();
          const adminStatus = userData?.isAdmin || false;
          setIsAdmin(adminStatus);

          // Set user name for greeting
          if (userData?.firstName) {
            setUserName(userData.firstName);
          } else {
            setUserName(currentUser.email?.split('@')[0] || 'there');
          }

          if (adminStatus) {
            navigate("/admin");
            return;
          }

          // Set up listeners for each league
          const leagueIds = userData?.leagueIds || [];
          setupLeagueListeners(leagueIds);
          setLoading(false);
        }, (error) => {
          console.error("Error with user listener:", error);
          setLoading(false);
        });

      } catch (error) {
        console.error("Error setting up user listener:", error);
        setLoading(false);
      }
    };

    const setupLeagueListeners = (leagueIds) => {
      // Clean up existing league listeners
      if (leagueListeners.current) {
        leagueListeners.current.forEach(unsubscribe => unsubscribe());
        leagueListeners.current = [];
      }

      // Clear league list if no leagues
      if (leagueIds.length === 0) {
        setLeagueList([]);
        return;
      }

      // Set up listener for each league
      leagueIds.forEach(leagueId => {
        const leagueRef = doc(db, "leagues", leagueId);
        
        const unsubscribe = onSnapshot(leagueRef, (leagueSnap) => {
          if (leagueSnap.exists()) {
            const leagueData = leagueSnap.data();
            const memberCount = leagueData.members ? leagueData.members.length : 0;
            
            const updatedLeague = { 
              id: leagueId, 
              ...leagueData, 
              memberCount: memberCount 
            };

            // Update the specific league in the list
            setLeagueList(prev => {
              const filtered = prev.filter(league => league.id !== leagueId);
              const newList = [...filtered, updatedLeague];
              // Sort by name for consistent ordering
              return newList.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
            });
          } else {
            // Remove league if it no longer exists
            setLeagueList(prev => prev.filter(league => league.id !== leagueId));
          }
        }, (error) => {
          console.error(`Error with league listener for ${leagueId}:`, error);
        });

        leagueListeners.current.push(unsubscribe);
      });
    };

    setupUserListener();
  }, [navigate]);

  const handleLogout = async () => {
    if (window.confirm("Are you sure you want to log out?")) {
      try {
        // Clean up listeners before logout
        if (userListener.current) {
          userListener.current();
        }
        if (leagueListeners.current) {
          leagueListeners.current.forEach(unsubscribe => unsubscribe());
        }
        
        await auth.signOut();
        navigate("/");
      } catch (err) {
        console.error("Logout error:", err);
      }
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    // Listeners will automatically update, just show feedback
    setTimeout(() => setRefreshing(false), 1000);
  };

  if (isAdmin) return null;

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-4 sm:left-10 w-48 sm:w-72 h-48 sm:h-72 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full blur-3xl animate-pulse"></div>
        </div>
        <div className="relative z-10 flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="text-4xl mb-4 animate-spin">⚡</div>
            <p className="text-xl text-white/80">Loading your leagues...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white">
      {/* Animated Background Elements */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-20 left-4 sm:left-10 w-48 sm:w-72 h-48 sm:h-72 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-20 right-4 sm:right-10 w-56 sm:w-96 h-56 sm:h-96 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full blur-3xl animate-pulse delay-1000"></div>
      </div>

      {/* Connection Status Indicator */}
      {!isOnline && (
        <div className="relative z-20 bg-red-500/90 text-white text-center py-2 px-4 text-sm font-medium">
          <WifiOff size={16} className="inline mr-2" />
          You're offline. Updates will sync when reconnected.
        </div>
      )}

      {/* Navigation */}
      <nav className="relative z-10 flex justify-between items-center p-4 sm:p-6 lg:p-8">
        <Link to="/home" className="flex items-center space-x-3">
          <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-r from-purple-500 to-blue-500 rounded-lg flex items-center justify-center font-bold text-lg sm:text-xl">
            L
          </div>
          <span className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
            Lineup
          </span>
        </Link>
        <div className="flex items-center space-x-4">
          {/* Refresh Button for Mobile */}
          <button 
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-2 text-white/60 hover:text-white transition-colors duration-300 md:hidden"
            aria-label="Refresh"
          >
            <div className={refreshing ? "animate-spin" : ""}>
              ⟳
            </div>
          </button>
          
          {/* Connection Status */}
          <div className="hidden sm:flex items-center space-x-2 text-white/60">
            {isOnline ? (
              <Wifi size={16} className="text-green-400" />
            ) : (
              <WifiOff size={16} className="text-red-400" />
            )}
          </div>
          
          <button 
            onClick={handleLogout}
            className="px-4 py-2 text-sm sm:text-base text-white/80 hover:text-white transition-colors duration-300 font-medium"
          >
            Logout
          </button>
        </div>
      </nav>

      {/* Main Content */}
      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        {/* Header */}
        <div className="text-center mb-8 sm:mb-12">
          <div className="mb-4 sm:mb-6">
            <span className="inline-block text-4xl sm:text-5xl mb-2 sm:mb-4">🏆</span>
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black mb-4 leading-tight">
            <span className="text-white">Welcome back,</span>
            <br />
            <span className="bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
              {userName}!
            </span>
          </h1>
          <p className="text-lg sm:text-xl text-white/80 max-w-2xl mx-auto">
            Here are your fantasy leagues. Ready to dominate?
          </p>
        </div>

        {/* Flash Message */}
        {flashMessage && (
          <div className="mb-8 p-4 bg-green-500/20 border border-green-400/30 rounded-xl max-w-2xl mx-auto">
            <p className="text-green-200 text-center font-medium">{flashMessage}</p>
          </div>
        )}

        {/* Pull to Refresh Indicator */}
        {refreshing && (
          <div className="mb-4 text-center">
            <div className="inline-flex items-center px-4 py-2 bg-white/10 rounded-full text-white/80 text-sm">
              <div className="animate-spin mr-2">⟳</div>
              Refreshing...
            </div>
          </div>
        )}

        {/* Leagues Section */}
        {leagueList.length === 0 ? (
          // No Leagues - Getting Started
          <div className="space-y-8">
            <div className="text-center mb-8">
              <h2 className="text-2xl sm:text-3xl font-bold mb-4 text-white">
                Get Started
              </h2>
              <p className="text-white/70 max-w-md mx-auto">
                You're not in any leagues yet. Create your own or join an existing one to start playing!
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
              {/* Create League Card */}
              <div 
                onClick={() => navigate("/create-league")}
                className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 border border-white/20 hover:bg-white/20 transition-all duration-300 transform hover:-translate-y-2 cursor-pointer group active:scale-95"
              >
                <div className="text-center">
                  <div className="w-16 h-16 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform duration-300">
                    <Trophy size={32} className="text-white" />
                  </div>
                  
                  <h3 className="text-2xl font-bold text-white mb-4">
                    Create a League
                  </h3>
                  <p className="text-white/80 mb-6 leading-relaxed">
                    Start your own fantasy league and invite friends to compete. You'll be the commissioner!
                  </p>
                  
                  <div className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full text-white font-semibold group-hover:from-purple-600 group-hover:to-blue-600 transition-all duration-300">
                    Get Started
                    <ArrowRight size={16} className="ml-2" />
                  </div>
                </div>
              </div>

              {/* Join League Card */}
              <div 
                onClick={() => navigate("/join-league")}
                className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 border border-white/20 hover:bg-white/20 transition-all duration-300 transform hover:-translate-y-2 cursor-pointer group active:scale-95"
              >
                <div className="text-center">
                  <div className="w-16 h-16 bg-gradient-to-r from-green-500 to-emerald-500 rounded-full flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform duration-300">
                    <Users size={32} className="text-white" />
                  </div>
                  
                  <h3 className="text-2xl font-bold text-white mb-4">
                    Join a League
                  </h3>
                  <p className="text-white/80 mb-6 leading-relaxed">
                    Got an invite code? Join an existing fantasy league and start competing right away!
                  </p>
                  
                  <div className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-500 rounded-full text-white font-semibold group-hover:from-green-600 group-hover:to-emerald-600 transition-all duration-300">
                    Join Now
                    <ArrowRight size={16} className="ml-2" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          // Has Leagues
          <div className="space-y-8">
            <div className="text-center">
              <h2 className="text-2xl sm:text-3xl font-bold mb-4 text-white">
                Your Leagues
                {isOnline && (
                  <span className="ml-2 inline-block w-2 h-2 bg-green-400 rounded-full animate-pulse" title="Live updates enabled"></span>
                )}
              </h2>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {leagueList.map((league) => (
                <div 
                  key={league.id}
                  onClick={() => navigate(`/${league.id}/my-lineup`)}
                  className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20 hover:bg-white/20 transition-all duration-300 transform hover:-translate-y-2 cursor-pointer group active:scale-95"
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-3">
                      <div className="w-12 h-12 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full flex items-center justify-center text-white font-bold">
                        {(league.name || "UL").substring(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-white">
                          {league.name || "Unnamed League"}
                        </h3>
                        <p className="text-xs text-white/60 truncate">
                          ID: {league.id}
                        </p>
                      </div>
                    </div>
                    <ArrowRight size={20} className="text-white/60 group-hover:text-white transition-colors duration-300" />
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <div className="text-xs text-white/60 uppercase tracking-wide mb-1">
                        Members
                      </div>
                      <div className="text-lg font-bold text-white">
                        {league.memberCount || "—"}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-white/60 uppercase tracking-wide mb-1">
                        Season
                      </div>
                      <div className="text-lg font-bold text-white">
                        2025
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/${league.id}/my-lineup`);
                    }}
                    className="w-full py-3 px-4 bg-white/10 border border-white/20 rounded-xl text-white font-medium hover:bg-white/20 transition-all duration-300 flex items-center justify-center space-x-2 active:scale-95"
                  >
                    <span>View My Lineup</span>
                    <ArrowRight size={16} />
                  </button>
                </div>
              ))}

              {/* Add New League Cards */}
              <div 
                onClick={() => navigate("/create-league")}
                className="bg-white/5 backdrop-blur-lg rounded-2xl p-6 border-2 border-dashed border-white/30 hover:border-white/60 hover:bg-white/10 transition-all duration-300 transform hover:-translate-y-2 cursor-pointer group active:scale-95"
              >
                <div className="text-center">
                  <div className="w-12 h-12 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform duration-300">
                    <Plus size={24} className="text-white" />
                  </div>
                  
                  <h3 className="text-lg font-bold text-white mb-2">
                    Create League
                  </h3>
                  <p className="text-white/60 text-sm mb-4">
                    Start a new fantasy league
                  </p>
                  
                  <div className="text-purple-400 font-medium text-sm">
                    Get Started
                  </div>
                </div>
              </div>

              <div 
                onClick={() => navigate("/join-league")}
                className="bg-white/5 backdrop-blur-lg rounded-2xl p-6 border-2 border-dashed border-white/30 hover:border-white/60 hover:bg-white/10 transition-all duration-300 transform hover:-translate-y-2 cursor-pointer group active:scale-95"
              >
                <div className="text-center">
                  <div className="w-12 h-12 bg-gradient-to-r from-green-500 to-emerald-500 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform duration-300">
                    <Users size={24} className="text-white" />
                  </div>
                  
                  <h3 className="text-lg font-bold text-white mb-2">
                    Join League
                  </h3>
                  <p className="text-white/60 text-sm mb-4">
                    Got an invite code?
                  </p>
                  
                  <div className="text-green-400 font-medium text-sm">
                    Join Now
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Home;