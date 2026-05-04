import React, { useEffect, useState } from "react";
import SplashScreen from "./components/SplashScreen";
import {
  BrowserRouter as Router,
  Routes,
  Route
} from "react-router-dom";
import { supabase } from "./supabase/supabase";

import SignUp from "./pages/SignUp";
import VerifyEmail from "./pages/VerifyEmail";
import Login from "./pages/Login";
import ForgotPassword from "./pages/ForgotPassword";
import CreateLeague from "./pages/CreateLeague";
import JoinLeague from "./pages/JoinLeague";
import DraftRoom from "./pages/DraftRoom.jsx";
import Home from "./pages/Home";
import Landing from "./pages/Landing";
import MyLineup from "./pages/MyLineup";
import FreeAgents from "./pages/FreeAgents";
import MyLeague from "./pages/MyLeague";
import ConfirmCut from "./pages/ConfirmCut";
import DraftGuard from "./components/DraftGuard";
import HowToPlay from "./pages/HowToPlay";
import LeagueRules from "./pages/LeagueRules";
import Stats from "./pages/Stats";
import TeamPage from "./pages/TeamPage";
import ConfirmAddTeam from "./pages/ConfirmAddTeam";
import ConfirmSwapTeam from "./pages/ConfirmSwapTeam";
import Scouting from "./pages/Scouting";
import PrivateRoute from "./components/PrivateRoute";
import LeagueLayout from "./components/LeagueLayout";
import AdminPanel from "./pages/AdminPanel";
import AdminLeagueDetail from "./pages/AdminLeagueDetail"; 
import AdminTeamsPanel from "./pages/AdminTeamsPanel";
import AdminSchedulePanel from "./pages/AdminSchedulePanel";
import LeagueMembers from "./pages/LeagueMembers";

function AppWrapper() {
  return (
    <Router>
      <App />
    </Router>
  );
}

function App() {
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    // Force a 1.5s minimum splash screen on cold start.
    // User data, teams, and config are loaded in AuthContext in parallel during this wait.
    const minDelay = new Promise(resolve => setTimeout(resolve, 1500));

    supabase.auth.getSession().then(async () => {
      await minDelay;
      setAuthLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      // Auth state changes are handled by AuthContext
    });

    return () => subscription.unsubscribe();
  }, []);

  if (authLoading) return <SplashScreen />;

  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/signup" element={<SignUp />} />
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/verify-email" element={<VerifyEmail />} />
      <Route path="/home" element={<PrivateRoute><Home /></PrivateRoute>} />
      <Route path="/create-league" element={<PrivateRoute><CreateLeague /></PrivateRoute>} />
      <Route path="/join-league" element={<PrivateRoute><JoinLeague /></PrivateRoute>} />
      <Route path="/join/:code" element={<PrivateRoute><JoinLeague /></PrivateRoute>} />
      <Route path="/how-to-play" element={<HowToPlay />} />
      <Route path="/admin" element={<AdminPanel />} />
      <Route path="/admin/league/:leagueId" element={<AdminLeagueDetail />} />
      <Route path="/admin/teams" element={<AdminTeamsPanel />} />
      <Route path="/admin/schedule" element={<AdminSchedulePanel />} />

      {/* League Pages — all share LeagueProvider via LeagueLayout */}
      <Route path=":leagueId" element={<PrivateRoute><LeagueLayout /></PrivateRoute>}>
        <Route path="draft-room" element={<DraftRoom />} />
        <Route path="league-rules" element={<LeagueRules />} />
        <Route path="members" element={<LeagueMembers />} />
        <Route path="scouting" element={<Scouting />} />
        <Route path="team/:teamName" element={<TeamPage />} />
        <Route path="my-lineup" element={<DraftGuard><MyLineup /></DraftGuard>} />
        <Route path="free-agents" element={<DraftGuard><FreeAgents /></DraftGuard>} />
        <Route path="my-league" element={<DraftGuard><MyLeague /></DraftGuard>} />
        <Route path="stats" element={<DraftGuard><Stats /></DraftGuard>} />
      </Route>

      {/* Confirmation Pages */}
      <Route path="/cut/:leagueId/:teamName" element={<PrivateRoute><ConfirmCut /></PrivateRoute>} />
      <Route path="/confirm-add/:leagueId/:teamName" element={<PrivateRoute><ConfirmAddTeam /></PrivateRoute>} />
      <Route path="/confirm-swap/:leagueId/:addTeam/:dropTeam" element={<PrivateRoute><ConfirmSwapTeam /></PrivateRoute>} />
    </Routes>
  );
}

export default AppWrapper;
