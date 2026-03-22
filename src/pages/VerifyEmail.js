import React, { useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { supabase } from "../supabase/supabase";
import logoWordmark from "../assets/logo-wordmark-transparent.png";

const inputStyle = {
  width: '100%',
  padding: '14px 16px',
  borderRadius: 12,
  border: '1.5px solid #E5E7EB',
  fontSize: 24,
  color: '#111827',
  outline: 'none',
  boxSizing: 'border-box',
  backgroundColor: '#F9FAFB',
  textAlign: 'center',
  letterSpacing: '0.3em',
};

function VerifyEmail() {
  const navigate = useNavigate();
  const location = useLocation();
  const email = location.state?.email || "";

  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resent, setResent] = useState(false);

  const handleVerify = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { error: verifyError } = await supabase.auth.verifyOtp({ email, token, type: "signup" });
    setLoading(false);

    if (verifyError) {
      setError(verifyError.message);
    } else {
      navigate("/home");
    }
  };

  const handleResend = async () => {
    setResent(false);
    const { error: resendError } = await supabase.auth.resend({ type: "signup", email });
    if (!resendError) setResent(true);
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#ffffff', display: 'flex', flexDirection: 'column' }}>

      {/* Nav */}
      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderBottom: '1px solid #F3F4F6' }}>
        <Link to="/"><img src={logoWordmark} alt="Lineup" style={{ width: 'clamp(100px, 25vw, 160px)' }} /></Link>
      </nav>

      {/* Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 24px' }}>
        <div style={{ width: '100%', maxWidth: 400 }}>

          <h1 style={{ fontSize: 26, fontWeight: 900, color: '#111827', marginBottom: 8 }}>Check your email</h1>
          <p style={{ fontSize: 15, color: '#6B7280', marginBottom: 32 }}>
            We sent a verification code to <strong style={{ color: '#111827' }}>{email}</strong>
          </p>

          {error && (
            <div style={{ backgroundColor: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '12px 16px', marginBottom: 24 }}>
              <p style={{ fontSize: 14, color: '#DC2626', margin: 0 }}>{error}</p>
            </div>
          )}

          {resent && (
            <div style={{ backgroundColor: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 10, padding: '12px 16px', marginBottom: 24 }}>
              <p style={{ fontSize: 14, color: '#065F46', margin: 0 }}>Code resent — check your inbox.</p>
            </div>
          )}

          <form onSubmit={handleVerify} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                Verification code
              </label>
              <input
                type="text"
                inputMode="numeric"
                placeholder="••••••••"
                maxLength={8}
                value={token}
                onChange={e => setToken(e.target.value.replace(/\D/g, ""))}
                required
                style={inputStyle}
              />
            </div>

            <button
              type="submit"
              disabled={loading || token.length < 8}
              style={{
                padding: '14px 0', borderRadius: 50, border: 'none',
                cursor: (loading || token.length < 8) ? 'not-allowed' : 'pointer',
                backgroundColor: (loading || token.length < 8) ? '#93C5FD' : '#0072BC',
                color: '#fff', fontWeight: 700, fontSize: 16, marginTop: 8,
              }}
            >
              {loading ? "Verifying..." : "Verify & continue"}
            </button>
          </form>

          <p style={{ fontSize: 14, color: '#6B7280', textAlign: 'center', marginTop: 24 }}>
            Didn't get it?{' '}
            <button
              onClick={handleResend}
              style={{ background: 'none', border: 'none', color: '#0072BC', fontWeight: 600, fontSize: 14, cursor: 'pointer', padding: 0 }}
            >
              Resend code
            </button>
          </p>

        </div>
      </div>
    </div>
  );
}

export default VerifyEmail;
