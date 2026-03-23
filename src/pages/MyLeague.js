import React, { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Trophy, Users, Star, TrendingUp, Settings } from "lucide-react";
import BottomNavBar from "../components/BottomNavBar";
import LeagueNav from "../components/LeagueNav";
import ScoringSystemModal from "../components/ScoringSystemModal";
import RecentMovesWidget from '../components/RecentMovesWidget';
import { useLeague } from "../context/LeagueContext";
import { useTeams } from "../hooks/useTeams";
import PlayoffBracket from "../components/league/PlayoffBracket";
import PlayoffBracketDiagram from "../components/league/PlayoffBracketDiagram";
import { getCurrentWeekNumber, getMemberLiveStatus, getDisplayData } from "../utils/leagueUtils";
import { useLeagueData } from "../hooks/useLeagueData";
import UserAvatar from "../components/league/UserAvatar";
import WeekSelector from "../components/league/WeekSelector";
import TeamLogo from "../components/league/TeamLogo";
import TeamCardModal from "../components/league/TeamCardModal";

function MyLeague() {
  const { leagueId } = useParams();
  const { leagueData: ctxLeagueData, currentWeek } = useLeague();
  const { teams: allTeams } = useTeams();
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [showScoringModal, setShowScoringModal] = useState(false);
  const [selectedWeek, setSelectedWeek] = useState(null);
  const [viewMode, setViewMode] = useState("current"); // 'current' vs 'historical'

  const {
    members,
    leagueName,
    maxManagers,
    loading,
    scheduleData,
    scheduleLoading,
    weeklyStandings,
    availableWeeks,
    standingsLoading,
    playoffBracket,
    loadWeeklyStandings,
  } = useLeagueData({ leagueId, currentWeek, ctxLeagueData });

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-4 sm:left-10 w-48 sm:w-72 h-48 sm:h-72 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full blur-3xl animate-pulse"></div>
        </div>
        <div className="relative z-10 flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="text-4xl mb-4 animate-spin">🏆</div>
            <p className="text-xl text-white/80">Loading league standings...</p>
          </div>
        </div>
      </div>
    );
  }

  const displayData = getDisplayData({ viewMode, members, weeklyStandings, selectedWeek });
  const currentWeekNum = getCurrentWeekNumber(currentWeek);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white">
      {/* Animated Background Elements */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-20 left-4 sm:left-10 w-48 sm:w-72 h-48 sm:h-72 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-20 right-4 sm:right-10 w-56 sm:w-96 h-56 sm:h-96 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full blur-3xl animate-pulse delay-1000"></div>
      </div>

      <BottomNavBar />

      <LeagueNav />

      {/* Main Content */}
      <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 py-4 pb-32">
        
        {/* Header */}
        <div className="text-center mb-8">
          <div className="mb-4">
            <span className="inline-block text-4xl sm:text-5xl mb-2">🏆</span>
          </div>
          <div className="flex items-center justify-center gap-4 mb-2">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black leading-tight">
              <span className="bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
                {leagueName ? `${leagueName} Standings` : "League Standings"}
              </span>
            </h1>
            <Link
              to={`/${leagueId}/league-rules`}
              className="bg-white/10 backdrop-blur-sm border border-white/30 rounded-xl p-3 text-white/80 hover:text-white hover:bg-white/20 transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-white/20"
              title="League Rules & Settings"
            >
              <Settings size={24} />
            </Link>
          </div>
          <p className="text-lg sm:text-xl text-white/80">
            {viewMode === 'current' 
              ? `Live Standings - Week ${currentWeekNum}`
              : `Final Standings - Week ${selectedWeek}`
            }
          </p>
        </div>

        {/* NEW: Week Selector */}
        {(availableWeeks.length > 0 || currentWeekNum > 1) && (
          <WeekSelector
            currentWeek={currentWeek}
            viewMode={viewMode}
            setViewMode={setViewMode}
            selectedWeek={selectedWeek}
            setSelectedWeek={setSelectedWeek}
            availableWeeks={availableWeeks}
            standingsLoading={standingsLoading}
            loadWeeklyStandings={loadWeeklyStandings}
          />
        )}

        {/* NEW: Playoff Bracket Diagram - Only show for weeks 12+ */}
        {currentWeekNum >= 12 && playoffBracket && viewMode === 'current' && (
          <PlayoffBracketDiagram bracket={playoffBracket} currentWeek={currentWeek} members={members} />
        )}

        {/* Live Game Status Key - Only show for current week */}
        {viewMode === 'current' && (
          <div className="bg-white/10 backdrop-blur-lg rounded-xl p-3 border border-white/20 mb-6">
            <h3 className="text-sm font-semibold text-white/90 mb-3 text-center">Game Status Legend</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs text-white/70">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-gray-500 rounded-full flex items-center justify-center text-white text-xs font-bold">?</div>
                <span>Not Started</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-green-500 rounded-full animate-pulse flex items-center justify-center text-white text-xs font-bold">5</div>
                <span>Live Game</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center text-white text-xs font-bold">5</div>
                <span>Final</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-yellow-500 rounded-full flex items-center justify-center text-white text-xs font-bold">👑</div>
                <span>Captain (2x)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-cyan-500 rounded-full flex items-center justify-center text-white text-xs font-bold">⚡</div>
                <span>Trip Play (3x)</span>
              </div>
            </div>
          </div>
        )}

        {/* Recent Moves Widget - Only show for current week, hide during playoffs */}
        {viewMode === 'current' && currentWeekNum < 12 && <RecentMovesWidget leagueId={leagueId} />}
          {/* Condensed Leaderboard Summary - Hide during playoffs */}
          {displayData.length > 0 && !(currentWeekNum >= 12 && viewMode === 'current') && (
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-3 border border-white/20 mb-8">
            <h2 className="text-base font-bold text-white mb-3 text-center">
              {viewMode === 'current' ? `Quick Standings - Week ${currentWeekNum}` : `Week ${selectedWeek} Final Results`}
            </h2>

            {/* Column Headers */}
            {viewMode === 'current' && (
              <div className="flex items-center py-1 px-2.5 mb-2 border-b border-white/20">
                <div className="flex items-center gap-2 flex-1">
                  <div className="w-6"></div> {/* Space for rank change indicator */}
                  <span className="text-white/60 text-[10px] font-medium uppercase tracking-wider">Team</span>
                </div>
                <div className="flex items-center gap-1 text-right">
                  <span className="text-white/60 text-[10px] font-medium uppercase tracking-wider w-8">Week</span>
                  <span className="text-white/60 text-[10px] font-medium uppercase tracking-wider w-10">Total</span>
                </div>
              </div>
            )}

            <div className="space-y-1">
            {displayData.map((member, idx) => {
              // Calculate ranking change
              const getCurrentRank = idx + 1;
              let rankChange = null;

              if (viewMode === 'current' && currentWeekNum > 1) {
                const previousWeek = currentWeekNum - 1;
                const previousWeekData = weeklyStandings[previousWeek];
                
                if (previousWeekData) {
                  const memberPreviousData = previousWeekData.find(m => m.id === member.id);
                  if (memberPreviousData) {
                    const previousRank = memberPreviousData.rank;
                    rankChange = previousRank - getCurrentRank; // Positive = moved up, negative = moved down
                  }
                }
              }

              // Calculate playoff cutoff based on maxManagers
              const playoffSpots = maxManagers === 8 ? 4 : 6;
              const isPlayoffLine = idx === playoffSpots;
              const hasLiveGames = getMemberLiveStatus(member, { viewMode, scheduleData, scheduleLoading, allTeams });
              const hasTripPlay = member.tripPlayTeam && viewMode === 'current';

              // Lightning Border Component for Trip Play
              const TripPlayBorder = ({ children }) => {
                if (!hasTripPlay) return children;
                
                return (
                  <div className="relative">
                    {/* Animated lightning border */}
                    <div className="absolute inset-0 rounded-lg overflow-hidden">
                      <div className="absolute inset-0 bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-500 animate-pulse opacity-30"></div>
                      <div className="absolute inset-[2px] bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 rounded-lg"></div>
                      
                      {/* Lightning animation effect */}
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-cyan-300 to-transparent opacity-50 animate-pulse"></div>
                      
                    {/* Single lightning bolt in top-left */}
                    <div className="absolute top-1 left-1 text-cyan-400 animate-bounce">⚡</div>
                    </div>
                    
                    {/* Content */}
                    <div className="relative z-10">
                      {children}
                    </div>
                  </div>
                );
              };

              const cardContent = (
                <div className={`relative flex items-center justify-between py-1.5 px-2.5 rounded-lg hover:bg-white/10 transition-colors duration-200 ${
                  viewMode === 'current' && idx < playoffSpots ? 'bg-green-400/10 border border-green-400/20' : 'bg-white/5'
                }`}>
                  {/* Rank Change and Team Name */}
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {/* Rank Change Indicator - always reserve space */}
                    <div className="w-6 flex justify-center">
                      {rankChange !== null && viewMode === 'current' && (
                        <div className={`text-[10px] font-bold ${
                          rankChange > 0 ? 'text-green-400' : 
                          rankChange < 0 ? 'text-red-400' : 
                          'text-gray-400'
                        }`}>
                          {rankChange > 0 ? `▲${rankChange}` : rankChange < 0 ? `▼${Math.abs(rankChange)}` : '▬'}
                        </div>
                      )}
                    </div>
                    
                    <span className="text-white font-medium truncate text-sm">
                      {member.teamName || "Unnamed Team"}
                    </span>
                    
                    {/* Live Games Indicator - Only for current view */}
                    {hasLiveGames && viewMode === 'current' && (
                      <div className="flex items-center gap-1">
                        <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></div>
                        <span className="text-[10px] text-green-400 font-medium">LIVE</span>
                      </div>
                    )}
                    {/* Captain Indicator - Only for current view */}
                    {member.captain && viewMode === 'current' && (
                      <div className="flex items-center gap-1">
                        <div className="text-xs text-yellow-400">👑</div>
                        <div className="w-5 h-5 bg-white rounded-full p-0.5 flex items-center justify-center">
                          <TeamLogo
                            teamName={member.captain}
                            size={21}
                            clickable={false}
                            isCaptain={false}
                            isTripPlay={false}
                            allTeams={allTeams}
                            scheduleData={scheduleData}
                            scheduleLoading={scheduleLoading}
                            viewMode={viewMode}
                            currentWeek={currentWeek}
                            onTeamClick={setSelectedTeam}
                          />
                        </div>
                      </div>
                    )}
                    {/* Trip Play Indicator - Only for current view */}
                    {hasTripPlay && (
                      <div className="flex items-center gap-1">
                        <div className="text-xs text-cyan-400">⚡</div>
                        <div className="text-center">
                          <div className="text-[9px] text-cyan-400 font-bold leading-none">3X</div>
                          <div className="text-[7px] text-cyan-400 font-medium leading-none">ACTIVE</div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Points */}
                  <div className="flex items-center gap-1 text-right">
                    {/* Weekly Points */}
                    {viewMode === 'current' && (
                      <div className="text-white text-[12px] font-bold w-8 text-right">
                          {member.weeklyPoints ?? 0}
                      </div>
                    )}
                    
                    {/* Total Points */}
                    <div className="text-blue-400 font-bold text-base w-10 text-right">
                      {member.points ?? 0}
                    </div>
                  </div>
                </div>
              );

              return (
                <div key={`summary-${member.id}`}>
                  {/* Playoff Line Separator */}
                  {isPlayoffLine && viewMode === 'current' && (
                    <div className="flex items-center gap-3 py-3">
                      <div className="flex-1 h-px bg-gradient-to-r from-transparent via-red-400 to-transparent"></div>
                      <span className="text-red-400 text-xs font-semibold uppercase tracking-wider px-3 py-1 bg-red-400/10 rounded-full border border-red-400/30">
                        Playoff Line
                      </span>
                      <div className="flex-1 h-px bg-gradient-to-r from-red-400 via-transparent to-transparent"></div>
                    </div>
                  )}

                  <TripPlayBorder>
                    {cardContent}
                  </TripPlayBorder>
                </div>
              );
            })}
            </div>
          </div>
        )}

        {/* Scoring Modal - Only show for current week */}
        {viewMode === 'current' && (
          <div className="text-center mb-6">
            <button
              onClick={() => setShowScoringModal(true)}
              className="text-white/80 hover:text-white text-lg font-medium transition-colors duration-200 underline underline-offset-2 hover:underline-offset-4"
            >
              How does scoring work?
            </button>
          </div>
        )}

{/* Show playoff bracket for weeks 12+ OR regular standings */}
          {currentWeekNum >= 12 && playoffBracket && viewMode === 'current' ? (
          <PlayoffBracket 
              bracket={playoffBracket}
              allTeams={allTeams}
              TeamLogo={TeamLogo}
              viewMode={viewMode}
              selectedWeek={selectedWeek}
              currentWeek={currentWeek}
              members={members}
            />
          ) : displayData.length === 0 ? (
            <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-12 border border-white/20 text-center">
              <div className="text-4xl mb-4">👥</div>
              <p className="text-white/80 text-lg">
                {viewMode === 'current' 
                  ? "No members found in this league."
                  : `No standings data available for Week ${selectedWeek}.`
                }
              </p>
            </div>
          ) : (
            
            <div className="space-y-4">
            {displayData.map((member, idx) => {
              // For historical view, get lineup from snapshot data
              let lineup, starters, bench;

              if (viewMode === 'historical') {
                starters = [];
                bench = [];
              } else {
                lineup = member.lineup || {};
                starters = Array.isArray(lineup.starters) ? lineup.starters : [];
                bench = Array.isArray(lineup.bench) ? lineup.bench : [];
              }
              
              // Determine rank styling
              const getRankStyle = (position) => {
                if (position === 0) return { 
                  backgroundColor: "#fbbf24", 
                  color: "#92400e",
                  showNumber: true,
                  icon: <Trophy size={12} className="text-yellow-800" />
                }; // Gold
                if (position === 1) return { 
                  backgroundColor: "#d1d5db", 
                  color: "#374151",
                  showNumber: true,
                  icon: <Star size={12} className="text-gray-700" />
                }; // Silver
                if (position === 2) return { 
                  backgroundColor: "#f97316", 
                  color: "white",
                  showNumber: true,
                  icon: <TrendingUp size={12} className="text-white" />
                }; // Bronze
                return { 
                  backgroundColor: "rgba(255, 255, 255, 0.2)", 
                  color: "white",
                  showNumber: true,
                  icon: null
                }; // Default
              };

              // Use rank from historical data or calculate for current
              const displayRank = viewMode === 'historical' ? member.rank : idx + 1;
              const rankStyle = getRankStyle(displayRank - 1);

              return (
                <div key={member.id} className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20 hover:bg-white/15 transition-all duration-300">
                  {/* Header: Rank, Team Name, Points */}
                  <div className="flex items-center mb-4">
                    {/* User Avatar with Rank */}
                    <UserAvatar member={member} size={56} rankStyle={rankStyle} rank={displayRank} />

                    {/* Team Info */}
                    <div className="flex-1 min-w-0 ml-4">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-base font-bold text-white truncate">
                          {member.teamName || "Unnamed Team"}
                        </h3>
                      </div>
                        <p className="text-white/70 flex items-center gap-2">
                          {member.firstName || "Unknown Manager"}
                          {/* Freezes indicator - more compact */}
                          {member.freezes > 0 && (
                            <div className="flex items-center gap-0.5 bg-blue-500/20 px-1 py-0.5 rounded-full border border-blue-400/30">
                              <span className="text-xs text-blue-300">❄️</span>
                              <span className="text-xs text-blue-300 font-medium">{member.freezes}</span>
                            </div>
                          )}
                          {/* Trip Play indicator - more compact */}
                          {member.hasTripPlay && (
                            <div className="flex items-center gap-0.5 bg-purple-500/20 px-1 py-0.5 rounded-full border border-purple-400/30">
                              <span className="text-xs text-purple-300">⚡</span>
                              <span className="text-xs text-purple-300 font-medium">3X</span>
                            </div>
                          )}
                        </p>
                    </div>

                    {/* Points & Weekly Score */}
                    <div className="text-right">
                      <div className="text-2xl font-black text-blue-400 leading-none">
                        {member.points ?? 0}
                      </div>
                      {viewMode === 'current' ? (
                        <>
                          <div className="text-xs text-white/60 mt-1">
                            {member.weeklyPoints ?? 0} Pts in Wk {currentWeekNum}
                          </div>
                          <div className="text-xs text-white/60 mt-1">
                            {member.freeAgentMoves ?? 0} FA moves
                          </div>
                          {/* Duplicate Week Display - smaller text */}
                          {member.duplicateWeek1 && (
                            <div className="text-[10px] text-purple-400 mt-1 font-medium">
                              {member.duplicateWeek1}
                            </div>
                          )}
                        </>
                      ) : (
                        <>
                          <div className="text-xs text-white/60 mt-1">
                            {member.weeklyPoints ?? 0} Pts in Week {selectedWeek}
                          </div>
                          <div className="text-xs text-orange-400 mt-1 font-medium">
                            Final Standing
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Team Roster - Only show for current view */}
                  {viewMode === 'current' && (
                    <div className="mt-6">
                      {/* Headers Row */}
                      <div className="flex gap-1 mb-3 relative">
                        {/* Starters Header */}
                        <div className="text-xs font-semibold text-green-400 uppercase tracking-wider flex items-center gap-1">
                          <Users size={12} />
                          Starters
                        </div>
                        
                        {/* Spacer to align bench header with 6th position */}
                        <div style={{ width: `${5 * 36 - 80}px` }}></div>
                        
                        {/* Bench Header - aligned with 6th team position */}
                        <div className="text-xs font-semibold text-orange-400 uppercase tracking-wider flex items-center gap-1">
                          <Star size={12} />
                          Bench
                        </div>
                      </div>
                      
                      {/* Teams Row */}
                      <div className="flex gap-1 justify-start flex-wrap">
                        {/* Starters */}
                        {starters.slice(0, 5).map((teamName, teamIdx) => (
                          <TeamLogo
                            key={`starter-${teamIdx}`}
                            teamName={teamName}
                            size={34}
                            clickable={true}
                            isCaptain={member.captain === teamName}
                            isTripPlay={member.tripPlayTeam === teamName}
                            allTeams={allTeams}
                            scheduleData={scheduleData}
                            scheduleLoading={scheduleLoading}
                            viewMode={viewMode}
                            currentWeek={currentWeek}
                            onTeamClick={setSelectedTeam}
                          />
                        ))}
                        
                        {/* Empty starter slots */}
                        {Array.from({ length: Math.max(0, 5 - starters.length) }).map((_, emptyIdx) => (
                          <div key={`empty-starter-${emptyIdx}`} className="w-[34px] h-[34px] rounded-full border-2 border-dashed border-green-400/50 flex items-center justify-center bg-green-400/10 backdrop-blur-sm flex-shrink-0">
                            <div className="w-1.5 h-1.5 rounded-full bg-green-400/50" />
                          </div>
                        ))}

                        {/* Bench */}
                        {bench.slice(0, 2).map((teamName, teamIdx) => (
                          <TeamLogo
                            key={`bench-${teamIdx}`}
                            teamName={teamName}
                            size={34}
                            clickable={true}
                            isCaptain={false}
                            isTripPlay={false}
                            allTeams={allTeams}
                            scheduleData={scheduleData}
                            scheduleLoading={scheduleLoading}
                            viewMode={viewMode}
                            currentWeek={currentWeek}
                            onTeamClick={setSelectedTeam}
                          />
                        ))}
                        
                        {/* Empty bench slots */}
                        {Array.from({ length: Math.max(0, 2 - bench.length) }).map((_, emptyIdx) => (
                          <div key={`empty-bench-${emptyIdx}`} className="w-[34px] h-[34px] rounded-full border-2 border-dashed border-orange-400/50 flex items-center justify-center bg-orange-400/10 backdrop-blur-sm flex-shrink-0">
                            <div className="w-1.5 h-1.5 rounded-full bg-orange-400/50" />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Historical Week Summary - Only show for historical view */}
                  {viewMode === 'historical' && (
                    <div className="mt-6 bg-white/5 rounded-xl p-4">
                      <div className="text-center">
                        <div className="text-lg font-bold text-blue-400 mb-2">
                          Week {selectedWeek} Final Result
                        </div>
                        <div className="text-sm text-white/70">
                          Rank: {member.rank} • Points: {member.points} • Weekly: {member.weeklyPoints}
                        </div>
                        {member.snapshotAt && (
                          <div className="text-xs text-white/50 mt-2">
                            Finalized: {new Date(member.snapshotAt.toDate()).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Smack Talk Speech Bubble - Only show if exists and for current view */}
                  {member.smackTalk && member.smackTalk.trim() && viewMode === 'current' && (
                    <div className="mt-4 flex justify-start">
                      <div className="bg-gradient-to-r from-blue-500 to-purple-500 text-white px-4 py-2 rounded-2xl text-sm font-medium max-w-[80%] relative shadow-lg">
                        💬 {member.smackTalk}
                        {/* Speech bubble tail */}
                        <div className="absolute bottom-0 left-4 transform translate-y-full">
                          <div className="w-0 h-0 border-l-[6px] border-r-[6px] border-t-[6px] border-l-transparent border-r-transparent border-t-blue-500" />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Team Card Modal */}
      {selectedTeam && (
        <TeamCardModal
          team={selectedTeam}
          onClose={() => setSelectedTeam(null)}
          currentWeek={currentWeek}
        />
      )}

      {/* Scoring System Modal */}
      {showScoringModal && (
        <ScoringSystemModal 
          onClose={() => setShowScoringModal(false)}
        />
      )}
    </div>
  );
}

export default MyLeague;