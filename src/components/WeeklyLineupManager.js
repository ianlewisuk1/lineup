// WeeklyLineupManager.js — Enhanced with Captain Selection Feature and Trip Play
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../supabase/supabase';
import { weeklyLineupUtils } from '../utils/weeklyLineupUtils';
import { ChevronLeft, ChevronRight, Crown, Zap, Clock, Lock, CheckCircle } from 'lucide-react';
import { useWeeklyLineup } from '../hooks/useWeeklyLineup';
import { canBeCaptain, canUseTripPlay, canMoveTeam } from '../utils/gameStatus';
import TeamSlot from './lineup/TeamSlot';
import ConfirmCutModal from './lineup/ConfirmCutModal';
import ReplaceTeamModal from './lineup/ReplaceTeamModal';

/* ---------- ModalPortal + useLockBodyScroll (kept here, re-exported for modal files) ---------- */
export function useLockBodyScroll(locked) {
  useEffect(() => {
    const { style } = document.body;
    const prevOverflow = style.overflow;
    const prevTouch = style.touchAction;

    if (locked) {
      style.overflow = 'hidden';
      style.touchAction = 'none';
    } else {
      style.overflow = '';
      style.touchAction = '';
    }

    return () => {
      style.overflow = prevOverflow;
      style.touchAction = prevTouch;
    };
  }, [locked]);
}

export const ModalPortal = ({ open, children }) => (open ? createPortal(children, document.body) : null);

/* ---------- WeeklyLineupManager ---------- */
const WeeklyLineupManager = ({
  leagueId,
  userId,
  allTeams,
  currentWeek,
  onTeamClick,
  TeamLogo,
  userDisplayName
}) => {
  const {
    selectedWeek,
    setSelectedWeek,
    weeklyLineups,
    loading,
    availableWeeks,
    hasTripPlay,
    tripPlayUsedWeek,
    saveLineup,
    getTripPlayStatusMessage,
    getWeekStatus,
    getStatusMessage,
  } = useWeeklyLineup({ leagueId, userId, currentWeek });

  const getWeekStatusIcon = (week) => {
    const status = getWeekStatus(week);
    switch (status) {
      case 'editable':       return <Clock className="text-green-400" size={16} />;
      case 'live':           return <div className="w-4 h-4 bg-red-500 rounded-full animate-pulse" />;
      case 'locked_playing': return <Lock className="text-yellow-400" size={16} />;
      case 'completed':      return <CheckCircle className="text-blue-400" size={16} />;
      default:               return <Lock className="text-gray-400" size={16} />;
    }
  };

  if (loading) {
    return (
      <div className="bg-white/10 rounded-2xl p-6 border border-white/20">
        <div className="text-center">
          <div className="text-2xl mb-2 animate-spin">🏈</div>
          <p className="text-white/80">Loading weekly lineups...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white/10 rounded-2xl border border-white/20 overflow-hidden">
      {/* Week Selector Header */}
      <div className="bg-white/5 p-4 border-b border-white/20">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setSelectedWeek(Math.max(1, selectedWeek - 1))}
            disabled={selectedWeek <= 1}
            className="p-2 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
          >
            <ChevronLeft size={20} />
          </button>

          <div className="text-center">
            <div className="flex items-center gap-2 justify-center mb-1">
              {getWeekStatusIcon(selectedWeek)}
              <h3 className="text-xl font-bold text-white">Week {selectedWeek}</h3>
              {selectedWeek === currentWeek && (
                <span className="bg-blue-500 text-white text-xs px-2 py-1 rounded-full font-medium">
                  Current
                </span>
              )}
              {selectedWeek < currentWeek && (
                <span className="bg-gray-500 text-white text-xs px-2 py-1 rounded-full font-medium">
                  Read Only
                </span>
              )}
            </div>
            <p className="text-xs text-white/60">{getStatusMessage(selectedWeek)}</p>

            {/* Trip Play Status Indicator */}
            {(hasTripPlay || tripPlayUsedWeek) && (
              <div className="mt-2">
                <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold ${
                  hasTripPlay
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/30'
                    : 'bg-gray-500/20 text-gray-400 border border-gray-400/30'
                }`}>
                  <Zap size={12} className={hasTripPlay ? 'text-cyan-400' : 'text-gray-400'} />
                  {getTripPlayStatusMessage()}
                </span>
              </div>
            )}
          </div>

          <button
            onClick={() => setSelectedWeek(Math.min(14, selectedWeek + 1))}
            disabled={selectedWeek >= 14}
            className="p-2 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
          >
            <ChevronRight size={20} />
          </button>
        </div>

        {/* Week Pills */}
        <div className="flex gap-1 mt-4 overflow-x-auto pb-2">
          {availableWeeks.map(week => (
            <button
              key={week}
              onClick={() => setSelectedWeek(week)}
              className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-all duration-200 ${
                week === selectedWeek
                  ? 'bg-blue-500 text-white'
                  : 'bg-white/10 text-white/80 hover:bg-white/20'
              }`}
            >
              {week}
            </button>
          ))}
        </div>
      </div>

      {/* Lineup Content */}
      <div className="p-5">
        <WeeklyLineupContent
          week={selectedWeek}
          lineup={weeklyLineups[`week${selectedWeek}`]}
          allTeams={allTeams}
          isEditable={selectedWeek === currentWeek}
          onSave={(starters, bench, captain, tripPlayTeam) => saveLineup(selectedWeek, starters, bench, captain, tripPlayTeam)}
          onTeamClick={onTeamClick}
          TeamLogo={TeamLogo}
          leagueId={leagueId}
          userId={userId}
          userDisplayName={userDisplayName}
          currentWeek={currentWeek}
          hasTripPlay={hasTripPlay}
          tripPlayUsedWeek={tripPlayUsedWeek}
        />
      </div>
    </div>
  );
};

const WeeklyLineupContent = ({
  week,
  lineup,
  allTeams,
  isEditable,
  onSave,
  onTeamClick,
  TeamLogo,
  leagueId,
  userId,
  userDisplayName,
  currentWeek,
  hasTripPlay,
  tripPlayUsedWeek
}) => {
  const [starters, setStarters] = useState(Array(5).fill(null));
  const [bench, setBench] = useState(Array(2).fill(null));
  const [captain, setCaptain] = useState(null);
  const [tripPlayTeam, setTripPlayTeam] = useState(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [showConfirmCut, setShowConfirmCut] = useState(null);
  const [showReplaceModal, setShowReplaceModal] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const canEdit = isEditable && (week === currentWeek) && (lineup?.isEditable !== false);

  useEffect(() => {
    if (lineup) {
      const resolvedStarters = (lineup.starters || []).map(n => n ? findTeamByNormalizedName(n) : null);
      const resolvedBench   = (lineup.bench || []).map(n => n ? findTeamByNormalizedName(n) : null);
      setStarters(resolvedStarters);
      setBench(resolvedBench);
      setCaptain(lineup.captain || null);
      setTripPlayTeam(lineup.tripPlayTeam || null);
    } else {
      setStarters(Array(5).fill(null));
      setBench(Array(2).fill(null));
      setCaptain(null);
      setTripPlayTeam(null);
    }
    setHasChanges(false);
  }, [lineup, allTeams]);

  const findTeamByNormalizedName = (normalizedName) =>
    Object.values(allTeams).find(team => weeklyLineupUtils.normalizeTeamName(team) === normalizedName);

  const handleCaptainSelect = (teamName) => {
    // Find the actual team object from starters or bench
    const teamObject = [...starters, ...bench]
      .filter(team => team !== null)
      .find(team => (team.school || team.name) === teamName);

    if (!teamObject) {
      alert("Team not found in lineup");
      return;
    }

    if (!canBeCaptain(teamObject, starters, bench)) {
      alert("Captain must be selected from your current lineup");
      return;
    }

    const normalizedTeamName = weeklyLineupUtils.normalizeTeamName(teamObject);
    const newCaptain = captain === normalizedTeamName ? null : normalizedTeamName;
    setCaptain(newCaptain);
    setHasChanges(true);
  };

  const handleTripPlaySelect = (teamName) => {
    // Find the actual team object from starters or bench
    const teamObject = [...starters, ...bench]
      .filter(team => team !== null)
      .find(team => (team.school || team.name) === teamName);

    if (!teamObject) {
      alert("Team not found in lineup");
      return;
    }

    const normalizedTeamName = weeklyLineupUtils.normalizeTeamName(teamObject);
    const isCurrentlyTripPlay = tripPlayTeam === normalizedTeamName;

    // If we're trying to REMOVE trip play (team currently has it)
    if (isCurrentlyTripPlay) {
      // Allow removal - this will be handled in saveLineup
      const newTripPlayTeam = null;
      setTripPlayTeam(newTripPlayTeam);
      setHasChanges(true);
      return;
    }

    // If we're trying to ADD trip play but it's not available
    if (!hasTripPlay) {
      alert("3x Play has already been used this season");
      return;
    }

    // Check if team can use trip play (must be in starters)
    if (!canUseTripPlay(teamObject, starters, bench)) {
      alert("x3 Play must be selected from your starters");
      return;
    }

    // Add trip play to this team
    setTripPlayTeam(normalizedTeamName);
    setHasChanges(true);
  };

  const saveLineupChanges = async (newStarters, newBench, newCaptain = captain, newTripPlayTeam = tripPlayTeam) => {
    try {
      setIsSaving(true);

      const validatedCaptain = newCaptain && canBeCaptain(newCaptain, newStarters, newBench) ? newCaptain : null;
      const validatedTripPlayTeam = newTripPlayTeam && canUseTripPlay(newTripPlayTeam, newStarters, newBench) ? newTripPlayTeam : null;

      await onSave(newStarters, newBench, validatedCaptain, validatedTripPlayTeam);
      setStarters(newStarters);
      setBench(newBench);
      setCaptain(validatedCaptain);
      setTripPlayTeam(validatedTripPlayTeam);
      setHasChanges(false);
    } catch (e) {
      console.error("Error saving lineup:", e);
    } finally {
      setIsSaving(false);
    }
  };

  const handleTeamMove = async (team, fromSection, fromIndex, toSection, toIndex = null) => {
    if (!canEdit || isSaving) return;

    const teamName = team.school || team.name;
    const moveValidation = await canMoveTeam(teamName, week);

    if (!moveValidation.canMove) {
      alert(`Cannot move ${teamName}: ${moveValidation.message}`);
      return;
    }

    const newStarters = [...starters];
    const newBench = [...bench];

    if (toIndex === null) {
      toIndex = (toSection === 'starters')
        ? newStarters.findIndex(t => t === null)
        : newBench.findIndex(t => t === null);
    }

    if (toIndex === -1) {
      setShowReplaceModal({ movingTeam: team, fromSection, fromIndex, toSection });
      return;
    }

    if (fromSection === 'starters') newStarters[fromIndex] = null; else newBench[fromIndex] = null;

    const displaced = (toSection === 'starters') ? newStarters[toIndex] : newBench[toIndex];

    if (displaced) {
      const displacedTeamName = displaced.school || displaced.name;
      const displacedValidation = await canMoveTeam(displacedTeamName, week);

      if (!displacedValidation.canMove) {
        alert(`Cannot displace ${displacedTeamName}: ${displacedValidation.message}`);
        return;
      }
    }

    if (toSection === 'starters') newStarters[toIndex] = team; else newBench[toIndex] = team;

    if (displaced) {
      const targetArray = (toSection === 'starters') ? newBench : newStarters;
      const emptyIndex = targetArray.findIndex(t => t === null);
      if (emptyIndex !== -1) {
        if (toSection === 'starters') newBench[emptyIndex] = displaced;
        else newStarters[emptyIndex] = displaced;
      } else {
        if (fromSection === 'starters') newStarters[fromIndex] = displaced; else newBench[fromIndex] = displaced;
      }
    }

    await saveLineupChanges(newStarters, newBench);
  };

  const handleTeamCut = async (team, section, index) => {
    const teamName = team.school || team.name;
    const moveValidation = await canMoveTeam(teamName, week);

    if (!moveValidation.canMove) {
      alert(`Cannot cut ${teamName}: ${moveValidation.message}`);
      return;
    }

    setShowConfirmCut({ team, section, index });
  };

  const confirmCut = async () => {
    if (!showConfirmCut || isSaving) return;

    const { team, section, index } = showConfirmCut;
    const newStarters = [...starters];
    const newBench = [...bench];
    const normalizedTeamName = weeklyLineupUtils.normalizeTeamName(team);

    if (section === 'starters') newStarters[index] = null; else newBench[index] = null;

    const newCaptain = captain === normalizedTeamName ? null : captain;
    const newTripPlayTeam = tripPlayTeam === normalizedTeamName ? null : tripPlayTeam;

    try {
      setIsSaving(true);
      await saveLineupChanges(newStarters, newBench, newCaptain, newTripPlayTeam);

// Fetch manager name from users table
      let managerName = "Unknown Manager";
      try {
        const { data: userData } = await supabase
          .from('users')
          .select('first_name, last_name')
          .eq('id', userId)
          .single();
        if (userData) {
          managerName = userData.first_name || "Unknown Manager";
        }
      } catch (userError) {
        console.warn("Could not fetch user name:", userError);
      }

      await supabase.from('move_history').insert({
        league_id: leagueId,
        user_id: userId,
        team_name: managerName,
        move_type: "drop",
        dropped: team.school || team.name,
        picked_up: null,
        week: currentWeek,
      });

      // Increment free_agent_moves in league_members
      const { data: currentMember } = await supabase
        .from('league_members')
        .select('free_agent_moves')
        .eq('league_id', leagueId)
        .eq('user_id', userId)
        .single();

      await supabase
        .from('league_members')
        .update({ free_agent_moves: (currentMember?.free_agent_moves || 0) + 1 })
        .eq('league_id', leagueId)
        .eq('user_id', userId);
    } catch (e) {
      console.error("Error cutting team and recording move:", e);
    } finally {
      setIsSaving(false);
      setShowConfirmCut(null);
    }
  };

  const handleReplaceTeam = async (targetIndex) => {
    if (!showReplaceModal || isSaving) return;
    const { movingTeam, fromSection, fromIndex, toSection } = showReplaceModal;

    const movingTeamName = movingTeam.school || movingTeam.name;
    const movingValidation = await canMoveTeam(movingTeamName, week);

    if (!movingValidation.canMove) {
      alert(`Cannot move ${movingTeamName}: ${movingValidation.message}`);
      setShowReplaceModal(null);
      return;
    }

    const newStarters = [...starters];
    const newBench = [...bench];
    const replacedTeam = (toSection === 'starters') ? newStarters[targetIndex] : newBench[targetIndex];

    if (replacedTeam) {
      const replacedTeamName = replacedTeam.school || replacedTeam.name;
      const replacedValidation = await canMoveTeam(replacedTeamName, week);

      if (!replacedValidation.canMove) {
        alert(`Cannot displace ${replacedTeamName}: ${replacedValidation.message}`);
        setShowReplaceModal(null);
        return;
      }
    }

    if (fromSection === 'starters') newStarters[fromIndex] = null; else newBench[fromIndex] = null;
    if (toSection === 'starters') newStarters[targetIndex] = movingTeam; else newBench[targetIndex] = movingTeam;
    if (fromSection === 'starters') newStarters[fromIndex] = replacedTeam || null; else newBench[fromIndex] = replacedTeam || null;

    await saveLineupChanges(newStarters, newBench);
    setShowReplaceModal(null);
  };

  const handleSave = async () => {
    if (hasChanges && canEdit && !isSaving) await saveLineupChanges(starters, bench, captain, tripPlayTeam);
  };

  return (
    <div>
      {/* Captain Status Display */}
      {captain && (
        <div className="bg-yellow-500/15 border border-yellow-400/20 rounded-lg p-2.5 mb-3">
          <div className="flex items-center gap-2">
            <Crown className="text-yellow-400" size={16} />
            <div>
              <span className="text-yellow-200 font-medium text-sm">
                Captain: {
                  [...starters, ...bench]
                    .filter(team => team !== null)
                    .find(team => weeklyLineupUtils.normalizeTeamName(team) === captain)?.school || captain
                } (double points)
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Trip Play Status Display */}
      {tripPlayTeam && (
        <div className="bg-cyan-500/15 border border-cyan-400/20 rounded-lg p-2.5 mb-3">
          <div className="flex items-center gap-2">
            <Zap className="text-cyan-400" size={16} />
            <div>
              <span className="text-cyan-200 font-medium text-sm">
                x3 Play: {
                  [...starters, ...bench]
                    .filter(team => team !== null)
                    .find(team => weeklyLineupUtils.normalizeTeamName(team) === tripPlayTeam)?.school || tripPlayTeam
                } (triple points)
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Combined Captain + Trip Play Display */}
      {captain && tripPlayTeam && captain === tripPlayTeam && (
        <div className="bg-gradient-to-r from-yellow-500/15 to-cyan-500/15 border border-purple-400/20 rounded-lg p-2.5 mb-3">
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              <Crown className="text-yellow-400" size={16} />
              <Zap className="text-cyan-400" size={16} />
            </div>
            <div>
              <span className="text-purple-200 font-medium text-sm">
                5X Combo Active: {
                  [...starters, ...bench]
                    .filter(team => team !== null)
                    .find(team => weeklyLineupUtils.normalizeTeamName(team) === captain)?.school || captain
                }
              </span>
            </div>
          </div>
        </div>
      )}

{/*
      {week === currentWeek && (
        <div className="bg-blue-500/20 border border-blue-400/30 rounded-xl p-3 mb-4">
          <div className="flex items-center gap-2 text-blue-200">
            <Lock size={16} />
            <span className="text-sm font-medium">
              Individual teams lock 1 hour before their games start. Locked teams will show a red indicator.
            </span>
          </div>
        </div>
      )} */}

      {canEdit && hasChanges && (
        <div className="bg-green-600/20 border border-green-400/30 rounded-lg p-3 mb-4">
          <div className="flex items-center justify-between">
            <span className="text-white font-medium text-sm">You have unsaved changes</span>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white px-3 py-1.5 rounded-md text-sm font-medium transition-colors uppercase"
            >
              {isSaving ? 'SAVING...' : 'SAVE'}
            </button>
          </div>
        </div>
      )}

      <div className="mb-5">
        <h4 className="text-base font-semibold text-white mb-3 flex items-center gap-2">
          🏈 Starters (5)
        </h4>
        <div className="space-y-2.5">
          {starters.map((team, index) => (
            <TeamSlot
              key={`starter-${index}`}
              team={team}
              section="starters"
              index={index}
              week={week}
              currentWeek={currentWeek}
              leagueId={leagueId}
              canEdit={canEdit}
              isSaving={isSaving}
              captain={captain}
              tripPlayTeam={tripPlayTeam}
              hasTripPlay={hasTripPlay}
              TeamLogo={TeamLogo}
              handleTeamMove={handleTeamMove}
              handleTeamCut={handleTeamCut}
              handleCaptainSelect={handleCaptainSelect}
              handleTripPlaySelect={handleTripPlaySelect}
            />
          ))}
        </div>
      </div>

      <div className="mb-5">
        <h4 className="text-base font-semibold text-white mb-3 flex items-center gap-2">
          🪑 Bench (2)
        </h4>
        <div className="space-y-2.5">
          {bench.map((team, index) => (
            <TeamSlot
              key={`bench-${index}`}
              team={team}
              section="bench"
              index={index}
              week={week}
              currentWeek={currentWeek}
              leagueId={leagueId}
              canEdit={canEdit}
              isSaving={isSaving}
              captain={captain}
              tripPlayTeam={tripPlayTeam}
              hasTripPlay={hasTripPlay}
              TeamLogo={TeamLogo}
              handleTeamMove={handleTeamMove}
              handleTeamCut={handleTeamCut}
              handleCaptainSelect={handleCaptainSelect}
              handleTripPlaySelect={handleTripPlaySelect}
            />
          ))}
        </div>
      </div>

      <ConfirmCutModal
        showConfirmCut={showConfirmCut}
        setShowConfirmCut={setShowConfirmCut}
        confirmCut={confirmCut}
        isSaving={isSaving}
        captain={captain}
        tripPlayTeam={tripPlayTeam}
      />
      <ReplaceTeamModal
        showReplaceModal={showReplaceModal}
        setShowReplaceModal={setShowReplaceModal}
        handleReplaceTeam={handleReplaceTeam}
        isSaving={isSaving}
        starters={starters}
        bench={bench}
      />
    </div>
  );
};

export default WeeklyLineupManager;
