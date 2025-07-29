import React, { useState } from "react";
import { sendPasswordResetEmail } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import { auth } from "../firebase/firebase";

function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      await sendPasswordResetEmail(auth, email);
      
      // Show success message and redirect
      alert("If an account with that email exists, a password reset link has been sent. Please check your inbox and spam folder.");
      
      // Redirect to landing page after 2 seconds
      setTimeout(() => {
        navigate("/");
      }, 2000);
      
    } catch (err) {
      console.error("Password reset error:", err);
      
      // Generic message for security (don't reveal if email exists)
      alert("If an account with that email exists, a password reset link has been sent. Please check your inbox and spam folder.");
      
      // Still redirect even on error for security
      setTimeout(() => {
        navigate("/");
      }, 2000);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: "400px", margin: "2rem auto", padding: "2rem" }}>
      <h2>Reset Password</h2>
      <p style={{ marginBottom: "1.5rem", color: "#666" }}>
        Enter your email address and we'll send you a link to reset your password.
      </p>
      
      <form onSubmit={handleResetPassword}>
        <input
          type="email"
          placeholder="Enter your email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          style={{
            width: "100%",
            padding: "0.75rem",
            marginBottom: "1rem",
            border: "1px solid #ddd",
            borderRadius: "4px",
            fontSize: "1rem"
          }}
        />
        
        <button 
          type="submit" 
          disabled={loading}
          style={{
            width: "100%",
            padding: "0.75rem",
            backgroundColor: "#0066cc",
            color: "white",
            border: "none",
            borderRadius: "4px",
            fontSize: "1rem",
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.6 : 1
          }}
        >
          {loading ? "Sending..." : "Reset Password"}
        </button>
      </form>
      
      <div style={{ marginTop: "1.5rem", textAlign: "center" }}>
        <button
          onClick={() => navigate("/login")}
          style={{
            backgroundColor: "transparent",
            border: "none",
            color: "#0066cc",
            textDecoration: "underline",
            cursor: "pointer",
            fontSize: "0.9rem"
          }}
        >
          Back to Login
        </button>
      </div>
    </div>
  );
}

export default ForgotPassword;