import React, { useEffect, useState } from "react";
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

function ResetPassword() {
  const navigate = useNavigate();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  // "checking" until we know whether the recovery link produced a session,
  // then "ready" (show the form) or "invalid" (link expired or absent).
  const [status, setStatus] = useState("checking");

  // The Supabase client exchanges the token in the URL fragment for a session
  // before this component mounts, so an existing session is the signal that the
  // link was valid. The event listener covers the case where it has not landed
  // yet on first render.
  useEffect(() => {
    let cancelled = false;

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN")) {
        setStatus("ready");
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setStatus(prev => (prev === "ready" ? prev : data.session ? "ready" : "invalid"));
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const handleSetPassword = async (e) => {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    // Force a fresh login with the new password rather than leaving the
    // recovery session active.
    await supabase.auth.signOut();
    setDone(true);
    setTimeout(() => navigate("/login"), 3000);
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

          {status === "checking" && (
            <p style={{ fontSize: 15, color: '#6B7280', textAlign: 'center' }}>Checking your reset link...</p>
          )}

          {status === "invalid" && (
            <div style={{ textAlign: 'center' }}>
              <h1 style={{ fontSize: 26, fontWeight: 900, color: '#111827', marginBottom: 8 }}>Link expired</h1>
              <p style={{ fontSize: 15, color: '#6B7280', marginBottom: 24 }}>
                This reset link is no longer valid. Request a new one.
              </p>
              <Link
                to="/forgot-password"
                style={{
                  display: 'inline-block', padding: '14px 32px', borderRadius: 50,
                  backgroundColor: '#0072BC', color: '#fff', fontWeight: 700,
                  fontSize: 16, textDecoration: 'none',
                }}
              >
                Send a new link
              </Link>
            </div>
          )}

          {status === "ready" && !done && (
            <>
              <h1 style={{ fontSize: 26, fontWeight: 900, color: '#111827', marginBottom: 8 }}>Choose a new password</h1>
              <p style={{ fontSize: 15, color: '#6B7280', marginBottom: 32 }}>
                Pick something you haven't used before.
              </p>

              {error && (
                <div style={{ backgroundColor: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '12px 16px', marginBottom: 24 }}>
                  <p style={{ fontSize: 14, color: '#DC2626', margin: 0 }}>{error}</p>
                </div>
              )}

              <form onSubmit={handleSetPassword} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={labelStyle}>New password</label>
                  <input
                    type="password"
                    placeholder="Create a password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label style={labelStyle}>Confirm password</label>
                  <input
                    type="password"
                    placeholder="Confirm your password"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
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
                  {loading ? "Saving..." : "Update password"}
                </button>
              </form>
            </>
          )}

          {done && (
            <div style={{ textAlign: 'center' }}>
              <div style={{
                width: 56, height: 56, borderRadius: '50%', backgroundColor: '#ECFDF5',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 24px', fontSize: 24,
              }}>
                ✓
              </div>
              <h2 style={{ fontSize: 22, fontWeight: 900, color: '#111827', marginBottom: 8 }}>Password updated</h2>
              <p style={{ fontSize: 15, color: '#6B7280', marginBottom: 24 }}>
                Log in with your new password.
              </p>
              <p style={{ fontSize: 13, color: '#9CA3AF' }}>Redirecting to login...</p>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

export default ResetPassword;
