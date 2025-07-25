// src/App.js
import React, { useEffect, useState } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Link,
  useLocation,
  useNavigate
} from "react-router-dom";
import { auth, db } from "./firebase/firebase";
import { signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

import SignUp from "./pages/SignUp";
import Login from "./pages/Login";
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
import ConfirmAddTeam from "./pages/ConfirmAddTeam";
import ConfirmSwapTeam from "./pages/ConfirmSwapTeam";
import Scouting from "./pages/Scouting";
import PreDraftOnly from "./components/PreDraftOnly";

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
  const location = useLocation();
  const navigate = useNavigate();

  const hideLoggedInBar = ["/", "/login", "/signup"].includes(location.pathname);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        const userDoc = await getDoc(doc(db, "users", currentUser.uid));
        setDisplayName(
          userDoc.data()?.firstName
            ? `${userDoc.data().firstName} ${userDoc.data().lastName || ""}`
            : currentUser.email
        );
      } else {
        setDisplayName("");
      }
    });

    return () => unsubscribe();
  }, []);

  const handleLogout = async () => {
    const confirmed = window.confirm("Are you sure you want to log out?");
    if (!confirmed) return;

    try {
      await signOut(auth);
      navigate("/");
    } catch (err) {
      console.error("Logout error:", err);
    }
  };

  return (
    <>
      <nav style={{ marginBottom: "10px" }}>
        {user ? <Link to="/home">Home</Link> : <Link to="/">Home</Link>}{" "}
        {user ? (
          <>
            | <Link to="/create-league">Create League</Link>{" "}
            | <Link to="/join-league">Join League</Link>{" "}
            | <button onClick={handleLogout}>Logout</button>
          </>
        ) : (
          <>
            | <Link to="/signup">Sign Up</Link>{" "}
            | <Link to="/login">Login</Link>{" "}
            | <Link to="/how-to-play">How to Play</Link>
          </>
        )}
      </nav>

      {!hideLoggedInBar && user && (
        <div style={{ marginBottom: "10px" }}>
          Logged in as: <strong>{displayName}</strong>
        </div>
      )}

      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/signup" element={<SignUp />} />
        <Route path="/login" element={<Login />} />
        <Route path="/home" element={<Home />} />
        <Route path="/create-league" element={<CreateLeague />} />
        <Route path="/join-league" element={<JoinLeague />} />
        <Route path="/how-to-play" element={<HowToPlay />} />

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
    </>
  );
}

export default AppWrapper;
