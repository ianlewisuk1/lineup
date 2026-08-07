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

// Reads and clears the stored post-login destination. The value is always
// consumed, so a stale entry cannot follow the user into later sessions, and
// only same-origin paths are honoured — a stored absolute URL would otherwise
// redirect off the site after a successful login.
function safeRedirect() {
  const stored = sessionStorage.getItem("authRedirect");
  sessionStorage.removeItem("authRedirect");
  if (!stored) return null;
  return /^\/(?!\/)/.test(stored) ? stored : null;
}

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const { data: { user }, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) throw signInError;

      const { data: userData } = await supabase.from("users").select("is_admin").eq("id", user.id).maybeSingle();
      if (userData?.is_admin) return navigate("/admin");

      navigate(safeRedirect() || "/home");
    } catch (err) {
      setError("Invalid email or password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#ffffff', display: 'flex', flexDirection: 'column' }}>

      {/* Nav */}
      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderBottom: '1px solid #F3F4F6' }}>
        <Link to="/"><img src={logoWordmark} alt="Lineup" style={{ width: 'clamp(100px, 25vw, 160px)' }} /></Link>
        <Link to="/signup" style={{ fontSize: 14, fontWeight: 600, color: '#0072BC', textDecoration: 'none' }}>
          Sign up free
        </Link>
      </nav>

      {/* Form */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 24px' }}>
        <div style={{ width: '100%', maxWidth: 400 }}>
          <h1 style={{ fontSize: 26, fontWeight: 900, color: '#111827', marginBottom: 8 }}>Welcome back</h1>
          <p style={{ fontSize: 15, color: '#6B7280', marginBottom: 32 }}>Log in to manage your lineup.</p>

          {error && (
            <div style={{ backgroundColor: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '12px 16px', marginBottom: 24 }}>
              <p style={{ fontSize: 14, color: '#DC2626', margin: 0 }}>{error}</p>
            </div>
          )}

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={labelStyle}>Email</label>
              <input type="email" placeholder="your@email.com" value={email} onChange={e => setEmail(e.target.value)} required style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Password</label>
              <input type="password" placeholder="Enter your password" value={password} onChange={e => setPassword(e.target.value)} required style={inputStyle} />
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                padding: '14px 0', borderRadius: 50, border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
                backgroundColor: loading ? '#93C5FD' : '#0072BC', color: '#fff', fontWeight: 700, fontSize: 16, marginTop: 8,
              }}
            >
              {loading ? "Logging in..." : "Log in"}
            </button>
          </form>

          <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
            <Link to="/forgot-password" style={{ fontSize: 14, color: '#0072BC', textDecoration: 'none', fontWeight: 500 }}>
              Forgot your password?
            </Link>
            <p style={{ fontSize: 14, color: '#6B7280', margin: 0 }}>
              No account?{' '}
              <Link to="/signup" style={{ color: '#0072BC', fontWeight: 600, textDecoration: 'none' }}>Sign up free</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Login;
