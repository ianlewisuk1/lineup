import React from "react";
import { getCurrentWeekNumber } from "../../utils/leagueUtils";

// 13-week season: Weeks 1-10 regular season, Weeks 11-13 playoffs.
// Must stay in step with the season timeline on the League Settings page.
const TOTAL_WEEKS = 13;
const FIRST_PLAYOFF_WEEK = 11;

const WeekSelector = ({
  currentWeek,
  viewMode,
  setViewMode,
  selectedWeek,
  setSelectedWeek,
  availableWeeks,
  standingsLoading,
  loadWeeklyStandings,
}) => {
  const currentWeekNum = getCurrentWeekNumber(currentWeek);

  // Determine which weeks have data (available historical weeks + current week)
  const weeksWithData = new Set([...availableWeeks, currentWeekNum]);

  return (
    <div className="bg-white/10 backdrop-blur-lg rounded-xl border border-white/20 mb-6 overflow-hidden">
      {/* Playoff indicator bar */}
      <div className="bg-gradient-to-r from-transparent via-yellow-500/20 to-transparent border-b border-yellow-400/30 px-3 py-1.5 flex items-center justify-between">
        <div className="text-[10px] font-semibold text-white/60">Week:</div>
        <div className="text-[10px] font-bold text-yellow-400 flex items-center gap-1">
          <span>🏆</span> Weeks {FIRST_PLAYOFF_WEEK}-{TOTAL_WEEKS}: Playoffs
        </div>
      </div>

      {/* Scrollable week buttons */}
      <div
        className="overflow-x-auto"
        style={{
          msOverflowStyle: 'none',
          scrollbarWidth: 'none',
          WebkitOverflowScrolling: 'touch'
        }}
      >
        <style dangerouslySetInnerHTML={{
          __html: `
            .overflow-x-auto::-webkit-scrollbar {
              display: none;
            }
          `
        }} />

        <div className="flex gap-1 p-2" style={{ minWidth: 'max-content' }}>
          {[...Array(TOTAL_WEEKS)].map((_, index) => {
            const week = index + 1;
            const isCurrentWeek = week === currentWeekNum;
            const isSelected = isCurrentWeek ? viewMode === 'current' : (viewMode === 'historical' && selectedWeek === week);
            const hasData = weeksWithData.has(week);
            const isPlayoffWeek = week >= FIRST_PLAYOFF_WEEK;

            return (
              <button
                key={week}
                onClick={() => {
                  if (!hasData) return;

                  if (isCurrentWeek) {
                    setViewMode('current');
                  } else {
                    setViewMode('historical');
                    setSelectedWeek(week);
                    loadWeeklyStandings(week);
                  }
                }}
                disabled={!hasData}
                className={`relative flex-shrink-0 w-6 h-6 rounded text-xs font-bold transition-all duration-200 ${
                  isSelected
                    ? (isCurrentWeek
                        ? 'bg-green-600 text-white shadow-lg'
                        : 'bg-blue-600 text-white shadow-lg')
                    : hasData
                      ? (isPlayoffWeek
                          ? 'bg-yellow-500/30 text-yellow-200 border border-yellow-400/50 hover:bg-yellow-500/40'
                          : 'bg-white/20 text-white hover:bg-white/30')
                      : 'bg-white/5 text-white/30 cursor-not-allowed'
                }`}
              >
                {week}

                {/* Current week live indicator */}
                {isCurrentWeek && (
                  <div className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse border border-white"></div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Loading indicator */}
      {standingsLoading && (
        <div className="text-center py-1 border-t border-white/10">
          <div className="text-white/60 text-[10px]">Loading...</div>
        </div>
      )}
    </div>
  );
};

export default WeekSelector;
