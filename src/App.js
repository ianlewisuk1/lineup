import React, { useEffect, useState } from "react";
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from "react-router-dom";
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
import LeagueLandingPage from "./pages/LeagueLandingPage";
import MyLineup from "./pages/MyLineup";
import FreeAgents from "./pages/FreeAgents";
import MyLeague from "./pages/MyLeague";

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

  const handleLogout = () => {
    signOut(auth);
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
            | <Link to="/login">Login</Link>
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
        <Route path="/league/:leagueId" element={<LeagueLandingPage />} />
        <Route path="/:leagueId/my-lineup" element={<MyLineup />} />
        <Route path="/:leagueId/free-agents" element={<FreeAgents />} />
        <Route path="/:leagueId/draft-room" element={<DraftRoom />} />
        <Route path="/league/:leagueId/my-league" element={<MyLeague />} />
      </Routes>
    </>
  );
}

export default AppWrapper;
