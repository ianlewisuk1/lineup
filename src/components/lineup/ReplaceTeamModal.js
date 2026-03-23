// ReplaceTeamModal.js — Replace/swap team modal extracted from WeeklyLineupManager
import React from 'react';
import { ModalPortal, useLockBodyScroll } from '../WeeklyLineupManager';
import { formatGameTimeChip } from '../../utils/gameStatus';

const ReplaceTeamModal = ({
  showReplaceModal,
  setShowReplaceModal,
  handleReplaceTeam,
  isSaving,
  starters,
  bench,
}) => {
  const isOpen = !!showReplaceModal;
  useLockBodyScroll(isOpen);
  if (!isOpen) return null;

  const { movingTeam, toSection } = showReplaceModal;
  const slots = toSection === 'starters' ? starters : bench;

  return (
    <ModalPortal open={true}>
      <div role="dialog" aria-modal="true" className="fixed inset-0 z-[10000]">
        <div className="absolute inset-0 bg-black/60" onClick={() => setShowReplaceModal(null)} />
        <div className="absolute left-0 right-0 bottom-0" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <div className="bg-white rounded-t-2xl border border-gray-200 shadow-2xl max-h-[80vh] h-[72vh] overflow-hidden">
            <div className="px-5 pt-4 pb-3 border-b border-gray-200">
              <div className="mx-auto h-1.5 w-12 rounded-full bg-gray-300 mb-3" />
              <h3 className="text-lg font-bold text-gray-900 text-center">Swap {movingTeam.school}</h3>
              <p className="text-sm text-gray-600 text-center mt-1">
                Choose a spot on the {toSection === 'starters' ? 'Starters (5)' : 'Bench (2)'}
              </p>
            </div>

            <div className="overflow-y-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
              {slots.map((slotTeam, idx) => {
                const opponent = slotTeam?.currentSeason?.nextOpponent;
                const rawSpread = slotTeam?.currentSeason?.nextOpponentSpreadDisplay || '';
                const spread =
                  rawSpread && rawSpread.toString().trim().toUpperCase() !== 'TBD'
                    ? rawSpread
                    : null;
                const isHome = slotTeam?.currentSeason?.nextGameIsHome;
                const gameTime = formatGameTimeChip(slotTeam?.currentSeason?.nextGameDate);

                const title = slotTeam
                  ? `${slotTeam.school} (${spread || 'TBD'})`
                  : '';

                const meta = [
                  opponent ? `${isHome ? 'vs' : '@'} ${opponent}` : null,
                  gameTime
                ].filter(Boolean).join(' • ');

                return (
                  <button
                    key={idx}
                    onClick={() => handleReplaceTeam(idx)}
                    disabled={isSaving}
                    className="w-full text-left"
                  >
                    <div className="px-5 py-3.5 border-b border-gray-200 flex items-center gap-3 min-h-[56px]">
                      <div className="flex-1 min-w-0">
                        {slotTeam ? (
                          <>
                            <div className="font-semibold text-gray-900 truncate">{title}</div>
                            <div className="text-xs text-gray-600 truncate">{meta}</div>
                          </>
                        ) : (
                          <div className="text-gray-500">Empty slot</div>
                        )}
                      </div>
                      <div className="shrink-0">
                        <span className="inline-flex items-center justify-center px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium">
                          Swap
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="p-4 border-t border-gray-200">
              <button onClick={() => setShowReplaceModal(null)} className="w-full py-3 rounded-xl bg-gray-600 text-white font-medium">
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
};

export default ReplaceTeamModal;
