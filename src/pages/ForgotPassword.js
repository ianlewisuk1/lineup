import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "../supabase/supabase";
import logoWordmark from "../assets/logo-wordmark-transparent.png";

const inputStyle = {
  width: '100%',
  padding: '12px 16px',
  borderRadius: 12,
  border: '1.5px solid #E5E7EB',
  fontSize: 15,
  color: '#111827',
  outline: 'none',
  boxSizing: 'border-box',
  backgroundColor: '#F9FAFB',
};

const labelStyle = {
  display: 'block',
  fontSize: 13,
  fontWeight: 600,
  color: '#374151',
  marginBottom: 6,
};

function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
    } catch (err) {
      // Always show success — don't reveal if email exists
    } finally {
      setLoading(false);
      setSuccess(true);
      setTimeout(() => navigate("/login"), 4000);
    }
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#ffffff', display: 'flex', flexDirection: 'column' }}>

      {/* Nav */}
      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderBottom: '1px solid #F3F4F6' }}>
        <Link to="/"><img src={logoWordmark} alt="Lineup" style={{ width: 'clamp(100px, 25vw, 160px)' }} /></Link>
        <Link to="/login" style={{ fontSize: 14, fontWeight: 600, color: '#0072BC', textDecoration: 'none' }}>
          Back to login
        </Link>
      </nav>

      {/* Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 24px' }}>
        <div style={{ width: '100%', maxWidth: 400 }}>

          {!success ? (
            <>
              <h1 style={{ fontSize: 26, fontWeight: 900, color: '#111827', marginBottom: 8 }}>Reset your password</h1>
              <p style={{ fontSize: 15, color: '#6B7280', marginBottom: 32 }}>
                Enter your email and we'll send you a reset link.
              </p>

              <form onSubmit={handleResetPassword} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={labelStyle}>Email</label>
                  <input
                    type="email"
                    placeholder="your@email.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    style={inputStyle}
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    padding: '14px 0', borderRadius: 50, border: 'none',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    backgroundColor: loading ? '#93C5FD' : '#0072BC',
                    color: '#fff', fontWeight: 700, fontSize: 16, marginTop: 8,
                  }}
                >
                  {loading ? "Sending..." : "Send reset link"}
                </button>
              </form>

              <p style={{ fontSize: 14, color: '#6B7280', textAlign: 'center', marginTop: 24 }}>
                Remember your password?{' '}
                <Link to="/login" style={{ color: '#0072BC', fontWeight: 600, textDecoration: 'none' }}>Log in</Link>
              </p>
            </>
          ) : (
            <div style={{ textAlign: 'center' }}>
              <div style={{
                width: 56, height: 56, borderRadius: '50%', backgroundColor: '#ECFDF5',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 24px', fontSize: 24,
              }}>
                ✓
              </div>
              <h2 style={{ fontSize: 22, fontWeight: 900, color: '#111827', marginBottom: 8 }}>Check your email</h2>
              <p style={{ fontSize: 15, color: '#6B7280', marginBottom: 24 }}>
                If an account exists for <strong>{email}</strong>, a reset link has been sent. Check your inbox and spam folder.
              </p>
              <p style={{ fontSize: 13, color: '#9CA3AF' }}>Redirecting to login...</p>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

export default ForgotPassword;
