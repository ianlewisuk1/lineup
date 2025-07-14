import React, { useEffect, useState } from "react";
import { BrowserRouter as Router, Routes, Route, Link } from "react-router-dom";
import { auth, db } from "./firebase/firebase";
import { signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

import SignUp from "./pages/SignUp";
import Login from "./pages/Login";
import CreateLeague from "./pages/CreateLeague";
import JoinLeague from "./pages/JoinLeague";
import AssignTeams from "./pages/AssignTeams";
import StartDraft from "./pages/StartDraft";
import DraftRoom from "./pages/DraftRoom";

function App() {
  const [user, setUser] = useState(null);
  const [displayName, setDisplayName] = useState("");

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
    <Router>
      <nav style={{ marginBottom: "20px" }}>
        {user ? (
          <>
            <span>Logged in as: {displayName}</span> |{" "}
            <button onClick={handleLogout}>Logout</button> |{" "}
            <Link to="/create-league">Create League</Link> |{" "}
            <Link to="/join-league">Join League</Link> |{" "}
            <Link to="/assign-teams">Assign Teams</Link> |{" "}
            <Link to="/start-draft">Start Draft</Link> |{" "}
            <Link to="/draft">Draft Room</Link>
          </>
        ) : (
          <>
            <Link to="/signup">Sign Up</Link> |{" "}
            <Link to="/login">Login</Link>
          </>
        )}
      </nav>

      <Routes>
        <Route path="/signup" element={<SignUp />} />
        <Route path="/login" element={<Login />} />
        <Route path="/create-league" element={<CreateLeague />} />
        <Route path="/join-league" element={<JoinLeague />} />
        <Route path="/assign-teams" element={<AssignTeams />} />
        <Route path="/start-draft" element={<StartDraft />} />
        <Route path="/draft" element={<DraftRoom />} />
      </Routes>
    </Router>
  );
}

export default App;
