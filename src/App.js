import React, { useEffect, useState } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  useNavigate
} from "react-router-dom";
import { supabase } from "./supabase/supabase";

import SignUp from "./pages/SignUp";
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
import AdminPanel from "./pages/AdminPanel";
import AdminLeagueDetail from "./pages/AdminLeagueDetail"; 
import AdminTeamsPanel from "./pages/AdminTeamsPanel";
import AdminSchedulePanel from "./pages/AdminSchedulePanel";

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
      <Route path="/home" element={<Home />} />
      <Route path="/create-league" element={<CreateLeague />} />
      <Route path="/join-league" element={<JoinLeague />} />
      <Route path="/how-to-play" element={<HowToPlay />} />
      <Route path="/admin" element={<AdminPanel />} />
      <Route path="/admin/league/:leagueId" element={<AdminLeagueDetail />} />
      <Route path="/admin/teams" element={<AdminTeamsPanel />} />
      <Route path="/admin/schedule" element={<AdminSchedulePanel />} />

      {/* Public League Pages */}
      <Route path=":leagueId/draft-room" element={<DraftRoom />} />
      <Route path=":leagueId/league-rules" element={<LeagueRules />} />
      <Route
        path=":leagueId/scouting"
        element={
          <PreDraftOnly>
            <Scouting />
          </PreDraftOnly>
        }
      />

      {/* TeamPage - Available both pre and post draft */}
      <Route path=":leagueId/team/:teamName" element={<TeamPage />} />

      {/* Draft-Dependent League Pages */}
      <Route
        path=":leagueId/my-lineup"
        element={
          <DraftGuard>
            <MyLineup />
          </DraftGuard>
        }
      />
      <Route
        path=":leagueId/free-agents"
        element={
          <DraftGuard>
            <FreeAgents />
          </DraftGuard>
        }
      />
      <Route
        path=":leagueId/my-league"
        element={
          <DraftGuard>
            <MyLeague />
          </DraftGuard>
        }
      />
      <Route
        path=":leagueId/stats"
        element={
          <DraftGuard>
            <Stats />
          </DraftGuard>
        }
      />

      {/* Confirmation Pages */}
      <Route path="/cut/:leagueId/:teamName" element={<ConfirmCut />} />
      <Route path="/confirm-add/:leagueId/:teamName" element={<ConfirmAddTeam />} />
      <Route path="/confirm-swap/:leagueId/:addTeam/:dropTeam" element={<ConfirmSwapTeam />} />
    </Routes>
  );
}

export default AppWrapper;
