import { Star, X } from "lucide-react";
import TeamLogoImage from "./TeamLogoImage";

/**
 * Read-only view of the current user's big board. Order is the order teams were
 * starred on the Scouting page; drafted teams drop off on their own.
 */
export default function BigBoardPanel({ board, teams, limit, onRemove }) {
  const byId = new Map(teams.map((t) => [t.id, t]));

  return (
    <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-bold flex items-center gap-2 text-gray-900">
          <Star size={16} className="text-blue-600" fill="#2563EB" />
          My Big Board
        </h2>
        <span className="text-gray-400 text-sm">{board.length}/{limit}</span>
      </div>

      {board.length === 0 ? (
        <p className="text-gray-400 text-sm">
          No teams yet — star teams on the Scouting page to build your board.
        </p>
      ) : (
        <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
          {board.map((teamId, i) => {
            const team = byId.get(teamId);
            return (
              <div key={teamId} className="flex items-center gap-2 bg-gray-50 rounded-lg p-2 border border-gray-100">
                <span className="text-gray-400 text-xs font-semibold w-4 flex-shrink-0">{i + 1}</span>
                <TeamLogoImage teamName={team?.school} primaryColor={team?.color} size={20} />
                <div className="flex-1 min-w-0">
                  <div className="truncate font-medium text-sm text-gray-900">{team?.school ?? teamId}</div>
                  <div className="text-gray-400 text-xs truncate">{team?.conference}</div>
                </div>
                {onRemove && (
                  <button
                    onClick={() => onRemove(teamId)}
                    className="p-1 text-gray-300 hover:text-red-500 transition-colors flex-shrink-0"
                    title="Remove from big board"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
