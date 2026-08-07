import React, { useEffect, useState } from "react";
import SplashScreen from "./components/SplashScreen";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  useNavigate,
} from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import { supabase, initialAuthLink } from "./supabase/supabase";

import SignUp from "./pages/SignUp";
import VerifyEmail from "./pages/VerifyEmail";
import Login from "./pages/Login";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
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
  const { loading: authLoading } = useAuth();
  const [minDelayDone, setMinDelayDone] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const timer = setTimeout(() => setMinDelayDone(true), 1500);
    return () => clearTimeout(timer);
  }, []);

  // A recovery link can land on any route, so route it to the reset form from
  // wherever it arrives. Signup verification uses a code rather than a link, so
  // an expired-link error is treated as a failed recovery too — /reset-password
  // explains it and offers a fresh link. `navigate` is stable, so this runs once.
  useEffect(() => {
    const fromRecoveryLink =
      initialAuthLink.isRecovery || initialAuthLink.errorCode === "otp_expired";

    if (fromRecoveryLink && window.location.pathname !== "/reset-password") {
      navigate("/reset-password", { replace: true });
    }
  }, [navigate]);

  // Backstop: fires when the client exchanges a recovery token, covering links
  // whose fragment was already consumed before the check above could read it.
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        navigate("/reset-password", { replace: true });
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  if (!minDelayDone || authLoading) return <SplashScreen />;

  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/signup" element={<SignUp />} />
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
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

      {/* League Pages — all share LeagueProvider + DraftProvider via LeagueLayout */}
      <Route path=":leagueId" element={<PrivateRoute><LeagueLayout /></PrivateRoute>}>
        <Route path="draft-room" element={<DraftRoom />} />
        <Route path="scouting" element={<Scouting />} />
        <Route path="league-rules" element={<LeagueRules />} />
        <Route path="members" element={<LeagueMembers />} />
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
