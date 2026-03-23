import React, { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { supabase } from "../supabase/supabase";
import BottomNavBar from "../components/BottomNavBar";
import LeagueNav from "../components/LeagueNav";
import ScoringSystemModal from "../components/ScoringSystemModal";
import WeeklyLineupManager from "../components/WeeklyLineupManager";
import { useLeague } from "../context/LeagueContext";
import { Calendar, ChevronDown, ChevronUp } from "lucide-react";
import { SEASON_YEAR } from "../utils/season";

function MyLineup() {
  const { leagueId } = useParams();
  const navigate = useNavigate();
  const { currentUserId, members: ctxMembers } = useLeague();
  const [loading, setLoading] = useState(true);
  const [teamName, setTeamName] = useState("");
  const [smackTalk, setSmackTalk] = useState("");
  const [isEditingSmackTalk, setIsEditingSmackTalk] = useState(false);
  const [smackTalkSaving, setSmackTalkSaving] = useState(false);
  const [allTeams, setAllTeams] = useState({});
  const [squadPoints, setSquadPoints] = useState(0);
  const [currentWeek, setCurrentWeek] = useState(1);
  const [showScoringModal, setShowScoringModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [showScheduleGrid, setShowScheduleGrid] = useState(false);
  const [scheduleData, setScheduleData] = useState({});
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [weekNumbers, setWeekNumbers] = useState([]);
  const [userData, setUserData] = useState(null);
  const [migrationNeeded, setMigrationNeeded] = useState(false);
  const [currentWeekRank, setCurrentWeekRank] = useState(null);
  const [previousWeekRank, setPreviousWeekRank] = useState(null);
  const [rankChange, setRankChange] = useState(0);
  const [loadingRank, setLoadingRank] = useState(false);

  const getOrdinalSuffix = (rank) => {
    if (rank >= 11 && rank <= 13) return 'th';
    switch (rank % 10) {
      case 1: return 'st';
      case 2: return 'nd';
      case 3: return 'rd';
      default: return 'th';
    }
  };

  // New component for the ranking badge
  const RankingBadge = ({ currentRank, rankChange, loading }) => {
    if (loading) {
      return <div style={{ fontSize: 14, color: '#9CA3AF', marginTop: 4 }}>Loading rank...</div>;
    }

    if (!currentRank) {
      return <div style={{ fontSize: 14, color: '#0072BC', marginTop: 4 }}>Season Start</div>;
    }

    const getTrendIcon = (change) => {
      if (change < 0) return "↗"; // Improved (went up in rankings) 
      if (change > 0) return "↘"; // Declined (went down in rankings)
      return "→"; // No change
    };

    const getTrendColor = (change) => {
      if (change < 0) return "text-green-400"; // Improved
      if (change > 0) return "text-red-400"; // Declined  
      return "text-blue-400"; // No change
    };

    const formatChange = (change) => {
      if (change === 0) return "";
      return Math.abs(change).toString();
    };

    return (
      <div style={{ fontSize: 15, fontWeight: 700, color: '#0072BC', marginTop: 4 }}>
        {currentRank}{getOrdinalSuffix(currentRank)} Place
        {rankChange !== 0 && (
          <span style={{ marginLeft: 8, color: rankChange < 0 ? '#22C55E' : '#EF4444', fontSize: 13 }}>
            {getTrendIcon(rankChange)} {formatChange(rankChange)}
          </span>
        )}
      </div>
    );
  };

  // User Avatar Component with Points Badge
  const UserAvatar = ({ member, points = 0, size = 80 }) => {
    const avatarUrl = member?.teamAvatar;
    const isCustomUpload = avatarUrl && (avatarUrl.startsWith('http') || avatarUrl.startsWith('data:'));
    
    return (
      <div className="relative inline-block">
        {/* Main Avatar Circle */}
        <div 
          className="rounded-full flex items-center justify-center font-bold text-lg flex-shrink-0 shadow-sm overflow-hidden"
          style={{ border: '3px solid #E5E7EB' }}
          style={{
            width: size,
            height: size,
            backgroundColor: "#EFF8FF",
            color: "#0072BC"
          }}
        >
          {avatarUrl ? (
            isCustomUpload ? (
              <img 
                src={avatarUrl} 
                alt="Team avatar"
                className="w-full h-full object-cover"
                onError={(e) => {
                  e.target.style.display = 'none';
                  e.target.nextSibling.style.display = 'flex';
                }}
              />
            ) : (
              <div className="w-full h-full text-xl font-bold flex items-center justify-center" style={{ backgroundColor: '#0072BC', color: '#fff' }}>
                {['avatar1.png', 'avatar2.png', 'avatar3.png', 'avatar4.png', 'avatar5.png', 'avatar6.png', 'avatar7.png', 'avatar8.png'].indexOf(avatarUrl) + 1}
              </div>
            )
          ) : (
            <div className="w-full h-full flex items-center justify-center text-xl font-bold">
              {teamName ? teamName.charAt(0).toUpperCase() : '?'}
            </div>
          )}
          
          <div 
            className="w-full h-full flex items-center justify-center text-xl font-bold"
            style={{ display: 'none' }}
          >
            {teamName ? teamName.charAt(0).toUpperCase() : '?'}
          </div>
        </div>

        {/* Points Badge - positioned at bottom right of avatar */}
        <button
          onClick={() => navigate(`/${leagueId}/leaderboard`)}
          className="absolute -bottom-3 -right-3 bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 text-white rounded-full shadow-lg border-3 border-white/50 transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer group"
          style={{
            width: size * 0.55,
            height: size * 0.55,
            minWidth: '60px',
            minHeight: '60px'
          }}
          title="Click to view leaderboard"
        >
          <div className="flex flex-col items-center justify-center h-full">
            <div className="text-4xl font-black leading-none">
              {points >= 1000 ? `${(points/1000).toFixed(1)}k` : points.toLocaleString()}
            </div>
            <div className="text-xs leading-none opacity-60 mt-1" style={{ fontSize: '8px' }}>
              PTS
            </div>
          </div>
          
          {/* Hover effect ring */}
          <div className="absolute inset-0 rounded-full ring-2 ring-yellow-300 opacity-0 group-hover:opacity-100 transition-opacity duration-200 animate-pulse"></div>
        </button>
      </div>
    );
  };

  // Team Logo Component
  const TeamLogo = ({ teamName, size = 48, clickable = false }) => {
    const normalize = (name) =>
      name
        ?.toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/&/g, "")
        .replace(/[^a-z0-9\-]/g, "");

    const team = allTeams[normalize(teamName)];
    const logoUrl = team?.logo;

    const handleClick = () => {
      if (clickable && teamName) {
        navigate(`/${leagueId}/team/${encodeURIComponent(teamName)}`);
      }
    };

    const logoStyle = {
      width: size,
      height: size,
      borderRadius: "50%",
      overflow: "hidden",
      border: "2px solid rgba(255, 255, 255, 0.3)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "white",
      cursor: clickable ? "pointer" : "default",
      transition: "all 0.3s ease",
      flexShrink: 0,
      boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)",
      transform: "scale(1)",
      position: "relative",
      backdropFilter: "blur(10px)"
    };

    if (logoUrl) {
      return (
        <div style={{ position: "relative", display: "inline-block" }}>
          
          <div 
            style={logoStyle}
            onClick={handleClick}
            onMouseEnter={(e) => {
              if (clickable) {
                e.currentTarget.style.transform = "scale(1.05)";
                e.currentTarget.style.boxShadow = "0 6px 20px rgba(59, 130, 246, 0.3)";
              }
            }}
            onMouseLeave={(e) => {
              if (clickable) {
                e.currentTarget.style.transform = "scale(1)";
                e.currentTarget.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.1)";
              }
            }}
            title={clickable ? `Click to view ${teamName} details` : teamName}
          >
            <img 
              src={logoUrl} 
              alt={teamName}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover"
              }}
              onError={(e) => {
                const fallbackUrl = team?.logos2;
                if (fallbackUrl && e.target.src !== fallbackUrl) {
                  e.target.src = fallbackUrl;
                } else {
                  e.target.style.display = 'none';
                  e.target.nextSibling.style.display = 'flex';
                }
              }}
            />
            <div style={{
              display: 'none',
              width: '100%',
              height: '100%',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: size < 30 ? '10px' : '12px',
              fontWeight: '600',
              color: '#1e293b',
              textAlign: 'center',
              background: 'white'
            }}>
              {teamName ? teamName.split(' ').map(word => word[0]).join('').slice(0, 3) : '?'}
            </div>
          </div>
        </div>
      );
    }

    // Fallback placeholder
    return (
      <div style={{ position: "relative", display: "inline-block" }}>
        
        <div 
          style={{
            ...logoStyle,
            background: "white",
            color: "#1e293b",
            fontSize: size < 30 ? '10px' : '12px',
            fontWeight: '600'
          }}
          onClick={handleClick}
          onMouseEnter={(e) => {
            if (clickable) {
              e.currentTarget.style.transform = "scale(1.05)";
              e.currentTarget.style.boxShadow = "0 6px 20px rgba(59, 130, 246, 0.3)";
            }
          }}
          onMouseLeave={(e) => {
            if (clickable) {
              e.currentTarget.style.transform = "scale(1)";
              e.currentTarget.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.1)";
            }
          }}
          title={clickable ? `Click to view ${teamName} details` : teamName}
        >
          {teamName ? teamName.split(' ').map(word => word[0]).join('').slice(0, 3) : '?'}
        </div>
      </div>
    );
  };

  // Success Modal Component
  const SuccessModal = () => {
    if (!showSuccessModal) return null;

    return (
      <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
        <div style={{ backgroundColor: '#fff', borderRadius: 20, padding: 24, maxWidth: 380, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: 48, height: 48, borderRadius: '50%', backgroundColor: '#ECFDF5', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: 22 }}>✓</div>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: '#111827', marginBottom: 8 }}>Success</h3>
            <p style={{ fontSize: 14, color: '#6B7280', marginBottom: 20 }}>{successMessage}</p>
            <button
              onClick={() => setShowSuccessModal(false)}
              style={{ width: '100%', padding: '12px 0', borderRadius: 50, border: 'none', backgroundColor: '#0072BC', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}
            >
              Got it</button>
          </div>
        </div>
      </div>
    );
  };

  // Enhanced Schedule Grid with Game Results
  const ScheduleGrid = () => {
    const [scheduleData, setScheduleData] = useState({});
    const [scheduleLoading, setScheduleLoading] = useState(false);

    // Load full season schedule data with enhanced game information
    useEffect(() => {
      const loadFullSchedule = async () => {
        if (!showScheduleGrid || Object.keys(scheduleData).length > 0) return;
        
        setScheduleLoading(true);
        try {
          const allScheduleData = {};
          const weeks = Array.from({ length: 14 }, (_, i) => i + 1);
          
          // Load schedule for each week with enhanced game data
          for (const week of weeks) {
            const { data: gamesData } = await supabase
              .from('games')
              .select('*')
              .eq('year', SEASON_YEAR)
              .eq('week', week.toString());

            const weekGames = (gamesData || []).map(gameData => ({
              homeTeam: gameData.home_team,
              awayTeam: gameData.away_team,
              date: gameData.game_time,
              gameComplete: gameData.game_complete || false,
              homeScore: gameData.home_score ?? null,
              awayScore: gameData.away_score ?? null,
              homeSpread: gameData.home_spread || null,
              venue: null
            }));

            allScheduleData[week] = weekGames;
          }
          
          setScheduleData(allScheduleData);
        } catch (error) {
          console.error("Error loading schedule:", error);
        } finally {
          setScheduleLoading(false);
        }
      };

      loadFullSchedule();
    }, [showScheduleGrid]);

    // Early return AFTER all hooks have been called
    if (!showScheduleGrid) return null;

    // Get current roster from member.lineup
    const currentLineup = { starters: userData?.starters || [], bench: userData?.bench || [] };
    const allRosterTeams = [
      ...(currentLineup?.starters || []),
      ...(currentLineup?.bench || [])
    ].filter(teamName => teamName !== null);

    // Resolve team names to team objects
    const rosterTeams = allRosterTeams.map(teamName => {
      const normalize = (name) =>
        name?.toLowerCase()
          .replace(/\s+/g, "-")
          .replace(/&/g, "")
          .replace(/[^a-z0-9\-]/g, "");
      
      return allTeams[normalize(teamName)];
    }).filter(team => team !== null);

    // Helper function to find team's game for a specific week
    const findTeamGame = (teamName, week) => {
      const weekGames = scheduleData[week] || [];
      return weekGames.find(game => 
        game.homeTeam === teamName || game.awayTeam === teamName
      );
    };

    // Enhanced helper function to get opponent info with game results
    const getOpponentInfo = (teamName, week) => {
      const game = findTeamGame(teamName, week);
      if (!game) return null;
      
      const isHome = game.homeTeam === teamName;
      const opponent = isHome ? game.awayTeam : game.homeTeam;
      const myScore = isHome ? game.homeScore : game.awayScore;
      const opponentScore = isHome ? game.awayScore : game.homeScore;
      
      // Calculate spread from team's perspective
      let teamSpread = null;
      if (typeof game.homeSpread === 'number') {
        teamSpread = isHome ? game.homeSpread : -game.homeSpread;
      }
      
      return {
        opponent: opponent,
        isHome: isHome,
        date: game.date,
        gameComplete: game.gameComplete,
        // NEW: Game result data
        myScore: myScore,
        opponentScore: opponentScore,
        teamSpread: teamSpread,
        won: myScore !== null && opponentScore !== null ? myScore > opponentScore : null
      };
    };

    const weeks = Array.from({ length: 14 }, (_, i) => i + 1);

    if (scheduleLoading) {
      return (
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20 mb-6">
          <div className="text-center">
            <div className="text-2xl mb-2 animate-spin">📅</div>
            <p className="text-white/80">Loading schedule data...</p>
          </div>
        </div>
      );
    }

    return (
      <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20 mb-6">
        <h3 className="text-xl font-bold text-white mb-4 text-center">
          📅 Your Roster's Season Schedule
        </h3>
        
        {rosterTeams.length === 0 ? (
          <p className="text-white/60 text-center py-8">
            Add some teams to your lineup to see their schedule here!
          </p>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-max">
              {/* Header Row */}
              <div className="flex gap-1 mb-2">
                <div className="w-32 text-white font-bold text-sm p-2 bg-white/20 rounded">
                  Team
                </div>
                {weeks.map(week => (
                  <div 
                    key={week} 
                    className={`w-20 text-white font-bold text-xs p-2 rounded text-center ${
                      week === currentWeek 
                        ? 'bg-blue-500' 
                        : 'bg-white/10'
                    }`}
                  >
                    W{week}
                  </div>
                ))}
              </div>
              
              {/* Team Rows */}
              {rosterTeams.map((team, teamIndex) => (
                <div key={team.school} className="flex gap-1 mb-1">
                  {/* Team Name Column */}
                  <div className="w-32 bg-white/5 rounded p-2 flex items-center justify-center">
                    <div className="flex flex-col items-center gap-1">
                      <TeamLogo teamName={team.school} size={32} clickable={false} />
                      <div className="text-white/80 text-xs font-medium">
                        {team.currentSeason?.record || '0-0'}
                      </div>
                    </div>
                  </div>
                  
                  {/* Week Columns */}
                  {weeks.map(week => {
                    const opponentInfo = getOpponentInfo(team.school, week);
                    
                    // Enhanced background color logic for completed games
                    let bgColorClass = 'bg-white/5'; // Default for upcoming games
                    
                    if (!opponentInfo) {
                      bgColorClass = 'bg-gray-600/30'; // BYE week
                    } else if (opponentInfo.gameComplete && opponentInfo.won !== null) {
                      if (opponentInfo.won) {
                        bgColorClass = 'bg-green-500/20 border border-green-500/40'; // Win - green tint
                      } else {
                        bgColorClass = 'bg-red-500/20 border border-red-500/40'; // Loss - red tint
                      }
                    }
                    
                    return (
                      <div 
                        key={week}
                        className={`w-20 rounded p-1 text-center min-h-[60px] flex flex-col justify-center ${
                          week === currentWeek ? 'ring-2 ring-blue-400' : ''
                        } ${bgColorClass}`}
                      >
                        {opponentInfo ? (
                          <div className="text-xs">
                            {/* Show game result if completed, otherwise show upcoming game info */}
                            {opponentInfo.gameComplete && opponentInfo.myScore !== null && opponentInfo.opponentScore !== null ? (
                              // COMPLETED GAME: Show score and W/L with enhanced styling
                              <div>
                                <div className={`font-bold text-xs mb-1 ${opponentInfo.won ? 'text-green-300' : 'text-red-300'}`}>
                                  {opponentInfo.myScore}-{opponentInfo.opponentScore} {opponentInfo.won ? 'W' : 'L'}
                                </div>
                                <div className="text-white/90 truncate text-xs leading-tight">
                                  {opponentInfo.isHome ? 'vs' : '@'} {opponentInfo.opponent.split(' ').slice(0, 2).join(' ')}
                                </div>
                                <div className={`text-xs mt-1 font-bold ${opponentInfo.won ? 'text-green-400' : 'text-red-400'}`}>
                                  {opponentInfo.won ? '✓ WIN' : '✗ LOSS'}
                                </div>
                              </div>
                            ) : (
                              // UPCOMING GAME: Show opponent and spread
                              <div>
                                <div className="text-white font-medium mb-1">
                                  {opponentInfo.isHome ? 'vs' : '@'}
                                </div>
                                <div className="text-white/80 truncate text-xs leading-tight">
                                  {opponentInfo.opponent.split(' ').slice(0, 2).join(' ')}
                                </div>
                                {/* Show spread for current week and team has spread data */}
                                {week === currentWeek && team.currentSeason?.nextOpponentSpreadDisplay && (
                                  <div className="text-yellow-400 font-bold text-xs mt-1">
                                    {team.currentSeason.nextOpponentSpreadDisplay}
                                  </div>
                                )}
                                {/* Show spread from schedule data for other weeks */}
                                {week !== currentWeek && opponentInfo.teamSpread !== null && (
                                  <div className="text-yellow-400 font-bold text-xs mt-1">
                                    {opponentInfo.teamSpread === 0 ? 'PICK' : 
                                     opponentInfo.teamSpread > 0 ? `+${opponentInfo.teamSpread}` : 
                                     `${opponentInfo.teamSpread}`}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="text-gray-300 text-xs font-medium">
                            BYE
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
            
            {/* Enhanced Legend */}
            <div className="mt-4 flex items-center justify-center gap-4 text-xs flex-wrap">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 bg-blue-500 rounded"></div>
                <span className="text-white/80">Current Week</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 bg-white/10 rounded"></div>
                <span className="text-white/80">Upcoming Game</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 bg-gray-600 rounded"></div>
                <span className="text-white/80">BYE Week</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 bg-green-500/20 border border-green-500/40 rounded"></div>
                <span className="text-white/80">Win</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 bg-red-500/20 border border-red-500/40 rounded"></div>
                <span className="text-white/80">Loss</span>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // Migration function
  const runMigration = async () => {
    try {
      const { data: { user: currentUserAuth } } = await supabase.auth.getUser();
      const userId = currentUserAuth?.id;

      if (!userId) {
        console.error('❌ No user logged in');
        return;
      }

      console.log('🔄 Starting migration for user:', userId);

      // Check if migration already done
      const { data: weeklySnap } = await supabase
        .from('weekly_lineups')
        .select('id')
        .eq('league_id', leagueId)
        .eq('user_id', userId)
        .single();

      if (weeklySnap) {
        console.log('✅ Migration already completed');
        setMigrationNeeded(false);
        return;
      }

      // Get current member data
      const { data: memberSnap } = await supabase
        .from('league_members')
        .select('*')
        .eq('league_id', leagueId)
        .eq('user_id', userId)
        .single();
      const memberData = memberSnap;

      if (memberData?.starters || memberData?.bench) {
        console.log('📋 Found existing lineup starters/bench');

        // Save to weekly_lineups table
        await supabase.from('weekly_lineups').insert({
          league_id: leagueId,
          user_id: userId,
          week: currentWeek.toString(),
          starters: memberData.starters || [],
          bench: memberData.bench || [],
          captain: memberData.captain || null,
          trip_play_team: memberData.trip_play_team || null
        });

        console.log('✅ Migration completed successfully!');
        
        setMigrationNeeded(false);
        setSuccessMessage("Migration completed! Your teams have been moved to the new weekly format.");
        setShowSuccessModal(true);
        
        // Refresh the page to load new data
        setTimeout(() => {
          window.location.reload();
        }, 2000);
        
      } else {
        console.log('❌ No existing lineup found to migrate');
        setMigrationNeeded(false);
      }
      
    } catch (error) {
      console.error('❌ Migration failed:', error);
      setSuccessMessage("Migration failed. Please try again or contact support.");
      setShowSuccessModal(true);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      const currentUser = { id: currentUserId };
      if (!currentUserId) return;

      const loadLiveRanking = async () => {
        try {
          setLoadingRank(true);

          // Get current week from config
          const { data: configData } = await supabase.from('config').select('value').eq('key', 'season').single();
          const currentWeekVal = configData?.value?.currentWeek || 1;
          const previousWeek = Math.max(1, (typeof currentWeekVal === 'number' ? currentWeekVal : parseInt(String(currentWeekVal).match(/\d+/)?.[0] || '1')) - 1);

          // Use context members for ranking (no extra fetch needed)
          const allMembers = ctxMembers.map(m => ({
            userId: m.user_id,
            points: m.points || 0,
            teamName: m.team_name || "Unnamed Team"
          }));

          // Sort by points descending to get live rankings
          allMembers.sort((a, b) => b.points - a.points);

          // Find current user's live rank
          const currentUserRankIndex = allMembers.findIndex(member => member.userId === currentUserId);
          const liveRank = currentUserRankIndex !== -1 ? currentUserRankIndex + 1 : null;
          setCurrentWeekRank(liveRank);

          // Get previous week's final ranking for comparison
          const { data: weeklyStandingData } = await supabase
            .from('weekly_standings')
            .select('rank')
            .eq('league_id', leagueId)
            .eq('user_id', currentUser.id)
            .eq('week', previousWeek.toString())
            .single();
          const prevRank = weeklyStandingData?.rank || null;
          setPreviousWeekRank(prevRank);

          // Calculate rank change
          if (liveRank && prevRank) {
            const change = liveRank - prevRank;
            setRankChange(change);
          } else {
            setRankChange(0);
          }

        } catch (error) {
          console.error("Error loading live ranking:", error);
        } finally {
          setLoadingRank(false);
        }
      };

      try {
        // Get user/member data
        const { data: memberData } = await supabase
          .from('league_members')
          .select('*')
          .eq('league_id', leagueId)
          .eq('user_id', currentUser.id)
          .single();

        setUserData(memberData);
        setTeamName(memberData?.team_name || "Unnamed Squad");
        setSmackTalk(memberData?.smack_talk || "");
        setSquadPoints(memberData?.points || 0);

        // Check if migration is needed (weekly_lineups table)
        const { data: weeklySnap } = await supabase
          .from('weekly_lineups')
          .select('id')
          .eq('league_id', leagueId)
          .eq('user_id', currentUser.id)
          .single();

        if (!weeklySnap && (memberData?.starters || memberData?.bench)) {
          console.log('🔧 Migration needed - old lineup format detected');
          setMigrationNeeded(true);
        }

        // Get season info with better currentWeek parsing
        const { data: seasonData } = await supabase.from('config').select('value').eq('key', 'season').single();

        // Handle both "Preseason" and "Week X" formats
        const weekString = seasonData?.value?.currentWeek || "1";
        let weekNumber;

        if (weekString === "Preseason") {
          weekNumber = 1; // Default to week 1 for preseason
        } else {
          const weekMatch = weekString.toString().match(/\d+/);
          weekNumber = weekMatch ? parseInt(weekMatch[0]) : 1;
        }

        console.log("Parsed week:", weekString, "→", weekNumber);
        setCurrentWeek(weekNumber);

        // Load all teams with proper structure
        const { data: teamsData } = await supabase.from('teams').select('*');
        const teamsMap = {};
        (teamsData || []).forEach(teamData => {
          if (teamData.school) {
            const normalize = (name) =>
              name
                ?.toLowerCase()
                .replace(/\s+/g, "-")
                .replace(/&/g, "")
                .replace(/[^a-z0-9\-]/g, "");

            teamsMap[normalize(teamData.school)] = {
              id: teamData.id,
              ...teamData,
              logo: (teamData.logos && teamData.logos[0]) || null,
              logos1: (teamData.logos && teamData.logos[0]) || null,
              logos2: (teamData.logos && teamData.logos[1]) || null,
              colors: { primary: teamData.color, secondary: teamData.alternate_color },
              conference: teamData.conference || "Unknown",
              mascot: teamData.mascot || "",
              city: teamData.school || "",
              state: "",
              currentWeekPoints: teamData.weekly_points?.[`week${weekNumber}`] || null,
              gameComplete: teamData.game_complete || false,
              name: teamData.school,
              school: teamData.school
            };
          }
        });
        setAllTeams(teamsMap);

        console.log("Teams loaded:", Object.keys(teamsMap).length);
        console.log("Sample teams:", Object.keys(teamsMap).slice(0, 5));

        setLoading(false);

        await loadLiveRanking();

      } catch (error) {
        console.error("Error fetching data:", error);
        setLoading(false);
      }
    };

    fetchData();
  }, [leagueId]);

  const handleTeamClick = (teamName) => {
    navigate(`/${leagueId}/team/${encodeURIComponent(teamName)}`);
  };

  const handleSaveSmackTalk = async () => {
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    if (!currentUser) return;

    setSmackTalkSaving(true);
    try {
      await supabase
        .from('league_members')
        .update({ smack_talk: smackTalk.trim() })
        .eq('league_id', leagueId)
        .eq('user_id', currentUser.id);
      setIsEditingSmackTalk(false);
      setSuccessMessage("Smack talk updated!");
      setShowSuccessModal(true);
    } catch (error) {
      console.error("Error saving smack talk:", error);
      setSuccessMessage("Failed to save smack talk. Please try again.");
      setShowSuccessModal(true);
    } finally {
      setSmackTalkSaving(false);
    }
  };


  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 32, height: 32, borderRadius: '50%', border: '2.5px solid #0072BC', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#F9FAFB', color: '#111827' }}>
      <BottomNavBar />
      <LeagueNav />

      {/* Header */}
      <div style={{ textAlign: 'center', padding: '24px 16px 16px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <UserAvatar member={userData} points={squadPoints} size={100} />
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 900, color: '#111827', margin: 0 }}>{teamName}</h1>
            <RankingBadge currentRank={currentWeekRank} rankChange={rankChange} loading={loadingRank} />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ maxWidth: 600, margin: '0 auto', padding: '0 16px 100px' }}>
        

    {/* WEEKLY LINEUP MANAGER */}
    <div className="mb-6">
      <WeeklyLineupManager
        leagueId={leagueId}
        userId={userData?.user_id}
        allTeams={allTeams}
        currentWeek={currentWeek}
        onTeamClick={handleTeamClick}
        TeamLogo={TeamLogo}
        userDisplayName={userData?.first_name || "Unknown"}
      />
    </div>

        {/* Smack Talk Section */}
        <div style={{ backgroundColor: '#ffffff', borderRadius: 16, padding: '20px', border: '1px solid #F3F4F6', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#111827', margin: 0 }}>Smack Talk</h3>
            {!isEditingSmackTalk && (
              <button
                onClick={() => setIsEditingSmackTalk(true)}
                style={{ backgroundColor: '#0072BC', color: '#fff', padding: '6px 14px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
              >
                Edit
              </button>
            )}
          </div>

          {isEditingSmackTalk ? (
            <div>
              <textarea
                value={smackTalk}
                onChange={(e) => setSmackTalk(e.target.value.slice(0, 80))}
                placeholder="Say something to intimidate your opponents... (max 80 chars)"
                style={{ width: '100%', minHeight: 80, padding: '12px', border: '1.5px solid #E5E7EB', borderRadius: 10, fontSize: 14, color: '#111827', resize: 'none', outline: 'none', boxSizing: 'border-box', backgroundColor: '#F9FAFB' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                <span style={{ fontSize: 12, color: smackTalk.length > 70 ? '#DC2626' : '#9CA3AF' }}>{smackTalk.length}/80</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setIsEditingSmackTalk(false)} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #E5E7EB', backgroundColor: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#374151' }}>Cancel</button>
                  <button onClick={handleSaveSmackTalk} disabled={smackTalkSaving} style={{ padding: '6px 14px', borderRadius: 8, border: 'none', backgroundColor: '#0072BC', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{smackTalkSaving ? "Saving..." : "Save"}</button>
                </div>
              </div>
            </div>
          ) : (
            <div>
              {smackTalk.trim() ? (
                <div style={{ backgroundColor: '#0072BC', color: '#fff', padding: '10px 16px', borderRadius: 12, fontSize: 14, display: 'inline-block', maxWidth: '100%' }}>
                  {smackTalk}
                </div>
              ) : (
                <p style={{ fontSize: 14, color: '#9CA3AF', fontStyle: 'italic', margin: 0 }}>No smack talk set — click Edit to add some.</p>
              )}
            </div>
          )}
        </div>
        
        {/* Schedule Grid Toggle */}
        <div className="mb-6">
          <button
            onClick={() => setShowScheduleGrid(!showScheduleGrid)}
            style={{ width: '100%', backgroundColor: '#ffffff', border: '1px solid #F3F4F6', borderRadius: 16, padding: '16px 20px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Calendar color="#0072BC" size={20} />
              <span style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>Season Schedule</span>
            </div>
            {showScheduleGrid ? (
              <ChevronUp color="#9CA3AF" size={20} />
            ) : (
              <ChevronDown color="#9CA3AF" size={20} />
            )}
          </button>
        </div>

        {/* Enhanced Schedule Grid */}
        <ScheduleGrid />

        {/* Free Agent Instructions */}
        <div className="bg-blue-500/20 backdrop-blur-sm border border-blue-400/30 rounded-xl p-4 mb-6">
          <div className="flex items-center gap-3 text-blue-300">
            <div className="text-2xl">💡</div>
            <div>
              <div className="font-semibold text-blue-200">Want to add new teams?</div>
              <div className="text-sm text-blue-300 mt-1">
                Visit the{" "}
                <Link 
                  to={`/${leagueId}/free-agents`}
                  className="font-semibold text-blue-100 hover:text-white underline transition-colors duration-200"
                >
                  Free Agents page
                </Link>
                {" "}to browse and add available teams for the current week.
              </div>
            </div>
          </div>
        </div>

        {/* How Does Scoring Work Section */}
        <div className="bg-purple-500/20 backdrop-blur-sm border border-purple-400/30 rounded-xl p-4 mb-6">
          <div className="flex items-center gap-3 text-purple-300">
            <div className="text-2xl">📊</div>
            <div className="flex-1">
              <div className="font-semibold text-purple-200">How does scoring work?</div>
              <div className="text-sm text-purple-300 mt-1">
                Curious about how your teams earn points? Learn about the scoring system and strategy tips.
              </div>
            </div>
            <button
              onClick={() => setShowScoringModal(true)}
              className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-200 flex-shrink-0"
            >
              View Scoring
            </button>
          </div>
        </div>
      </div>

      {/* Scoring System Modal */}
      {showScoringModal && (
        <ScoringSystemModal 
          onClose={() => setShowScoringModal(false)}
        />
      )}

      {/* Success Modal */}
      <SuccessModal />
    </div>
  );
}

export default MyLineup;