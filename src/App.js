import React, { useEffect, useState } from "react";
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from "react-router-dom";
import { auth, db } from "./firebase/firebase";
import { signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

import SignUp from "./pages/SignUp";
import Login from "./pages/Login";
import CreateLeague from "./pages/CreateLeague";
import JoinLeague from "./pages/JoinLeague";
//import AssignTeams from "./pages/AssignTeams"; // if needed later
import DraftRoom from "./pages/DraftRoom";
import Home from "./pages/Home";
import Landing from "./pages/Landing";

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
  const isLandingPage = location.pathname === "/";

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        const userDoc = await getDoc(doc(db, "users", currentUser.uid));
        setDisplayName(userDoc.data()?.name || currentUser.email);
      }
    });

    return () => unsubscribe();
  }, []);

  const handleLogout = () => {
    signOut(auth);
  };

  return (
    <>
      {!isLandingPage && (
        <nav style={{ marginBottom: "20px" }}>
          {user ? <Link to="/home">Home</Link> : <Link to="/">Home</Link>}{" "}
          {user ? (
            <>
              | <Link to="/create-league">Create League</Link>{" "}
              | <Link to="/join-league">Join League</Link>{" "}
              | <Link to="/draft">Draft Room</Link>{" "}
              | <button onClick={handleLogout}>Logout</button>
            </>
          ) : (
            <>
              | <Link to="/signup">Sign Up</Link>{" "}
              | <Link to="/login">Login</Link>
            </>
          )}
        </nav>
      )}

      <span>Logged in as: {displayName}</span>


      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/signup" element={<SignUp />} />
        <Route path="/login" element={<Login />} />
        <Route path="/home" element={<Home />} />
        <Route path="/create-league" element={<CreateLeague />} />
        <Route path="/join-league" element={<JoinLeague />} />
        <Route path="/draft" element={<DraftRoom />} />
      </Routes>
    </>
  );
}

export default AppWrapper;
