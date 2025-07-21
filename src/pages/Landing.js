import React from "react";
import { Link } from "react-router-dom";

function Landing() {
  return (
    <div>
      <h1>🏈 Welcome to Lineup</h1>
      <p>College Football Fantasy, Reimagined.</p>
      <Link to="/signup">Sign Up</Link> | <Link to="/login">Login</Link>
    </div>
  );
}

export default Landing;
