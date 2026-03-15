import React, { useEffect, useState } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  useNavigate
} from "react-router-dom";
import { supabase } from "./supabase/supabase";

import SignUp from "./pages/SignUp";
import VerifyEmail from "./pages/VerifyEmail";
import Login from "./pages/Login";
import ForgotPassword from "./pages/ForgotPassword";
import CreateLeague from "./pages/CreateLeague";
import JoinLeague from "./pages/JoinLeague";
import DraftRoom from "./pages/DraftRoom";
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
import PreDraftOnly from "./components/PreDraftOnly";
import PrivateRoute from "./components/PrivateRoute";
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
  const [user, setUser] = useState(null);
  const [displayName, setDisplayName] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      if (currentUser) {
        const { data: userData } = await supabase
          .from("users")
          .select("first_name, last_name")
          .eq("id", currentUser.id)
          .single();
        setDisplayName(
          userData?.first_name
            ? `${userData.first_name} ${userData.last_name || ""}`
            : currentUser.email
        );
      } else {
        setDisplayName("");
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      if (currentUser) {
        const { data: userData } = await supabase
          .from("users")
          .select("first_name, last_name")
          .eq("id", currentUser.id)
          .single();
        setDisplayName(
          userData?.first_name
            ? `${userData.first_name} ${userData.last_name || ""}`
            : currentUser.email
        );
      } else {
        setDisplayName("");
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    const confirmed = window.confirm("Are you sure you want to log out?");
    if (!confirmed) return;

    try {
      await supabase.auth.signOut();
      navigate("/");
    } catch (err) {
      console.error("Logout error:", err);
    }
  };

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

      {/* League Pages */}
      <Route path=":leagueId/draft-room" element={<PrivateRoute><DraftRoom /></PrivateRoute>} />
      <Route path=":leagueId/league-rules" element={<PrivateRoute><LeagueRules /></PrivateRoute>} />
      <Route path=":leagueId/members" element={<PrivateRoute><LeagueMembers /></PrivateRoute>} />
      <Route
        path=":leagueId/scouting"
        element={
          <PrivateRoute>
            <PreDraftOnly>
              <Scouting />
            </PreDraftOnly>
          </PrivateRoute>
        }
      />

      {/* TeamPage - Available both pre and post draft */}
      <Route path=":leagueId/team/:teamName" element={<PrivateRoute><TeamPage /></PrivateRoute>} />

      {/* Draft-Dependent League Pages */}
      <Route
        path=":leagueId/my-lineup"
        element={
          <PrivateRoute>
            <DraftGuard>
              <MyLineup />
            </DraftGuard>
          </PrivateRoute>
        }
      />
      <Route
        path=":leagueId/free-agents"
        element={
          <PrivateRoute>
            <DraftGuard>
              <FreeAgents />
            </DraftGuard>
          </PrivateRoute>
        }
      />
      <Route
        path=":leagueId/my-league"
        element={
          <PrivateRoute>
            <DraftGuard>
              <MyLeague />
            </DraftGuard>
          </PrivateRoute>
        }
      />
      <Route
        path=":leagueId/stats"
        element={
          <PrivateRoute>
            <DraftGuard>
              <Stats />
            </DraftGuard>
          </PrivateRoute>
        }
      />

      {/* Confirmation Pages */}
      <Route path="/cut/:leagueId/:teamName" element={<PrivateRoute><ConfirmCut /></PrivateRoute>} />
      <Route path="/confirm-add/:leagueId/:teamName" element={<PrivateRoute><ConfirmAddTeam /></PrivateRoute>} />
      <Route path="/confirm-swap/:leagueId/:addTeam/:dropTeam" element={<PrivateRoute><ConfirmSwapTeam /></PrivateRoute>} />
    </Routes>
  );
}

export default AppWrapper;
