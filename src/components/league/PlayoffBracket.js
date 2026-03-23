import React from "react";

export const MatchupCard = ({ matchup, allTeams, TeamLogo, featured = false, members }) => {
  if (!matchup) return null;

  const team1 = matchup.team1;
  const team2 = matchup.team2;

  // ADD THIS NEW HELPER FUNCTION
  const getMemberCurrentWeeklyPoints = (userId) => {
    const member = members?.find(m => m.id === userId);
    return member?.weeklyPoints || 0;
  };

  // Helper to get full member data
  const getMemberData = (userId) => {
    const member = members?.find(m => m.id === userId);
    if (!member) return {
      starters: [],
      bench: [],
      captain: null,
      tripPlayTeam: null,
      teamAvatar: null,
      smackTalk: null,
      firstName: 'Unknown'
    };

    const lineup = member.lineup || {};
    const starters = Array.isArray(lineup.starters) ? lineup.starters : [];
    const bench = Array.isArray(lineup.bench) ? lineup.bench : [];

    return {
      starters,
      bench,
      captain: member.captain,
      tripPlayTeam: member.tripPlayTeam,
      teamAvatar: member.teamAvatar,
      smackTalk: member.smackTalk,
      firstName: member.firstName || 'Unknown'
    };
  };

  // Team Display Component
  const TeamDisplay = ({ team, isWinner }) => {
    if (!team) return null;

    const { starters, bench, captain, tripPlayTeam, teamAvatar, smackTalk, firstName } = getMemberData(team.userId);

    // Handle custom uploaded images vs preset avatars
    const isCustomUpload = teamAvatar && (teamAvatar.startsWith('http') || teamAvatar.startsWith('data:'));

    return (
      <div className={`p-4 rounded-lg ${
        isWinner ? 'bg-green-500/20 border-2 border-green-400/50' : 'bg-white/5 border border-white/10'
      }`}>
        {/* Header: Manager Avatar, Team Name, Seed, Points */}
        <div className="flex items-center gap-3 mb-4">
          {/* Manager Avatar */}
          <div className="relative flex-shrink-0">
            <div
              className="rounded-full flex items-center justify-center font-bold overflow-hidden border-2 border-white/30 shadow-lg"
              style={{
                width: 48,
                height: 48,
                backgroundColor: isWinner ? '#10b981' : '#6366f1'
              }}
            >
              {teamAvatar ? (
                isCustomUpload ? (
                  <img
                    src={teamAvatar}
                    alt={`${firstName}'s avatar`}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-r from-purple-500 to-blue-500 text-white text-xs font-bold flex items-center justify-center">
                    {['avatar1.png', 'avatar2.png', 'avatar3.png', 'avatar4.png', 'avatar5.png', 'avatar6.png', 'avatar7.png', 'avatar8.png'].indexOf(teamAvatar) + 1}
                  </div>
                )
              ) : (
                <div className="w-full h-full flex items-center justify-center text-white text-lg font-bold">
                  {firstName ? firstName.charAt(0).toUpperCase() : '?'}
                </div>
              )}
            </div>
            {/* Seed Badge */}
            <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-white/90 flex items-center justify-center text-xs font-bold shadow-lg border-2 border-white" style={{ color: '#1e293b' }}>
              {team.seed}
            </div>
          </div>

          {/* Team Info */}
          <div className="flex-1 min-w-0">
            <div className="font-bold text-white text-base truncate">{team.teamName}</div>
            <div className="text-xs text-white/60">{firstName}</div>
          </div>

          {/* Weekly Points */}
          {typeof team.weeklyPoints === 'number' && (
            <div className="text-2xl font-black text-white">{getMemberCurrentWeeklyPoints(team.userId)}</div>
          )}
        </div>

        {/* Smack Talk */}
        {smackTalk && smackTalk.trim() && (
          <div className="mb-3">
            <div className="bg-gradient-to-r from-blue-500/20 to-purple-500/20 border border-blue-400/30 text-white px-3 py-2 rounded-lg text-xs font-medium relative">
              <span className="mr-1">💬</span>
              {smackTalk}
            </div>
          </div>
        )}

{/* Team Roster - Single Line with Divider - Responsive sizing */}
        <div className="flex items-start gap-2">
          {/* Starters */}
          <div>
            <div className="text-[10px] font-semibold text-green-400 uppercase tracking-wider mb-3 flex items-center gap-1">
              <span>⭐</span> Starters
            </div>
            <div className="flex gap-1">
              {starters.slice(0, 5).map((teamName, idx) => (
                <TeamLogo
                  key={`starter-${idx}`}
                  teamName={teamName}
                  size={32}
                  clickable={true}
                  isCaptain={captain === teamName}
                  isTripPlay={tripPlayTeam === teamName}
                />
              ))}
              {/* Empty starter slots */}
              {Array.from({ length: Math.max(0, 5 - starters.length) }).map((_, emptyIdx) => (
                <div key={`empty-starter-${emptyIdx}`} className="w-[32px] h-[32px] rounded-full border-2 border-dashed border-green-400/40 flex items-center justify-center bg-green-400/10">
                  <div className="w-2 h-2 rounded-full bg-green-400/40" />
                </div>
              ))}
            </div>
          </div>

          {/* Vertical Divider */}
          <div className="w-px bg-gradient-to-b from-transparent via-white/30 to-transparent self-stretch"></div>

          {/* Bench */}
          <div>
            <div className="text-[10px] font-semibold text-orange-400 uppercase tracking-wider mb-3 flex items-center gap-1">
              <span>📋</span> Bench
            </div>
            <div className="flex gap-1">
              {bench.slice(0, 2).map((teamName, idx) => (
                <TeamLogo
                  key={`bench-${idx}`}
                  teamName={teamName}
                  size={32}
                  clickable={true}
                  isCaptain={false}
                  isTripPlay={false}
                />
              ))}
              {/* Empty bench slots */}
              {Array.from({ length: Math.max(0, 2 - bench.length) }).map((_, emptyIdx) => (
                <div key={`empty-bench-${emptyIdx}`} className="w-[32px] h-[32px] rounded-full border-2 border-dashed border-orange-400/40 flex items-center justify-center bg-orange-400/10">
                  <div className="w-2 h-2 rounded-full bg-orange-400/40" />
                </div>
              ))}
            </div>
          </div>
        </div>
              </div>
            );
          };

  return (
    <>
      {/* Matchup Header - Outside the card */}
      <div className="text-center mb-3">
        <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full ${
          featured ? 'bg-yellow-500/20 border border-yellow-400/50' : 'bg-white/10 border border-white/20'
        }`}>
          <div className="text-sm font-bold text-white">{matchup.matchupName}</div>
          {matchup.prizes && (
            <>
              <div className="w-px h-4 bg-white/20"></div>
              <div className="text-xs text-white/60">
                {matchup.prizes.winner.money && `💰$${matchup.prizes.winner.money} • `}
                🎯 Pick #{matchup.prizes.winner.draftPick}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Team 1 */}
      {team1 && (
        <TeamDisplay
          team={team1}
          isWinner={matchup.completed && matchup.winner === 'team1'}
        />
      )}

      {/* VS Divider */}
      <div className="flex items-center justify-center my-3">
        <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent"></div>
        <div className="px-4 text-sm font-bold text-white/60">VS</div>
        <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent"></div>
      </div>

      {/* Team 2 */}
      {team2 ? (
        <TeamDisplay
          team={team2}
          isWinner={matchup.completed && matchup.winner === 'team2'}
        />
      ) : (
        <div className="flex items-center justify-center p-8 rounded-lg bg-white/5 border border-dashed border-white/20 text-white/40 text-sm font-medium">
          To Be Determined
        </div>
      )}

      {/* Final Status */}
      {matchup.completed && (
        <div className="mt-4 text-center">
          <div className="inline-flex items-center gap-2 bg-green-500/20 border border-green-400/40 text-green-400 px-4 py-2 rounded-full text-xs font-bold">
            <span>✓</span> FINAL
          </div>
        </div>
      )}
    </>
  );
};

export const MiniLeagueStandings = ({ miniLeague, currentWeek, allTeams, TeamLogo, members }) => {
  const participants = miniLeague.participants || [];
  const week12Pts = miniLeague.week12Points || {};
  const week13Pts = miniLeague.week13Points || {};
  const totalPts = miniLeague.totalPoints || {};

  // ADD THIS NEW HELPER FUNCTION
  const getMemberCurrentWeeklyPoints = (userId) => {
    const member = members?.find(m => m.id === userId);
    return member?.weeklyPoints || 0;
  };

  // Helper to get full member data
  const getMemberData = (userId) => {
    const member = members?.find(m => m.id === userId);
    if (!member) return {
      starters: [],
      bench: [],
      captain: null,
      tripPlayTeam: null,
      teamAvatar: null,
      smackTalk: null,
      firstName: 'Unknown'
    };

    const lineup = member.lineup || {};
    const starters = Array.isArray(lineup.starters) ? lineup.starters : [];
    const bench = Array.isArray(lineup.bench) ? lineup.bench : [];

    return {
      starters,
      bench,
      captain: member.captain,
      tripPlayTeam: member.tripPlayTeam,
      teamAvatar: member.teamAvatar,
      smackTalk: member.smackTalk,
      firstName: member.firstName || 'Unknown'
    };
  };

  const standings = participants.map(p => {
      // Use live weekly points for Week 13 if we're currently in Week 13
      const week13Points = currentWeek >= 13 ? getMemberCurrentWeeklyPoints(p.userId) : (week13Pts[p.userId] || 0);

      return {
        ...p,
        week12: week12Pts[p.userId] || 0,
        week13: week13Points,
        total: (week12Pts[p.userId] || 0) + week13Points
      };
    }).sort((a, b) => b.total - a.total);

  return (
    <div className="space-y-3">
      {standings.map((team, idx) => {
        const { starters, bench, captain, tripPlayTeam, teamAvatar, smackTalk, firstName } = getMemberData(team.userId);

        // Handle custom uploaded images vs preset avatars
        const isCustomUpload = teamAvatar && (teamAvatar.startsWith('http') || teamAvatar.startsWith('data:'));

        // Rank styling
        const isFirst = idx === 0;
        const isLast = idx === standings.length - 1;

        return (
          <div
            key={team.userId}
            className={`p-4 rounded-xl border-2 ${
              isFirst ? 'bg-green-500/10 border-green-400/40' :
              isLast ? 'bg-red-500/10 border-red-400/40' :
              'bg-white/5 border-white/10'
            }`}
          >
            {/* Header: Manager Avatar, Team Info, Points */}
            <div className="flex items-center gap-3 mb-3">
              {/* Manager Avatar */}
              <div className="relative flex-shrink-0">
                <div
                  className="rounded-full flex items-center justify-center font-bold overflow-hidden border-2 border-white/30 shadow-lg"
                  style={{
                    width: 40,
                    height: 40,
                    backgroundColor: isFirst ? '#10b981' : isLast ? '#ef4444' : '#6366f1'
                  }}
                >
                  {teamAvatar ? (
                    isCustomUpload ? (
                      <img
                        src={teamAvatar}
                        alt={`${firstName}'s avatar`}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-r from-purple-500 to-blue-500 text-white text-xs font-bold flex items-center justify-center">
                        {['avatar1.png', 'avatar2.png', 'avatar3.png', 'avatar4.png', 'avatar5.png', 'avatar6.png', 'avatar7.png', 'avatar8.png'].indexOf(teamAvatar) + 1}
                      </div>
                    )
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-white text-base font-bold">
                      {firstName ? firstName.charAt(0).toUpperCase() : '?'}
                    </div>
                  )}
                </div>
                {/* Seed Badge */}
                <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-white/90 flex items-center justify-center text-[10px] font-bold shadow-lg border-2 border-white" style={{ color: '#1e293b' }}>
                  {team.seed}
                </div>
              </div>

              {/* Team Info */}
              <div className="flex-1 min-w-0">
                <div className="font-bold text-white text-sm truncate">{team.teamName}</div>
                <div className="text-xs text-white/60">{firstName}</div>
              </div>

              {/* Points Breakdown */}
              <div className="text-right">
                <div className="text-xl font-black text-blue-400">{team.total}</div>
                <div className="text-[10px] text-white/60 space-x-1.5">
                  <span>W12: {team.week12}</span>
                  {currentWeek >= 13 && <span>W13: {team.week13}</span>}
                </div>
              </div>
            </div>

            {/* Smack Talk */}
            {smackTalk && smackTalk.trim() && (
              <div className="mb-3">
                <div className="bg-gradient-to-r from-blue-500/20 to-purple-500/20 border border-blue-400/30 text-white px-3 py-2 rounded-lg text-xs font-medium relative">
                  <span className="mr-1">💬</span>
                  {smackTalk}
                </div>
              </div>
            )}

            {/* Team Roster - Single Line with Divider - Responsive sizing */}
            <div className="flex items-start gap-2">
              {/* Starters */}
              <div>
                <div className="text-[10px] font-semibold text-green-400 uppercase tracking-wider mb-3 flex items-center gap-1">
                  <span>⭐</span> Starters
                </div>
                <div className="flex gap-1">
                  {starters.slice(0, 5).map((teamName, teamIdx) => (
                    <TeamLogo
                      key={`starter-${teamIdx}`}
                      teamName={teamName}
                      size={32}
                      clickable={true}
                      isCaptain={captain === teamName}
                      isTripPlay={tripPlayTeam === teamName}
                    />
                  ))}
                  {/* Empty starter slots */}
                  {Array.from({ length: Math.max(0, 5 - starters.length) }).map((_, emptyIdx) => (
                    <div key={`empty-starter-${emptyIdx}`} className="w-[32px] h-[32px] rounded-full border-2 border-dashed border-green-400/40 flex items-center justify-center bg-green-400/10">
                      <div className="w-2 h-2 rounded-full bg-green-400/40" />
                    </div>
                  ))}
                </div>
              </div>

              {/* Vertical Divider */}
              <div className="w-px bg-gradient-to-b from-transparent via-white/30 to-transparent self-stretch"></div>

              {/* Bench */}
              <div>
                <div className="text-[10px] font-semibold text-orange-400 uppercase tracking-wider mb-3 flex items-center gap-1">
                  <span>📋</span> Bench
                </div>
                <div className="flex gap-1">
                  {bench.slice(0, 2).map((teamName, teamIdx) => (
                    <TeamLogo
                      key={`bench-${teamIdx}`}
                      teamName={teamName}
                      size={32}
                      clickable={true}
                      isCaptain={false}
                      isTripPlay={false}
                    />
                  ))}
                  {/* Empty bench slots */}
                  {Array.from({ length: Math.max(0, 2 - bench.length) }).map((_, emptyIdx) => (
                    <div key={`empty-bench-${emptyIdx}`} className="w-[32px] h-[32px] rounded-full border-2 border-dashed border-orange-400/40 flex items-center justify-center bg-orange-400/10">
                      <div className="w-2 h-2 rounded-full bg-orange-400/40" />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Status Badge for First/Last - Equal spacing top and bottom */}
            {(isFirst || isLast) && (
              <div className="mt-3 text-center">
                <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold ${
                  isFirst ? 'bg-green-500/20 border border-green-400/40 text-green-400' :
                  'bg-red-500/20 border border-red-400/40 text-red-400'
                }`}>
                  {isFirst ? '🎯 Mini League Winner' : '⚠️ Toilet Bowl Bound'}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

const PlayoffBracket = ({ bracket, allTeams, TeamLogo, viewMode, selectedWeek, currentWeek, members }) => {  if (!bracket) return null;

  const getCurrentWeekNumber = () => {
    if (typeof currentWeek === 'number') return currentWeek;
    if (!currentWeek || typeof currentWeek !== 'string') return 1;
    const weekMatch = currentWeek.match(/\d+/);
    return weekMatch ? parseInt(weekMatch[0]) : 1;
  };

  const currentWeekNum = getCurrentWeekNumber();
  const displayWeek = viewMode === 'current' ? currentWeekNum : selectedWeek;

  // Championship Bracket Component
  const ChampionshipBracket = () => {
    const champ = bracket.championshipBracket;

    return (
      <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20 mb-6">
        <h2 className="text-2xl font-bold text-white mb-6 text-center">
          🏆 Championship Bracket
        </h2>

        {/* Week 12 - Quarterfinals - Only show during Week 12 */}
        {displayWeek === 12 && (
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-green-400 mb-4">Week 12 - Quarterfinals</h3>
            <div className="grid md:grid-cols-2 gap-4">
              <MatchupCard matchup={champ.week12.QF1} allTeams={allTeams} TeamLogo={TeamLogo} members={members}/>
              <MatchupCard matchup={champ.week12.QF2} allTeams={allTeams} TeamLogo={TeamLogo} members={members}/>
            </div>
            {champ.week12.byes && (
              <div className="mt-4 text-center text-white/70 text-sm">
                Byes: {champ.week12.byes.map(b => b.teamName).join(', ')}
              </div>
            )}
          </div>
        )}

        {/* Week 13 - Semifinals - Only show during Week 13 */}
        {displayWeek === 13 && (
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-blue-400 mb-4">Week 13 - Semifinals</h3>
            <div className="grid md:grid-cols-3 gap-4">
              <MatchupCard matchup={champ.week13.SF1} allTeams={allTeams} TeamLogo={TeamLogo} members={members}/>
              <MatchupCard matchup={champ.week13.SF2} allTeams={allTeams} TeamLogo={TeamLogo} members={members}/>
              <MatchupCard matchup={champ.week13.consolationQF} allTeams={allTeams} TeamLogo={TeamLogo} members={members}/>
            </div>
          </div>
        )}

        {/* Week 14 - Finals - Only show during Week 14 */}
        {displayWeek === 14 && (
          <div>
            <h3 className="text-lg font-semibold text-yellow-400 mb-4">Week 14 - Finals</h3>
            <div className="grid md:grid-cols-3 gap-4">
              <MatchupCard matchup={champ.week14.championship} allTeams={allTeams} TeamLogo={TeamLogo} featured members={members}/>
              <MatchupCard matchup={champ.week14.thirdPlace} allTeams={allTeams} TeamLogo={TeamLogo} members={members}/>
              <MatchupCard matchup={champ.week14.fifthPlace} allTeams={allTeams} TeamLogo={TeamLogo} members={members}/>
            </div>
          </div>
        )}
      </div>
    );
  };

  // Loser Bracket Component
  const LoserBracket = () => {
    const loser = bracket.loserBracket;

    return (
      <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20">
        <h2 className="text-2xl font-bold text-white mb-6 text-center">
          🎯 Loser Bracket
        </h2>

        {/* Mini League Standings - Only show during Weeks 12-13 */}
        {(displayWeek === 12 || displayWeek === 13) && (
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-purple-400 mb-4">
              #1 Pick Shootout (Week 12-13)
            </h3>
            <MiniLeagueStandings
              miniLeague={loser.miniLeague}
              currentWeek={displayWeek}
              allTeams={allTeams}
              TeamLogo={TeamLogo}
              members={members}
            />
            <div className="mt-4 text-center text-white/60 text-sm">
              Toilet Bowl Participant: {loser.toiletBowlParticipant.teamName} (sits out until Week 14)
            </div>
          </div>
        )}

        {/* Week 14 - Placement Games - Only show during Week 14 */}
        {displayWeek === 14 && (
          <div>
            <h3 className="text-lg font-semibold text-orange-400 mb-4">Week 14 - Placement Games</h3>
            <div className="grid md:grid-cols-3 gap-4">
              <MatchupCard matchup={loser.week14.firstPickGame} allTeams={allTeams} TeamLogo={TeamLogo} members={members}/>
              <MatchupCard matchup={loser.week14.seventhPlace} allTeams={allTeams} TeamLogo={TeamLogo} members={members}/>
              <MatchupCard matchup={loser.week14.toiletBowl} allTeams={allTeams} TeamLogo={TeamLogo} featured members={members}/>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <ChampionshipBracket />
      <LoserBracket />
    </>
  );
};

export default PlayoffBracket;
