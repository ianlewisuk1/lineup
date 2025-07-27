import React, { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { auth, db } from "../firebase/firebase";

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      console.log("🔐 Logged in as UID:", user.uid);

      const userDoc = await getDoc(doc(db, "users", user.uid));
      const userData = userDoc.data();

      console.log("📄 Firestore user data:", userData);

      if (userData?.isAdmin) {
        console.log("✅ Detected admin user, navigating to /admin");
        return navigate("/admin");
      }

      console.log("👤 Not admin, navigating to /home");
      navigate("/home");

    } catch (err) {
      console.error("Login error:", err);
      setError(err.message); // 👈 Display actual error from Firebase
    }
  };

  return (
    <form onSubmit={handleLogin}>
      <h2>Login</h2>
      {error && <p style={{ color: "red" }}>{error}</p>}
      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />
      <button type="submit">Login</button>
    </form>
  );
}

export default Login;
