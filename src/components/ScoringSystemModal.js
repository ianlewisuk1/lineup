import React from 'react';
import { X, Target, TrendingUp, Award, Zap, Crown } from 'lucide-react';

const ScoringSystemModal = ({ onClose }) => {
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden border border-white/20">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/20">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full flex items-center justify-center">
              <Target size={24} className="text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white">Scoring System</h2>
              <p className="text-white/60 text-sm">How teams earn and lose points</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors duration-200"
          >
            <X size={24} className="text-white/60 hover:text-white" />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto max-h-[calc(90vh-120px)] p-6">
          <div className="space-y-8">
            
            {/* Base Team Scoring */}
            <div className="bg-white/5 rounded-2xl p-6 border border-white/10">
              <div className="flex items-center space-x-3 mb-6">
                <TrendingUp size={24} className="text-purple-400" />
                <h3 className="text-xl font-bold text-white">Team Performance</h3>
              </div>
              
              <p className="text-white/70 text-sm mb-6 italic">
                Only applies to teams in your starting lineup
              </p>
              
              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="p-4 bg-green-500/10 rounded-xl border border-green-500/30">
                    <div className="flex items-center space-x-2 mb-3">
                      <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
                        <span className="text-white font-bold text-sm">W</span>
                      </div>
                      <h4 className="text-lg font-semibold text-green-300">Team Wins</h4>
                    </div>
                    <p className="text-2xl font-bold text-green-400 mb-3">+3 Points</p>
                    <div className="p-3 bg-green-600/20 rounded-lg border border-green-500/40">
                      <p className="text-green-200 text-sm mb-2">
                        <strong>Underdog Bonus:</strong> +3 additional points
                      </p>
                      <p className="text-green-300 text-xs">
                        Total: 6 points for underdog wins!
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="p-4 bg-red-500/10 rounded-xl border border-red-500/30">
                    <div className="flex items-center space-x-2 mb-3">
                      <div className="w-8 h-8 bg-red-500 rounded-full flex items-center justify-center">
                        <span className="text-white font-bold text-sm">L</span>
                      </div>
                      <h4 className="text-lg font-semibold text-red-300">Team Loses</h4>
                    </div>
                    <p className="text-2xl font-bold text-red-400">-3 Points</p>
                    <p className="text-red-200 text-sm mt-2">
                      Every loss costs you 3 points, regardless of spread
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Spread Bonus Points */}
            <div className="bg-white/5 rounded-2xl p-6 border border-white/10">
              <div className="flex items-center space-x-3 mb-6">
                <Target size={24} className="text-blue-400" />
                <h3 className="text-xl font-bold text-white">Spread Bonus Points</h3>
              </div>
              
              <p className="text-white/80 mb-6 leading-relaxed">
                Earn bonus points based on how well your team covers the spread. If your team fails to cover, these values are inverted (become negative).
              </p>

              <div className="space-y-3">
                <div className="flex justify-between items-center p-4 bg-gradient-to-r from-blue-500/10 to-blue-600/10 rounded-xl border border-blue-500/30">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center">
                      <span className="text-white font-bold text-sm">1</span>
                    </div>
                    <span className="text-white font-medium">Cover by 1 to 7 points</span>
                  </div>
                  <span className="text-blue-400 font-bold text-lg">+1 Bonus</span>
                </div>

                <div className="flex justify-between items-center p-4 bg-gradient-to-r from-emerald-500/10 to-emerald-600/10 rounded-xl border border-emerald-500/30">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-emerald-500 rounded-full flex items-center justify-center">
                      <span className="text-white font-bold text-sm">2</span>
                    </div>
                    <span className="text-white font-medium">Cover by 7.5 to 14 points</span>
                  </div>
                  <span className="text-emerald-400 font-bold text-lg">+2 Bonus</span>
                </div>

                <div className="flex justify-between items-center p-4 bg-gradient-to-r from-yellow-500/10 to-yellow-600/10 rounded-xl border border-yellow-500/30">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-yellow-500 rounded-full flex items-center justify-center">
                      <span className="text-white font-bold text-sm">3</span>
                    </div>
                    <span className="text-white font-medium">Cover by 14.5 to 19 points</span>
                  </div>
                  <span className="text-yellow-400 font-bold text-lg">+3 Bonus</span>
                </div>

                <div className="flex justify-between items-center p-4 bg-gradient-to-r from-purple-500/10 to-purple-600/10 rounded-xl border border-purple-500/30">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-purple-500 rounded-full flex items-center justify-center">
                      <span className="text-white font-bold text-sm">5</span>
                    </div>
                    <span className="text-white font-medium">Cover by 20+ points</span>
                  </div>
                  <span className="text-purple-400 font-bold text-lg">+5 Bonus</span>
                </div>
              </div>

              <div className="mt-6 p-4 bg-amber-500/10 rounded-xl border border-amber-500/30">
                <div className="flex items-center space-x-2 mb-2">
                  <div className="w-6 h-6 bg-amber-500 rounded-full flex items-center justify-center">
                    <span className="text-white font-bold text-xs">⏰</span>
                  </div>
                  <span className="text-amber-300 font-semibold">Spread Updates</span>
                </div>
                <p className="text-amber-200 text-sm">
                  Spreads are updated throughout the week and <strong>lock 1 hour before kickoff</strong>.
                </p>
              </div>

              <div className="mt-4 p-4 bg-red-500/10 rounded-xl border border-red-500/30">
                <div className="flex items-center space-x-2 mb-2">
                  <div className="w-6 h-6 bg-red-500 rounded-full flex items-center justify-center">
                    <span className="text-white font-bold text-xs">!</span>
                  </div>
                  <span className="text-red-300 font-semibold">Important</span>
                </div>
                <p className="text-red-200 text-sm">
                  If your team <strong>fails to cover the spread</strong>, these bonus values become negative penalties instead.
                </p>
              </div>
            </div>

            {/* Captain System */}
            <div className="bg-white/5 rounded-2xl p-6 border border-white/10">
              <div className="flex items-center space-x-3 mb-6">
                <Crown size={24} className="text-yellow-400" />
                <h3 className="text-xl font-bold text-white">Captain System</h3>
              </div>
              
              <div className="p-4 bg-yellow-500/10 rounded-xl border border-yellow-500/30">
                <p className="text-white/90 mb-3">
                  Starting in <strong>Week 2</strong>, you can designate one team in your lineup as captain.
                </p>
                <div className="flex items-center space-x-2 mb-3">
                  <Zap size={20} className="text-yellow-400" />
                  <span className="text-yellow-300 font-semibold">Captain receives DOUBLE points</span>
                </div>
                <p className="text-white/70 text-sm">
                  This applies to both positive and negative points - choose wisely!
                </p>
              </div>
            </div>

            {/* Game Bonuses */}
            <div className="bg-white/5 rounded-2xl p-6 border border-white/10">
              <div className="flex items-center space-x-3 mb-6">
                <Award size={24} className="text-orange-400" />
                <h3 className="text-xl font-bold text-white">Game Bonuses</h3>
              </div>
              
              <div className="grid md:grid-cols-2 gap-6">
                <div className="p-4 bg-orange-500/10 rounded-xl border border-orange-500/30">
                  <h4 className="text-lg font-semibold text-orange-300 mb-3">3x Play Chip</h4>
                  <div className="space-y-2 text-sm text-white/80">
                    <p><strong>Usage:</strong> 1 per season</p>
                    <p><strong>Available:</strong> Week 4 until playoffs</p>
                    <p><strong>Effect:</strong> Multiplies team points by 3x</p>
                    <p><strong>With Captain:</strong> Creates 5x multiplier!</p>
                  </div>
                </div>

                <div className="p-4 bg-cyan-500/10 rounded-xl border border-cyan-500/30">
                  <h4 className="text-lg font-semibold text-cyan-300 mb-3">Freeze Play</h4>
                  <div className="space-y-2 text-sm text-white/80">
                    <p><strong>Usage:</strong> 3 per season</p>
                    <p><strong>Available:</strong> During second half of games</p>
                    <p><strong>Effect:</strong> Locks current point total</p>
                    <p><strong>Warning:</strong> Cannot be undone!</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Scoring Examples */}
            <div className="bg-white/5 rounded-2xl p-6 border border-white/10">
              <h3 className="text-xl font-bold text-white mb-6">Real Game Examples</h3>
              
              <div className="space-y-4">
                <div className="p-4 bg-green-500/10 rounded-xl border border-green-500/30">
                  <h4 className="text-green-300 font-semibold mb-2">Example 1: Georgia upsets Alabama</h4>
                  <p className="text-white/90 text-sm mb-2">
                    Georgia Bulldogs (+3.5) beat Alabama Crimson Tide 27-24 | Your captain team
                  </p>
                  <div className="text-xs text-white/70 space-y-1">
                    <p>• Win: +3 points</p>
                    <p>• Underdog bonus (were +3.5): +3 points</p>
                    <p>• Cover by 6.5 points: +1 bonus points</p>
                    <p>• Captain multiplier: (3 + 3 + 1) × 2 = <strong className="text-green-400">+14 total points</strong></p>
                  </div>
                </div>

                <div className="p-4 bg-purple-500/10 rounded-xl border border-purple-500/30">
                  <h4 className="text-purple-300 font-semibold mb-2">Example 2: Michigan dominates Ohio State</h4>
                  <p className="text-white/90 text-sm mb-2">
                    Michigan Wolverines (-6.5) beat Ohio State Buckeyes 42-27 | Regular lineup spot
                  </p>
                  <div className="text-xs text-white/70 space-y-1">
                    <p>• Win: +3 points</p>
                    <p>• No underdog bonus (were favored)</p>
                    <p>• Cover by 8.5 points: +2 bonus points</p>
                    <p>• Total: <strong className="text-purple-400">+5 points</strong></p>
                  </div>
                </div>

                <div className="p-4 bg-red-500/10 rounded-xl border border-red-500/30">
                  <h4 className="text-red-300 font-semibold mb-2">Example 3: Notre Dame loses close game</h4>
                  <p className="text-white/90 text-sm mb-2">
                    Notre Dame Fighting Irish (+4) lose to Clemson Tigers 17-20 | Your captain team
                  </p>
                  <div className="text-xs text-white/70 space-y-1">
                    <p>• Loss: -3 points</p>
                    <p>• Covered spread by 1 point: +1 bonus</p>
                    <p>• Captain multiplier: (-3 + 1) × 2 = <strong className="text-red-400">-4 total points</strong></p>
                  </div>
                </div>

                <div className="p-4 bg-orange-500/10 rounded-xl border border-orange-500/30">
                  <h4 className="text-orange-300 font-semibold mb-2">Example 4: Texas A&M disaster</h4>
                  <p className="text-white/90 text-sm mb-2">
                    Texas A&M Aggies (-7) lose to Auburn Tigers 10-28 | With 3x Play Chip
                  </p>
                  <div className="text-xs text-white/70 space-y-1">
                    <p>• Loss: -3 points</p>
                    <p>• Failed to cover by 25 points: -5 penalty</p>
                    <p>• 3x Play Chip: (-3 + -5) × 3 = <strong className="text-orange-400">-24 total points</strong></p>
                    <p className="text-orange-200 italic">Ouch! Maybe save that chip for another week...</p>
                  </div>
                </div>

                <div className="p-4 bg-emerald-500/10 rounded-xl border border-emerald-500/30">
                  <h4 className="text-emerald-300 font-semibold mb-2">Example 5: Perfect storm</h4>
                  <p className="text-white/90 text-sm mb-2">
                    TCU Horned Frogs (+10) beat Oklahoma Sooners 38-17 | Captain + 3x Play Chip
                  </p>
                  <div className="text-xs text-white/70 space-y-1">
                    <p>• Win: +3 points</p>
                    <p>• Underdog bonus (were +10): +3 points</p>
                    <p>• Cover by 31 points: +5 bonus points</p>
                    <p>• Captain (2x) + 3x Chip = 5x multiplier!</p>
                    <p>• Total: (3 + 3 + 5) × 5 = <strong className="text-emerald-400">+55 total points</strong></p>
                    <p className="text-emerald-200 italic">This is what dreams are made of!</p>
                  </div>
                </div>

                <div className="p-4 bg-slate-500/10 rounded-xl border border-slate-500/30">
                  <h4 className="text-slate-300 font-semibold mb-2">Example 6: Freeze play saves the day</h4>
                  <p className="text-white/90 text-sm mb-2">
                    Oregon Ducks (-4) leading Penn State 28-14 at halftime
                  </p>
                  <div className="text-xs text-white/70 space-y-1">
                    <p>• Currently winning by 14: +3 win + 2 spread bonus = +5 points</p>
                    <p>• You use Freeze Play to lock in this score</p>
                    <p>• Even if Oregon blows the lead and loses 28-35...</p>
                    <p>• Your score stays: <strong className="text-slate-400">+5 points (frozen)</strong></p>
                    <p className="text-slate-200 italic">Smart move - you avoided a potential -6 points!</p>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-white/20 bg-slate-800/50">
          <div className="flex justify-end">
            <button
              onClick={onClose}
              className="px-6 py-3 bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 text-white font-semibold rounded-xl transition-all duration-300"
            >
              Got it!
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ScoringSystemModal;