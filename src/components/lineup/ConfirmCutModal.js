// ConfirmCutModal.js — Cut confirmation modal extracted from WeeklyLineupManager
import React from 'react';
import { weeklyLineupUtils } from '../../utils/weeklyLineupUtils';
import { ModalPortal, useLockBodyScroll } from '../WeeklyLineupManager';

const ConfirmCutModal = ({
  showConfirmCut,
  setShowConfirmCut,
  confirmCut,
  isSaving,
  captain,
  tripPlayTeam,
}) => {
  const isOpen = !!showConfirmCut;
  useLockBodyScroll(isOpen);
  if (!isOpen) return null;

  const { team } = showConfirmCut;
  const gamePoints = team.currentSeason?.gamePoints || 0;
  const record = team.currentSeason?.record || '0-0';
  const normalizedTeamName = weeklyLineupUtils.normalizeTeamName(team);
  const isCaptain = captain === normalizedTeamName;
  const isTripPlay = tripPlayTeam === normalizedTeamName;

  return (
    <ModalPortal open={true}>
      <div role="dialog" aria-modal="true" className="fixed inset-0 z-[10000]">
        <div className="absolute inset-0 bg-black/60" />
        <div className="relative h-full w-full flex items-center justify-center p-4" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <div className="bg-white rounded-2xl p-6 max-w-md w-full border border-gray-200 shadow-2xl overflow-hidden">
            <div className="text-center">
              <div className="text-4xl mb-4">⚠️</div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Cut {team.school}?</h3>
              <div className="text-gray-600 mb-4">
                <div className="bg-gray-100 rounded-lg p-3">
                  <div className="font-medium text-gray-800">{team.school}</div>
                  <div className="text-sm text-gray-600">{team.conference}</div>
                  <div className="text-sm text-gray-600 mt-1">{gamePoints} Season Points • {record}</div>
                  {isCaptain && (
                    <div className="text-sm text-yellow-600 mt-1 font-bold">⚠️ This is your current captain</div>
                  )}
                  {isTripPlay && (
                    <div className="text-sm text-cyan-600 mt-1 font-bold">⚡ This team has your x3 Play active</div>
                  )}
                  {isCaptain && isTripPlay && (
                    <div className="text-sm text-purple-600 mt-1 font-bold">💥 This team has BOTH Captain and x3 Play (5x points)</div>
                  )}
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowConfirmCut(null)} className="flex-1 py-3 px-4 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-medium transition-colors duration-200">Cancel</button>
                <button onClick={confirmCut} disabled={isSaving} className="flex-1 py-3 px-4 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors duration-200">{isSaving ? 'Cutting...' : 'Cut Team'}</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
};

export default ConfirmCutModal;
