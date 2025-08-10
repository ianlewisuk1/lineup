import React, { useState, useEffect } from 'react';
import { db } from '../firebase/firebase';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { ChevronDown, ChevronUp, Activity, Clock, TrendingUp, UserX, UserPlus } from 'lucide-react';

const RecentMovesWidget = ({ leagueId }) => {
  const [moves, setMoves] = useState([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!leagueId) return;

    try {
      const movesRef = collection(db, 'leagues', leagueId, 'moveHistory');
      const q = query(movesRef, orderBy('timestamp', 'desc'), limit(15));

      const unsubscribe = onSnapshot(q, 
        (snapshot) => {
          const movesData = [];
          snapshot.forEach(doc => {
            const data = doc.data();
            movesData.push({
              id: doc.id,
              ...data,
              timestamp: data.timestamp?.toDate() || new Date()
            });
          });
          setMoves(movesData);
          setLoading(false);
        },
        (error) => {
          console.error('Error listening to moves:', error);
          setLoading(false);
        }
      );

      return () => unsubscribe();
    } catch (error) {
      console.error('Error setting up moves listener:', error);
      setLoading(false);
    }
  }, [leagueId]);

  const formatTimeAgo = (timestamp) => {
    const now = new Date();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'Just now';
  };

  const getMoveData = (move) => {
    if (move.pickedUp && move.dropped) {
      return {
        type: 'swap',
        icon: <TrendingUp size={16} className="text-purple-400" />,
        text: `picked up ${move.pickedUp}, cut ${move.dropped}`,
        gradient: 'from-purple-500/20 to-blue-500/20',
        border: 'border-purple-400/30'
      };
    } else if (move.pickedUp) {
      return {
        type: 'pickup',
        icon: <UserPlus size={16} className="text-green-400" />,
        text: `picked up ${move.pickedUp}`,
        gradient: 'from-green-500/20 to-emerald-500/20',
        border: 'border-green-400/30'
      };
    } else if (move.dropped) {
      return {
        type: 'cut',
        icon: <UserX size={16} className="text-red-400" />,
        text: `cut ${move.dropped}`,
        gradient: 'from-red-500/20 to-pink-500/20',
        border: 'border-red-400/30'
      };
    }
    return {
      type: 'unknown',
      icon: <Activity size={16} className="text-gray-400" />,
      text: 'made a roster move',
      gradient: 'from-gray-500/20 to-slate-500/20',
      border: 'border-gray-400/30'
    };
  };

  if (loading) {
    return (
      <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20 mb-6">
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-400"></div>
          <span className="ml-3 text-white/80">Loading recent moves...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white/10 backdrop-blur-lg rounded-2xl border border-white/20 mb-6 overflow-hidden shadow-xl">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-6 py-5 flex items-center justify-between hover:bg-white/5 transition-all duration-300 group"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-500/20 rounded-xl border border-blue-400/30 group-hover:bg-blue-500/30 transition-colors">
            <Activity size={18} className="text-blue-400" />
          </div>
          <h3 className="text-lg font-bold text-white">League Activity</h3>
        </div>
        
        <div className="flex items-center gap-3">
          <span className="text-white/60 text-sm hidden sm:block">
            {moves.length === 0 ? 'No recent activity' : 'Last 15 moves'}
          </span>
          <div className="p-1 rounded-lg bg-white/10">
            {isExpanded ? (
              <ChevronUp size={18} className="text-white/60" />
            ) : (
              <ChevronDown size={18} className="text-white/60" />
            )}
          </div>
        </div>
      </button>

      {/* Expandable Content */}
      <div className={`transition-all duration-500 ease-out ${
        isExpanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
      } overflow-hidden`}>
        <div className="border-t border-white/10 bg-gradient-to-b from-white/5 to-transparent">
          {moves.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <div className="text-6xl mb-4 opacity-50">📈</div>
              <h4 className="text-white/70 font-semibold mb-2">No Recent Activity</h4>
              <p className="text-white/50 text-sm">
                Free agent moves will appear here when managers make roster changes
              </p>
            </div>
          ) : (
            <div className="max-h-80 overflow-y-auto p-4">
              <div className="space-y-3">
                {moves.map((move, index) => {
                  const moveData = getMoveData(move);
                  return (
                    <div
                      key={move.id}
                      className={`relative p-4 rounded-xl bg-gradient-to-r ${moveData.gradient} border ${moveData.border} hover:scale-[1.02] transition-all duration-200 shadow-lg hover:shadow-xl`}
                      style={{
                        animationDelay: `${index * 50}ms`,
                        animation: isExpanded ? 'slideInUp 0.3s ease-out forwards' : 'none'
                      }}
                    >
                      <div className="flex items-start gap-3">
                        {/* Move Type Icon */}
                        <div className="flex-shrink-0 p-2 bg-white/10 rounded-lg backdrop-blur-sm">
                          {moveData.icon}
                        </div>

                        {/* Move Details */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="font-semibold text-white truncate">
                              {move.teamName || 'Unknown Manager'}
                            </h4>
                            <div className="flex items-center gap-1 text-white/60 text-xs bg-black/20 px-2 py-1 rounded-full">
                              <Clock size={10} />
                              {formatTimeAgo(move.timestamp)}
                            </div>
                          </div>
                          
                          <p className="text-sm text-white/90 leading-relaxed">
                            {moveData.text}
                          </p>
                          
                          {move.week && move.week !== 'Unknown' && (
                            <div className="mt-2">
                              <span className="text-xs text-white/50 bg-white/10 px-2 py-1 rounded-full">
                                {move.week}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Subtle accent line */}
                        <div className={`w-1 h-full bg-gradient-to-b ${
                          moveData.type === 'pickup' ? 'from-green-400 to-green-600' :
                          moveData.type === 'cut' ? 'from-red-400 to-red-600' :
                          moveData.type === 'swap' ? 'from-purple-400 to-blue-500' :
                          'from-gray-400 to-gray-600'
                        } rounded-full opacity-60`}></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        @keyframes slideInUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
};

export default RecentMovesWidget;