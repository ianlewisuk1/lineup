// TeamSlot.js — Team card with captain/trip play actions, extracted from WeeklyLineupManager
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Lock, ChevronDown, ChevronUp, Crown, Zap, Snowflake } from 'lucide-react';
import { weeklyLineupUtils } from '../../utils/weeklyLineupUtils';
import {
  isTeamLocked,
  getTeamGameInfo,
  getGameDisplayInfo,
  getGameSpreadDisplay,
  calculateCombinedPoints,
} from '../../utils/gameStatus';

const TeamSlot = ({
  team,
  section,
  index,
  size = 42,
  week,
  currentWeek,
  leagueId,
  canEdit,
  isSaving,
  captain,
  tripPlayTeam,
  hasTripPlay,
  frozenTeams = [],
  freezesRemaining = 0,
  TeamLogo,
  handleTeamMove,
  handleTeamCut,
  handleCaptainSelect,
  handleTripPlaySelect,
  handleFreezePlay,
}) => {
  const [showActions, setShowActions] = useState(false);
  const [lockStatus, setLockStatus] = useState({ locked: false, message: null });
  const [gameDisplayInfo, setGameDisplayInfo] = useState(null);

  useEffect(() => {
    const checkTeamLock = async () => {
      if (!team) {
        setLockStatus({ locked: false, message: null });
        return;
      }

      const teamName = team.school || team.name;
      const lockInfo = await isTeamLocked(teamName, week);
      setLockStatus({
        locked: lockInfo.locked,
        message: lockInfo.message,
        reason: lockInfo.reason
      });
    };

    checkTeamLock();
  }, [team, week]);

  useEffect(() => {
    const loadGameDisplayInfo = async () => {
      if (!team) {
        setGameDisplayInfo(null);
        return;
      }

      const teamName = team.school || team.name;
      const gameInfo = await getTeamGameInfo(teamName, week);
      const displayInfo = getGameDisplayInfo(gameInfo, teamName);

      if (gameInfo) {
        displayInfo.gameSpread = getGameSpreadDisplay(gameInfo, teamName);
      }

      setGameDisplayInfo(displayInfo);
    };

    loadGameDisplayInfo();
  }, [team, week]);

  if (!team) {
    return (
      <div className="flex items-center justify-center py-5 border-2 border-dashed border-white/15 rounded-xl min-h-[72px]">
        {canEdit ? (
          <Link
            to={`/${leagueId}/free-agents?returnWeek=${week}&section=${section}&index=${index}`}
            className="flex items-center gap-2 text-white/70 hover:text-white transition-colors duration-200 no-underline"
          >
            <div className="w-7 h-7 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center text-lg text-white transition-colors duration-200">+</div>
            <span className="font-semibold text-sm">Add Team</span>
          </Link>
        ) : (
          <div className="text-white/50 text-sm">Empty Slot</div>
        )}
      </div>
    );
  }

  const opponent = team.currentSeason?.nextOpponent;
  const isHome = team.currentSeason?.nextGameIsHome;
  const record = team.currentSeason?.record || '0-0';
  const baseGamePoints = team.currentSeason?.gamePoints || 0;
  const baseWeeklyPts = (team.currentSeason?.weeklyPoints?.[`week${week}`] || 0);

  const teamName = team.school || team.name;
  const normalizedTeamName = weeklyLineupUtils.normalizeTeamName(team);
  const isCaptain  = captain && captain === normalizedTeamName;
  const isTripPlay = tripPlayTeam && tripPlayTeam === normalizedTeamName;
  const isFrozen   = frozenTeams.includes(normalizedTeamName);

  // Calculate combined points for display
  const pointsInfo = calculateCombinedPoints(baseWeeklyPts, isCaptain, isTripPlay);

  return (
      <div className={`rounded-xl border overflow-hidden ${
        isCaptain && isTripPlay
          ? 'bg-gradient-to-br from-yellow-500/20 via-cyan-500/20 to-yellow-600/20 border-yellow-400/50 ring-2 ring-gradient-to-r ring-from-yellow-400/50 ring-to-cyan-400/50 shadow-lg shadow-yellow-400/20'
          : isCaptain
            ? 'bg-gradient-to-br from-yellow-500/20 to-yellow-600/20 border-yellow-400/50 ring-2 ring-yellow-400/50 shadow-lg shadow-yellow-400/20'
            : isTripPlay
              ? 'bg-gradient-to-br from-cyan-500/20 to-cyan-600/20 border-cyan-400/50 ring-2 ring-cyan-400/50 shadow-lg shadow-cyan-400/20'
              : lockStatus.locked
                ? 'border-red-400/50 bg-red-500/10'
                : 'bg-white/6 border-white/10'
      }`}>
      <div className="p-3">
        <div className="grid grid-cols-[44px,1fr,auto] gap-3 items-center">
          {/* LEFT: Logo + action toggle */}
          <div className="flex flex-col items-center gap-1">
            <div className="relative">
              <TeamLogo teamName={team.school} size={size} clickable={true} />

              {/* Captain badge */}
              {isCaptain && (
                <div className="absolute -top-2 -right-2 bg-yellow-500 rounded-full p-1">
                  <Crown size={12} className="text-white" />
                </div>
              )}

              {/* Trip Play badge */}
              {isTripPlay && (
                <div className="absolute -top-2 -left-2 bg-cyan-500 rounded-full p-1">
                  <Zap size={12} className="text-white" />
                </div>
              )}

              {/* Combined 5x indicator */}
              {isCaptain && isTripPlay && (
                <div className="absolute -bottom-2 left-1/2 transform -translate-x-1/2 bg-gradient-to-r from-yellow-500 to-cyan-500 rounded-full px-2 py-0.5">
                  <span className="text-white text-xs font-bold">5X</span>
                </div>
              )}

              {isFrozen && (
                <div className="absolute -bottom-1 -left-1 bg-blue-500 rounded-full p-1">
                  <Snowflake size={12} className="text-white" />
                </div>
              )}

              {lockStatus.locked && !isFrozen && (
                <div className="absolute -top-1 -left-1 bg-red-500 rounded-full p-1">
                  <Lock size={12} className="text-white" />
                </div>
              )}

              {gameDisplayInfo?.isLive && (
                <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 rounded-full animate-ping">
                  <div className="absolute inset-0 bg-green-500 rounded-full animate-pulse"></div>
                </div>
              )}
            </div>
            {canEdit && !lockStatus.locked && (
              <button
                onClick={() => setShowActions(!showActions)}
                className="p-1 hover:bg-white/10 rounded-md transition-colors duration-200"
                title="Team actions"
                aria-expanded={showActions}
                disabled={isSaving}
              >
                {showActions ? <ChevronUp size={16} className="text-white/80" /> : <ChevronDown size={16} className="text-white/80" />}
              </button>
            )}
          </div>

          {/* MIDDLE: Team + game row */}
          <div className="min-w-0">
            <div className={`font-semibold text-[15px] leading-tight truncate ${
              lockStatus.locked ? 'text-red-300' : 'text-white'
            }`}>
              {team.school}
              {lockStatus.locked && (
                <span className="ml-2 text-xs text-red-400">LOCKED</span>
              )}
            </div>
            <div className="text-xs text-white/70 truncate">
              {gameDisplayInfo?.subtext || (opponent ? `${isHome ? 'vs' : '@'} ${opponent}` : 'No next game set')}
            </div>

            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {gameDisplayInfo && (
                <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${gameDisplayInfo.chipClass}`}>
                  {gameDisplayInfo.display}
                </span>
              )}

              {/* Only show spread chip if not a bye week */}
              {!gameDisplayInfo?.hideSpread && (
                <span className="px-2 py-0.5 rounded-full text-[11px] bg-white/10 text-yellow-300/90">
                  {gameDisplayInfo?.gameSpread ? `Spread ${gameDisplayInfo.gameSpread}` : 'Line TBD'}
                </span>
              )}

              <span className="px-2 py-0.5 rounded-full text-[11px] bg-white/10 text-blue-300/90">
                {record}
              </span>
            </div>
          </div>

          {/* RIGHT: points column with multipliers */}
          <div className="text-right leading-tight">
            <div className="font-bold text-sm text-green-400">
              {baseGamePoints}
            </div>
            <div className="text-[11px] text-green-300/80 -mt-0.5">
              Season Points
            </div>
            <div className={`font-bold text-sm mt-1 ${
              isFrozen
                ? 'text-blue-400'
                : isCaptain && isTripPlay
                  ? 'text-purple-400'
                  : isCaptain
                    ? 'text-yellow-400'
                    : isTripPlay
                      ? 'text-cyan-400'
                      : 'text-orange-400'
            }`}>
              {pointsInfo.finalPoints}
            </div>
            <div className="text-[11px] -mt-0.5">
              {isFrozen
                ? <span className="text-blue-300/80 flex items-center justify-end gap-0.5"><Snowflake size={9} />Frozen</span>
                : <span className="text-orange-300/80">Weekly ({pointsInfo.multiplier})</span>
              }
            </div>
          </div>
        </div>
      </div>

      {/* Actions section with captain and trip play options */}
      {canEdit && showActions && !lockStatus.locked && (
        <div className="bg-white/6 border-t border-white/10 p-2.5">
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <button
                onClick={() => {
                  handleTeamMove(team, section, index, section === 'starters' ? 'bench' : 'starters');
                  setShowActions(false);
                }}
                disabled={isSaving}
                className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-500 text-white text-xs rounded-lg transition-colors font-medium"
              >
                {section === 'starters' ? '📋 Move to Bench' : '🚀 Move to Starters'}
              </button>
              <button
                onClick={() => { handleTeamCut(team, section, index); setShowActions(false); }}
                disabled={isSaving}
                className="px-3 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-500 text-white text-xs rounded-lg transition-colors font-medium"
              >
                🗑️ Cut
              </button>
            </div>

            {/* Freeze Play button — only shown during live games */}
            {gameDisplayInfo?.isLive && (
              <button
                onClick={() => {
                  if (isFrozen) return;
                  if (freezesRemaining <= 0) { alert('No freezes remaining this season.'); return; }
                  if (window.confirm(`Freeze ${teamName} at ${pointsInfo.finalPoints} pts? This cannot be undone. (${freezesRemaining} freeze${freezesRemaining === 1 ? '' : 's'} remaining)`)) {
                    handleFreezePlay(normalizedTeamName, pointsInfo.finalPoints);
                    setShowActions(false);
                  }
                }}
                disabled={isSaving || isFrozen || freezesRemaining <= 0}
                className={`w-full px-3 py-2 text-white text-xs rounded-lg transition-colors font-medium flex items-center justify-center gap-1.5 ${
                  isFrozen
                    ? 'bg-blue-700 cursor-default'
                    : freezesRemaining <= 0
                      ? 'bg-gray-500 cursor-not-allowed'
                      : 'bg-blue-500 hover:bg-blue-600'
                } disabled:opacity-70`}
              >
                <Snowflake size={12} />
                {isFrozen
                  ? `❄️ Score Frozen (${pointsInfo.finalPoints} pts)`
                  : freezesRemaining <= 0
                    ? '❄️ No Freezes Left'
                    : `❄️ Freeze at ${pointsInfo.finalPoints} pts (${freezesRemaining} left)`
                }
              </button>
            )}

            {/* Captain and Trip Play buttons - split the row */}
            <div className="flex gap-2">
              <button
                onClick={() => { handleCaptainSelect(teamName); setShowActions(false); }}
                disabled={isSaving || section === 'bench'}
                className={`flex-1 px-3 py-2 text-white text-xs rounded-lg transition-colors font-medium ${
                  section === 'bench'
                    ? 'bg-gray-500 cursor-not-allowed'
                    : isCaptain
                      ? 'bg-yellow-600 hover:bg-yellow-700'
                      : 'bg-purple-600 hover:bg-purple-700'
                } disabled:bg-gray-500`}
              >
                {section === 'bench'
                  ? '🪑 Bench (No Captain)'
                  : isCaptain
                    ? '👑 Remove Captain'
                    : '👑 Make Captain'
                }
              </button>

              <button
                onClick={() => { handleTripPlaySelect(teamName); setShowActions(false); }}
                disabled={isSaving || section === 'bench' || (!hasTripPlay && !isTripPlay)}
                className={`flex-1 px-3 py-2 text-white text-xs rounded-lg transition-colors font-medium ${
                  section === 'bench'
                    ? 'bg-gray-500 cursor-not-allowed'
                    : (!hasTripPlay && !isTripPlay)
                      ? 'bg-gray-500 cursor-not-allowed'
                      : isTripPlay
                        ? 'bg-cyan-600 hover:bg-cyan-700'
                        : 'bg-cyan-500 hover:bg-cyan-600'
                } disabled:bg-gray-500`}
              >
                {section === 'bench'
                  ? '🪑 Bench (No Trip)'
                  : (!hasTripPlay && !isTripPlay)
                    ? '⚡ Trip Used'
                    : isTripPlay
                      ? '⚡ Remove x3 Play'
                      : '⚡ Use x3 Play'
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TeamSlot;
