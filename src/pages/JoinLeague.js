import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { db, auth } from "../firebase/firebase";
import {
  doc,
  getDoc,
  updateDoc,
  setDoc,
  arrayUnion
} from "firebase/firestore";
import { Users, UserPlus, Trophy, AlertCircle } from "lucide-react";

function JoinLeague() {
  const navigate = useNavigate();

  const [leagueId, setLeagueId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [teamName, setTeamName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleJoinLeague = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const user = auth.currentUser;
      if (!user) throw new Error("User not logged in");

      if (!displayName.trim() || !teamName.trim()) {
        setError("Please enter a username and team name.");
        setLoading(false);
        return;
      }

      if (displayName.length > 15 || teamName.length > 15) {
        setError("Username and team name must be 15 characters or fewer.");
        setLoading(false);
        return;
      }

      const leagueRef = doc(db, "leagues", leagueId);
      const leagueSnap = await getDoc(leagueRef);
      if (!leagueSnap.exists()) {
        setError("League not found. Please check the League ID.");
        setLoading(false);
        return;
      }

      // Guard against joining the same league twice
      const memberRef = doc(db, "leagues", leagueId, "members", user.uid);
      const memberSnap = await getDoc(memberRef);
      if (memberSnap.exists()) {
        setError("You are already a member of this league.");
        setLoading(false);
        return;
      }

      // Add user to league's members array
      await updateDoc(leagueRef, {
        members: arrayUnion(user.uid)
      });

      // Add leagueId to user's profile
      await updateDoc(doc(db, "users", user.uid), {
        leagueIds: arrayUnion(leagueId)
      });

      // Create member document with consistent structure
      await setDoc(memberRef, {
        displayName: displayName.trim(),
        teamName: teamName.trim(),
        email: user.email || "",
        joinedAt: new Date(),
        lineup: {
          starters: [],
          bench: [],
          currentRoster: []
        },
        points: 0,
        weeklyPoints: 0,
        weeklyPointsHistory: {},
        freeAgentMoves: 0
      }, { merge: true });

      setSuccess("Successfully joined the league!");
      setTimeout(() => {
        navigate(`/${leagueId}/draft-room`);
      }, 1500);
    } catch (err) {
      setError("Error: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white">
      {/* Animated Background Elements */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-20 left-4 sm:left-10 w-48 sm:w-72 h-48 sm:h-72 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-20 right-4 sm:right-10 w-56 sm:w-96 h-56 sm:h-96 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full blur-3xl animate-pulse delay-1000"></div>
      </div>

      {/* Navigation */}
      <nav className="relative z-10 flex justify-between items-center p-4 sm:p-6 lg:p-8">
        <Link to="/home" className="flex items-center space-x-3">
          <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-r from-purple-500 to-blue-500 rounded-lg flex items-center justify-center font-bold text-lg sm:text-xl">
            L
          </div>
          <span className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
            Lineup
          </span>
        </Link>
        <Link 
          to="/home"
          className="px-4 py-2 sm:px-6 sm:py-2 text-sm sm:text-base text-white/80 hover:text-white transition-colors duration-300 font-medium"
        >
          ← Back to Home
        </Link>
      </nav>

      {/* Main Content */}
      <div className="relative z-10 max-w-2xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        {/* Header */}
        <div className="text-center mb-8 sm:mb-12">
          <div className="mb-4 sm:mb-6">
            <span className="inline-block text-4xl sm:text-5xl mb-2 sm:mb-4">🤝</span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-black mb-4 sm:mb-6 leading-tight">
            <span className="bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
              Join a League
            </span>
          </h1>
          <p className="text-lg sm:text-xl text-white/80 max-w-md mx-auto">
            Enter your league details to join the competition
          </p>
        </div>

        {/* Success Message */}
        {success && (
          <div className="mb-8 p-4 bg-green-500/20 border border-green-400/30 rounded-xl">
            <div className="flex items-center space-x-3">
              <Trophy size={20} className="text-green-400" />
              <p className="text-green-200 font-medium">{success}</p>
            </div>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="mb-8 p-4 bg-red-500/20 border border-red-400/30 rounded-xl">
            <div className="flex items-center space-x-3">
              <AlertCircle size={20} className="text-red-400" />
              <p className="text-red-200 font-medium">{error}</p>
            </div>
          </div>
        )}

        {/* Join Form */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 sm:p-8 border border-white/20 mb-8">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-gradient-to-r from-green-500 to-emerald-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <UserPlus size={32} className="text-white" />
            </div>
            
            <h2 className="text-2xl font-bold text-white mb-2">
              Ready to Join?
            </h2>
            <p className="text-white/80">
              Fill out the form below to join your fantasy league
            </p>
          </div>

          <form onSubmit={handleJoinLeague} className="space-y-6">
            {/* League ID Input */}
            <div>
              <label className="block text-sm font-medium text-white/80 mb-2">
                League ID *
              </label>
              <input
                type="text"
                placeholder="Enter the League ID you received"
                value={leagueId}
                onChange={(e) => setLeagueId(e.target.value)}
                required
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-300"
              />
              <p className="mt-1 text-xs text-white/60">
                Ask the league commissioner for this ID
              </p>
            </div>

            {/* Display Name Input */}
            <div>
              <label className="block text-sm font-medium text-white/80 mb-2">
                Your Username *
              </label>
              <input
                type="text"
                placeholder="How others will see you"
                value={displayName}
                maxLength={15}
                onChange={(e) => setDisplayName(e.target.value)}
                required
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-300"
              />
              <p className="mt-1 text-xs text-white/60">
                {displayName.length}/15 characters
              </p>
            </div>

            {/* Team Name Input */}
            <div>
              <label className="block text-sm font-medium text-white/80 mb-2">
                Team Name *
              </label>
              <input
                type="text"
                placeholder="Name your fantasy team"
                value={teamName}
                maxLength={15}
                onChange={(e) => setTeamName(e.target.value)}
                required
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-300"
              />
              <p className="mt-1 text-xs text-white/60">
                {teamName.length}/15 characters
              </p>
            </div>

            {/* Submit Button */}
            <button 
              type="submit" 
              disabled={loading || !leagueId.trim() || !displayName.trim() || !teamName.trim()}
              className={`w-full py-4 px-8 rounded-xl text-lg font-bold transition-all duration-300 transform flex items-center justify-center space-x-3 ${
                loading || !leagueId.trim() || !displayName.trim() || !teamName.trim()
                  ? 'bg-white/20 text-white/50 cursor-not-allowed' 
                  : 'bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white hover:scale-105 shadow-2xl hover:shadow-green-500/40'
              }`}
            >
              {loading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  <span>Joining League...</span>
                </>
              ) : (
                <>
                  <UserPlus size={20} />
                  <span>Join League</span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* Help Info Card */}
        <div className="bg-blue-500/20 border border-blue-400/30 rounded-2xl p-6">
          <h3 className="text-lg font-semibold text-blue-200 mb-4 flex items-center space-x-2">
            <AlertCircle size={18} />
            <span>Need Help?</span>
          </h3>
          <ul className="text-blue-200 text-sm space-y-2 leading-relaxed">
            <li>• Ask your league commissioner for the League ID</li>
            <li>• Choose a unique username that others will recognize</li>
            <li>• Pick a creative team name - you can change it later</li>
            <li>• Both username and team name are limited to 15 characters</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export default JoinLeague;