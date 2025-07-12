import React from "react";
import { BrowserRouter as Router, Routes, Route, Link } from "react-router-dom";
import SignUp from "./pages/SignUp";
import Login from "./pages/Login";
import CreateLeague from "./pages/CreateLeague";
import JoinLeague from "./pages/JoinLeague";


function App() {
  return (
    <Router>
      <nav>
        <Link to="/signup">Sign Up</Link> | 
        <Link to="/login">Login</Link> | 
        <Link to="/create-league">Create League</Link> |
        <Link to="/join-leagues">Join League</Link>
      </nav>

      <Routes>
          <Route path="/signup" element={<SignUp />} />
          <Route path="/login" element={<Login />} />
          <Route path="/create-league" element={<CreateLeague />} />
          <Route path="/join-league" element={<JoinLeague />} />
      </Routes>
    </Router>
  );
}

export default App;
