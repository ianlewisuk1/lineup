import React from "react";
import { BrowserRouter as Router, Routes, Route, Link } from "react-router-dom";
import SignUp from "./pages/SignUp";
import Login from "./pages/Login";
import CreateLeague from "./pages/CreateLeague";
import JoinLeague from "./pages/JoinLeague";
import AssignTeams from "./pages/AssignTeams";
import StartDraft from "./pages/StartDraft";


function App() {
  return (
    <Router>
      <nav>
        <Link to="/signup">Sign Up</Link> | 
        <Link to="/login">Login</Link> | 
        <Link to="/create-league">Create League</Link> |
        <Link to="/join-league">Join League</Link> |
        <Link to="/assign-teams">Assign Teams</Link>
      </nav>

      <Routes>
          <Route path="/signup" element={<SignUp />} />
          <Route path="/login" element={<Login />} />
          <Route path="/create-league" element={<CreateLeague />} />
          <Route path="/join-league" element={<JoinLeague />} />
          <Route path="/assign-teams" element={<AssignTeams />} />
          <Route path="/start-draft" element={<StartDraft />} />
      </Routes>
    </Router>
  );
}

export default App;
