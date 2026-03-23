import React, { useState } from "react";

// Playoff Bracket Diagram Component
const PlayoffBracketDiagram = ({ bracket, currentWeek, members }) => {
  const [activeTab, setActiveTab] = useState('championship');

  const displayWeek = typeof currentWeek === 'number' ? currentWeek :
    (currentWeek && typeof currentWeek === 'string' ? parseInt(currentWeek.match(/\d+/)?.[0] || '1') : 1);

  const getMemberCurrentWeeklyPoints = (userId) => {
    const member = members?.find(m => m.id === userId);
    return member?.weeklyPoints || 0;
  };

  // Championship Bracket Diagram
  const ChampionshipDiagram = () => {
    const champ = bracket?.championshipBracket;
    if (!champ) return null;

    const getTeamDisplay = (team, weekNumber) => {
      if (!team) return <div className="text-xs text-white/40 italic">TBD</div>;

      // For completed past weeks, show historical stored points
      // For current/future weeks, show live points
      const shouldShowLivePoints = displayWeek === weekNumber;
      const pointsToShow = shouldShowLivePoints
        ? getMemberCurrentWeeklyPoints(team.userId)
        : (team.weeklyPoints ?? 0);

      return (
        <div className="text-xs font-semibold text-white flex items-center">
          <span className="truncate min-w-0 flex-1">{team.teamName}</span>
          {typeof team.weeklyPoints === 'number' && displayWeek >= 12 && (
            <span className="ml-1 text-blue-400 flex-shrink-0">
              ({pointsToShow})
            </span>
          )}
        </div>
      );
    };

    const getWinnerDisplay = (matchup, teamKey) => {
      if (!matchup || !matchup.completed) return null;
      if (matchup.winner === teamKey) {
        return <div className="absolute -right-1 -top-1 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center text-[8px]">✓</div>;
      }
      return null;
    };

    return (
      <div className="p-4 bg-white/5 rounded-xl">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {/* Week 12 - Quarterfinals & Byes */}
          <div className="flex flex-col gap-2">
            <div className="text-[10px] font-bold text-green-400 text-center mb-1">WEEK 12</div>

            {/* Top Bye */}
            {champ.week12?.byes?.[0] && (
              <div className="bg-yellow-500/20 border border-yellow-400/40 rounded-lg p-2">
                <div className="text-[9px] text-yellow-400 font-bold mb-0.5">BYE - Seed 1</div>
                {getTeamDisplay(champ.week12.byes[0], 12)}
              </div>
            )}

            {/* QF1 */}
            <div className="bg-white/10 border border-white/20 rounded-lg p-2">
              <div className="text-[9px] text-white/60 font-bold mb-1">QF1</div>
              <div className="space-y-1">
                <div className={`relative rounded p-1 ${
                  champ.week12?.QF1?.completed && champ.week12?.QF1?.winner === 'team1'
                    ? 'bg-green-500/20'
                    : 'bg-white/5'
                }`}>
                  {getTeamDisplay(champ.week12?.QF1?.team1, 12)}
                </div>
                <div className="text-center text-[8px] text-white/40">vs</div>
                <div className={`relative rounded p-1 ${
                  champ.week12?.QF1?.completed && champ.week12?.QF1?.winner === 'team2'
                    ? 'bg-green-500/20'
                    : 'bg-white/5'
                }`}>
                  {getTeamDisplay(champ.week12?.QF1?.team2, 12)}
                </div>
              </div>
            </div>

            {/* QF2 */}
            <div className="bg-white/10 border border-white/20 rounded-lg p-2">
              <div className="text-[9px] text-white/60 font-bold mb-1">QF2</div>
              <div className="space-y-1">
                <div className={`relative rounded p-1 ${
                  champ.week12?.QF2?.completed && champ.week12?.QF2?.winner === 'team1'
                    ? 'bg-green-500/20'
                    : 'bg-white/5'
                }`}>
                  {getTeamDisplay(champ.week12?.QF2?.team1, 12)}
                </div>
                <div className="text-center text-[8px] text-white/40">vs</div>
                <div className={`relative rounded p-1 ${
                  champ.week12?.QF2?.completed && champ.week12?.QF2?.winner === 'team2'
                    ? 'bg-green-500/20'
                    : 'bg-white/5'
                }`}>
                  {getTeamDisplay(champ.week12?.QF2?.team2, 12)}
                </div>
              </div>
            </div>

            {/* Bottom Bye */}
            {champ.week12?.byes?.[1] && (
              <div className="bg-yellow-500/20 border border-yellow-400/40 rounded-lg p-2">
                <div className="text-[9px] text-yellow-400 font-bold mb-0.5">BYE - Seed 2</div>
                {getTeamDisplay(champ.week12.byes[1], 12)}
              </div>
            )}
          </div>

          {/* Week 13 - Semifinals */}
          <div className="flex flex-col gap-2">
            <div className="text-[10px] font-bold text-blue-400 text-center mb-1">WEEK 13</div>

{/* SF1 */}
          <div className="bg-white/10 border border-white/20 rounded-lg p-2">
            <div className="text-[9px] text-white/60 font-bold mb-1">SF1</div>
            <div className="space-y-1">
              <div className={`relative rounded p-1 ${
                displayWeek >= 13 && champ.week13?.SF1?.completed && champ.week13?.SF1?.winner === 'team1'
                  ? 'bg-green-500/20'
                  : 'bg-white/5'
              }`}>
                {displayWeek >= 13 ? (
                  getTeamDisplay(champ.week13?.SF1?.team1, 13)
                ) : (
                  <div className="text-[10px] text-yellow-400 italic">#1 Seed</div>
                )}
              </div>
              <div className="text-center text-[8px] text-white/40">vs</div>
              <div className={`relative rounded p-1 ${
                displayWeek >= 13 && champ.week13?.SF1?.completed && champ.week13?.SF1?.winner === 'team2'
                  ? 'bg-green-500/20'
                  : 'bg-white/5'
              }`}>
                {displayWeek >= 13 ? (
                  getTeamDisplay(champ.week13?.SF1?.team2, 13)
                ) : (
                  <div className="text-[10px] text-white/50 italic">Lowest Scoring QF Winner</div>
                )}
              </div>
            </div>
          </div>

          {/* SF2 */}
          <div className="bg-white/10 border border-white/20 rounded-lg p-2">
            <div className="text-[9px] text-white/60 font-bold mb-1">SF2</div>
            <div className="space-y-1">
              <div className={`relative rounded p-1 ${
                displayWeek >= 13 && champ.week13?.SF2?.completed && champ.week13?.SF2?.winner === 'team1'
                  ? 'bg-green-500/20'
                  : 'bg-white/5'
              }`}>
                {displayWeek >= 13 ? (
                  getTeamDisplay(champ.week13?.SF2?.team1, 13)
                ) : (
                  <div className="text-[10px] text-white/50 italic">Top Scoring QF Winner</div>
                )}
              </div>
              <div className="text-center text-[8px] text-white/40">vs</div>
              <div className={`relative rounded p-1 ${
                displayWeek >= 13 && champ.week13?.SF2?.completed && champ.week13?.SF2?.winner === 'team2'
                  ? 'bg-green-500/20'
                  : 'bg-white/5'
              }`}>
                {displayWeek >= 13 ? (
                  getTeamDisplay(champ.week13?.SF2?.team2, 13)
                ) : (
                  <div className="text-[10px] text-yellow-400 italic">#2 Seed</div>
                )}
              </div>
            </div>
          </div>

            {/* Consolation QF placeholder */}
            {displayWeek >= 13 && (
              <div className="bg-white/5 border border-white/10 rounded-lg p-2">
                <div className="text-[9px] text-white/40 font-bold mb-1 text-center">Consolation</div>
                <div className="text-[8px] text-white/40 text-center">QF Losers</div>
              </div>
            )}
          </div>

        {/* Week 14 - Finals */}
          {displayWeek >= 14 && (
            <div className="flex flex-col gap-2 col-span-2 md:col-span-1">
              <div className="text-[10px] font-bold text-yellow-400 text-center mb-1">WEEK 14</div>

              {/* Championship */}
              <div className="bg-gradient-to-br from-yellow-500/20 to-yellow-600/20 border-2 border-yellow-400/50 rounded-lg p-2">
                <div className="text-[9px] text-yellow-400 font-bold mb-1 flex items-center justify-center gap-1">
                  <span>🏆</span> CHAMPIONSHIP
                </div>
                <div className="space-y-1">
                  <div className="relative bg-white/10 rounded p-1">
                    {getTeamDisplay(champ.week14?.championship?.team1, 14)}
                    {getWinnerDisplay(champ.week14?.championship, 'team1')}
                  </div>
                  <div className="text-center text-[8px] text-white/40">vs</div>
                  <div className="relative bg-white/10 rounded p-1">
                    {getTeamDisplay(champ.week14?.championship?.team2, 14)}
                    {getWinnerDisplay(champ.week14?.championship, 'team2')}
                  </div>
                </div>
              </div>

              {/* 3rd Place */}
              <div className="bg-white/10 border border-white/20 rounded-lg p-2">
                <div className="text-[9px] text-white/60 font-bold mb-1 text-center">3rd Place</div>
                <div className="space-y-1">
                  <div className="relative bg-white/10 rounded p-1">
                    {getTeamDisplay(champ.week14?.thirdPlace?.team1, 14)}
                    {getWinnerDisplay(champ.week14?.thirdPlace, 'team1')}
                  </div>
                  <div className="text-center text-[8px] text-white/40">vs</div>
                  <div className="relative bg-white/10 rounded p-1">
                    {getTeamDisplay(champ.week14?.thirdPlace?.team2, 14)}
                    {getWinnerDisplay(champ.week14?.thirdPlace, 'team2')}
                  </div>
                </div>
              </div>

              {/* 5th Place */}
              <div className="bg-white/10 border border-white/20 rounded-lg p-2">
                <div className="text-[9px] text-white/60 font-bold mb-1 text-center">5th Place</div>
                <div className="space-y-1">
                  <div className="relative bg-white/10 rounded p-1">
                    {getTeamDisplay(champ.week14?.fifthPlace?.team1, 14)}
                    {getWinnerDisplay(champ.week14?.fifthPlace, 'team1')}
                  </div>
                  <div className="text-center text-[8px] text-white/40">vs</div>
                  <div className="relative bg-white/10 rounded p-1">
                    {getTeamDisplay(champ.week14?.fifthPlace?.team2, 14)}
                    {getWinnerDisplay(champ.week14?.fifthPlace, 'team2')}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Loser Bracket Diagram
  const LoserDiagram = () => {
    const loser = bracket?.loserBracket;
    if (!loser) return null;

    const miniLeague = loser.miniLeague?.participants || [];
    const week12Pts = loser.miniLeague?.week12Points || {};
    const week13Pts = loser.miniLeague?.week13Points || {};
    const totalPts = loser.miniLeague?.totalPoints || {};
    const toiletBowlParticipant = loser.toiletBowlParticipant;

    // Calculate standings with points
    const standingsWithPoints = miniLeague.map(p => ({
      ...p,
      week12: week12Pts[p.userId] || 0,
      week13: week13Pts[p.userId] || 0,
      total: totalPts[p.userId] || (week12Pts[p.userId] || 0) + (week13Pts[p.userId] || 0)
    })).sort((a, b) => b.total - a.total);

    return (
      <div className="p-4 bg-white/5 rounded-xl">
        <div className="flex justify-between items-start gap-3 overflow-x-auto pb-2">
          {/* Week 12-13 Mini League with Color Coding */}
          <div className="flex flex-col gap-2 min-w-[180px]">
            <div className="text-[10px] font-bold text-purple-400 text-center mb-2">WEEK 12-13</div>

            <div className="bg-purple-500/20 border border-purple-400/40 rounded-lg p-3">
              <div className="text-[9px] text-purple-400 font-bold mb-2 text-center">#1 Pick Shootout</div>
              <div className="space-y-1">
                {standingsWithPoints.map((participant, idx) => {
                  const isTop2 = idx < 2;
                  const isLast = idx === standingsWithPoints.length - 1;

                  return (
                    <div
                      key={participant.userId}
                      className={`flex items-center justify-between gap-2 rounded p-1.5 ${
                        isTop2 ? 'bg-green-500/20 border border-green-400/30' :
                        isLast ? 'bg-red-500/20 border border-red-400/30' :
                        'bg-white/5'
                      }`}
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <div className={`text-[9px] font-bold w-4 ${
                          isTop2 ? 'text-green-400' :
                          isLast ? 'text-red-400' :
                          'text-white/60'
                        }`}>
                          #{idx + 1}
                        </div>
                        <div className="text-xs text-white truncate">{participant.teamName}</div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="text-xs text-blue-400 font-bold">{participant.total}</div>
                        {/* Indicator arrow */}
                        <div className={`text-[10px] ${
                          isTop2 ? 'text-green-400' :
                          isLast ? 'text-red-400' :
                          'text-white/30'
                        }`}>
                          →
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Toilet Bowl Participant */}
            {toiletBowlParticipant && (
              <div className="bg-orange-500/20 border border-orange-400/40 rounded-lg p-2">
                <div className="text-[9px] text-orange-400 font-bold mb-1">SITS OUT</div>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs text-white truncate">{toiletBowlParticipant.teamName}</div>
                    <div className="text-[8px] text-white/40 mt-0.5">Seed #{toiletBowlParticipant.seed}</div>
                  </div>
                  <div className="text-[10px] text-orange-400">→</div>
                </div>
              </div>
            )}
          </div>

          {/* Week 14 - Placement Games */}
          <div className="flex flex-col gap-2 min-w-[140px]">
            <div className="text-[10px] font-bold text-orange-400 text-center mb-2">WEEK 14</div>

            {/* 1st Pick Game (Top 2 from Mini League) */}
            <div className="bg-green-500/20 border-2 border-green-400/50 rounded-lg p-2">
              <div className="text-[9px] text-green-400 font-bold mb-1 flex items-center justify-center gap-1">
                <span>🎯</span> 1ST PICK GAME
              </div>
              <div className="space-y-1">
                <div className="bg-white/10 rounded p-1">
                  <div className="text-xs text-white truncate">
                    {displayWeek >= 14 && loser.week14?.firstPickGame?.team1?.teamName || '#1 Seed'}
                  </div>
                </div>
                <div className="text-center text-[8px] text-white/40">vs</div>
                <div className="bg-white/10 rounded p-1">
                  <div className="text-xs text-white truncate">
                    {displayWeek >= 14 && loser.week14?.firstPickGame?.team2?.teamName || '#2 Seed'}
                  </div>
                </div>
              </div>
            </div>

            {/* 7th Place Game */}
            <div className="bg-white/10 border border-white/20 rounded-lg p-2">
              <div className="text-[9px] text-white/60 font-bold mb-1 text-center">7TH PLACE</div>
              <div className="text-[8px] text-white/60 text-center">
                {displayWeek >= 14 ? (
                  <>
                    <div>{loser.week14?.seventhPlace?.team1?.teamName || 'Mini #3'}</div>
                    <div className="text-white/40 my-0.5">vs</div>
                    <div>{loser.week14?.seventhPlace?.team2?.teamName || 'Mini #4'}</div>
                  </>
                ) : (
                  'Mini #3 vs #4'
                )}
              </div>
            </div>

            {/* Toilet Bowl */}
            <div className="bg-gradient-to-br from-orange-500/20 to-red-500/20 border-2 border-red-400/50 rounded-lg p-2">
              <div className="text-[9px] text-red-400 font-bold mb-1 flex items-center justify-center gap-1">
                <span>🚽</span> TOILET BOWL
              </div>
              <div className="space-y-1">
                <div className="bg-white/10 rounded p-1">
                  <div className="text-xs text-white truncate">
                    {displayWeek >= 14 && loser.week14?.toiletBowl?.team1?.teamName || '#5 Seed'}
                  </div>
                </div>
                <div className="text-center text-[8px] text-white/40">vs</div>
                <div className="bg-white/10 rounded p-1">
                  <div className="text-xs text-white truncate">
                    {displayWeek >= 14 && loser.week14?.toiletBowl?.team2?.teamName || toiletBowlParticipant?.teamName || 'Seed #12'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white/10 backdrop-blur-lg rounded-xl border border-white/20 mb-6 overflow-hidden">
      {/* Tab Headers */}
      <div className="flex border-b border-white/20">
        <button
          onClick={() => setActiveTab('championship')}
          className={`flex-1 px-4 py-3 text-sm font-bold transition-all ${
            activeTab === 'championship'
              ? 'bg-white/10 text-yellow-400 border-b-2 border-yellow-400'
              : 'text-white/60 hover:text-white/80 hover:bg-white/5'
          }`}
        >
          🏆 Championship Bracket
        </button>
        <button
          onClick={() => setActiveTab('loser')}
          className={`flex-1 px-4 py-3 text-sm font-bold transition-all ${
            activeTab === 'loser'
              ? 'bg-white/10 text-purple-400 border-b-2 border-purple-400'
              : 'text-white/60 hover:text-white/80 hover:bg-white/5'
          }`}
        >
          🎯 Loser Bracket
        </button>
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === 'championship' ? <ChampionshipDiagram /> : <LoserDiagram />}
      </div>
    </div>
  );
};

export default PlayoffBracketDiagram;
