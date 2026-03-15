import React, { useState, useEffect } from "react";
import { supabase } from "../supabase/supabase";
import { useNavigate, Link } from "react-router-dom";

function CreateLeague() {
  const navigate = useNavigate();

  const [leagueName, setLeagueName] = useState("");
  const [teamName, setTeamName] = useState("");
  const [maxManagers, setMaxManagers] = useState(8);
  const [draftType, setDraftType] = useState("manual");
  const [draftOrderType, setDraftOrderType] = useState("random");
  const [draftDate, setDraftDate] = useState("");
  const [draftTime, setDraftTime] = useState("");
  const [timePerPick, setTimePerPick] = useState("2");
  const [loading, setLoading] = useState(false);
  const [currentWeek, setCurrentWeek] = useState("Preseason");

  // Fetch current week on component mount
  useEffect(() => {
    const fetchCurrentWeek = async () => {
      try {
        const { data: configData } = await supabase.from('config').select('value').eq('key', 'season').single();
        if (configData) {
          setCurrentWeek(configData.value?.currentWeek || "Preseason");
        }
      } catch (error) {
        console.warn("Could not fetch current week:", error);
        setCurrentWeek("Preseason");
      }
    };

    fetchCurrentWeek();
  }, []);

  const getMinDraftDate = () => {
    const now = new Date();
    const localOffset = now.getTimezoneOffset() * 60000;
    const localDate = new Date(now.getTime() - localOffset);
    return localDate.toISOString().split("T")[0];
  };

  const getMaxDraftDate = () => {
    return "2026-09-01";
  };

  const handleCreateLeague = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not logged in");

      if (!teamName.trim()) {
        alert("Please enter a team name.");
        setLoading(false);
        return;
      }

      if (draftType === "live" && (!draftDate || !draftTime || !timePerPick)) {
        alert("Please select a draft date, time, and pick duration.");
        setLoading(false);
        return;
      }

      const leagueData = {
        name: leagueName,
        created_by: user.id,
        admin_id: user.id,
        max_managers: maxManagers,
        draft_complete: false,
        draft_type: draftType,
        draft_order_type: draftOrderType,
        scoring_type: "cumulative",
        current_week: currentWeek,
      };

      if (draftType === "live") {
        const [year, month, day] = draftDate.split('-').map(Number);
        const [hours, minutes] = draftTime.split(':').map(Number);

        const draftDateTime = new Date(year, month - 1, day, hours, minutes, 0);

        const now = new Date();
        const minTime = new Date(now.getTime() + 15 * 60 * 1000);

        if (draftDateTime < minTime) {
          alert("Draft must be scheduled at least 15 minutes in the future.");
          setLoading(false);
          return;
        }

        if (!isNaN(draftDateTime)) {
          leagueData.draft_date = draftDateTime;
        }

        const parsedPickTime = Number(timePerPick);
        if (!isNaN(parsedPickTime)) {
          leagueData.time_per_pick = parsedPickTime;
        }
      }

      const { data: newLeague, error: leagueError } = await supabase.from('leagues').insert(leagueData).select('id, invite_code').single();
      if (leagueError) throw leagueError;

      // Note: displayName removed, using user's first name from auth/user profile instead
      await supabase.from('league_members').insert({
        league_id: newLeague.id,
        user_id: user.id,
        team_name: teamName.trim(),
        points: 0,
        weekly_points: 0,
        weekly_points_history: {},
        free_agent_moves: 0,
        starters: [],
        bench: []
      });

      navigate("/home", {
        state: { message: `✅ League created! Your invite code is: ${newLeague.invite_code}`, leagueId: newLeague.id }
      });
    } catch (err) {
      alert("Error: " + err.message);
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
            <span className="inline-block text-4xl sm:text-5xl mb-2 sm:mb-4">🏆</span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-black mb-4 sm:mb-6 leading-tight">
            <span className="bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
              Create a League
            </span>
          </h1>
          <div className="inline-flex items-center px-4 py-2 bg-white/10 backdrop-blur-sm rounded-full border border-white/20">
            <span className="w-2 h-2 bg-green-400 rounded-full mr-2 animate-pulse"></span>
            <span className="text-sm font-medium">Current Week: {currentWeek}</span>
          </div>
        </div>

        <form onSubmit={handleCreateLeague} className="space-y-6 sm:space-y-8">
          {/* League Settings Card */}
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 sm:p-8 border border-white/20">
            <h3 className="text-xl sm:text-2xl font-bold mb-6 text-white">
              League Settings
            </h3>

            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">
                  League Name
                </label>
                <input
                  type="text"
                  placeholder="Enter league name"
                  value={leagueName}
                  onChange={(e) => setLeagueName(e.target.value)}
                  maxLength={25}
                  required
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-300"
                />
                <p className="mt-1 text-xs text-white/60">
                  {leagueName.length}/25 characters
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">
                  Number of Managers
                </label>
                <select
                  value={maxManagers}
                  onChange={(e) => setMaxManagers(Number(e.target.value))}
                  required
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-300"
                >
                  <option value={8} className="text-black">8 Managers</option>
                  <option value={10} className="text-black">10 Managers</option>
                  <option value={12} className="text-black">12 Managers</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">
                  Draft Type
                </label>
                <select
                  value={draftType}
                  onChange={(e) => setDraftType(e.target.value)}
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-300 appearance-none cursor-pointer"
                >
                  <option value="manual" className="text-black">Manual Draft</option>
                  <option value="live" className="text-black">Live Draft</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">
                  Draft Order
                </label>
                <select
                  value={draftOrderType}
                  onChange={(e) => setDraftOrderType(e.target.value)}
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-300"
                >
                  <option value="random" className="text-black">Random Order</option>
                  <option value="admin" className="text-black">Commissioner Sets Order</option>
                </select>
              </div>
            </div>

            {/* Info Cards */}
            {draftOrderType === "random" && (
              <div className="mt-6 p-4 bg-blue-500/20 border border-blue-400/30 rounded-xl">
                <p className="text-sm text-blue-200">
                  <strong>Random Order:</strong> Draft order will be randomly shuffled when the draft begins.
                </p>
              </div>
            )}

            {draftOrderType === "admin" && (
              <div className="mt-6 p-4 bg-amber-500/20 border border-amber-400/30 rounded-xl">
                <p className="text-sm text-amber-200">
                  <strong>Commissioner Sets Order:</strong> You'll be able to arrange the draft order before starting the draft.
                </p>
              </div>
            )}
          </div>

          {/* Live Draft Settings */}
          {draftType === "live" && (
            <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 sm:p-8 border border-white/20">
              <h3 className="text-xl sm:text-2xl font-bold mb-6 text-white">
                Live Draft Settings
              </h3>

              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-white/80 mb-2">
                    Draft Date
                  </label>
                  <input
                    type="date"
                    value={draftDate}
                    onChange={(e) => setDraftDate(e.target.value)}
                    min={getMinDraftDate()}
                    max={getMaxDraftDate()}
                    required
                    className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-300"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-white/80 mb-2">
                    Draft Time
                  </label>
                  <input
                    type="time"
                    value={draftTime}
                    onChange={(e) => setDraftTime(e.target.value)}
                    required
                    className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-300"
                  />
                </div>

                <div className="p-4 bg-amber-500/20 border border-amber-400/30 rounded-xl">
                  <p className="text-sm text-amber-200">
                    Draft must be scheduled at least 15 minutes from now.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-white/80 mb-2">
                    Time on Clock
                  </label>
                  <select
                    value={timePerPick}
                    onChange={(e) => setTimePerPick(e.target.value)}
                    required
                    className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-300"
                  >
                    <option value="1" className="text-black">1 minute</option>
                    <option value="2" className="text-black">2 minutes</option>
                    <option value="5" className="text-black">5 minutes</option>
                    <option value="10" className="text-black">10 minutes</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Manual Draft Info */}
          {draftType === "manual" && (
            <div className="bg-blue-500/20 border border-blue-400/30 rounded-2xl p-6">
              <h4 className="text-lg font-semibold text-blue-200 mb-2">
                Manual Draft
              </h4>
              <p className="text-sm text-blue-200">
                You can enter team lineups after league creation. The commissioner will manually input all drafted teams for each manager.
              </p>
            </div>
          )}

          {/* Your Team Info Card */}
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 sm:p-8 border border-white/20">
            <h3 className="text-xl sm:text-2xl font-bold mb-6 text-white">
              Your Team Information
            </h3>

            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">
                  Your Team Name (max 20 characters)
                </label>
                <input
                  type="text"
                  placeholder="Enter your team name"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  maxLength={20}
                  required
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-300"
                />
              </div>
            </div>
          </div>

          {/* Submit Button */}
          <button 
            type="submit" 
            disabled={loading}
            className={`w-full py-4 px-8 rounded-xl text-lg font-bold transition-all duration-300 transform ${
              loading 
                ? 'bg-white/20 text-white/50 cursor-not-allowed' 
                : 'bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 text-white hover:scale-105 shadow-2xl hover:shadow-purple-500/40'
            }`}
          >
            {loading ? "Creating League..." : "Create League"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default CreateLeague;