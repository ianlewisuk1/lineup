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

function SignUp() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dob, setDob] = useState("");
  const [error, setError] = useState("");

  const is18OrOlder = (dateString) => {
    const today = new Date();
    const birthDate = new Date(dateString);
    const age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    return age > 18 || (age === 18 && m >= 0);
  };

  const handleSignUp = async (e) => {
    e.preventDefault();
    if (password !== confirmPassword) { setError("Passwords do not match."); return; }
    if (!is18OrOlder(dob)) { setError("You must be at least 18 years old to sign up."); return; }
    try {
      const { error: signUpError } = await supabase.auth.signUp({
        email, password,
        options: { data: { first_name: firstName, last_name: lastName, dob } },
      });
      if (signUpError) throw signUpError;
      navigate("/verify-email", { state: { email } });
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#ffffff', display: 'flex', flexDirection: 'column' }}>

      {/* Nav */}
      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderBottom: '1px solid #F3F4F6' }}>
        <Link to="/"><img src={logoWordmark} alt="Lineup" style={{ width: 'clamp(100px, 25vw, 160px)' }} /></Link>
        <Link to="/login" style={{ fontSize: 14, fontWeight: 600, color: '#0072BC', textDecoration: 'none' }}>
          Log in
        </Link>
      </nav>

      {/* Form */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 24px' }}>
        <div style={{ width: '100%', maxWidth: 400 }}>
          <h1 style={{ fontSize: 26, fontWeight: 900, color: '#111827', marginBottom: 8 }}>Create your account</h1>
          <p style={{ fontSize: 15, color: '#6B7280', marginBottom: 32 }}>Free to play. No experience needed.</p>

          {error && (
            <div style={{ backgroundColor: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '12px 16px', marginBottom: 24 }}>
              <p style={{ fontSize: 14, color: '#DC2626', margin: 0 }}>{error}</p>
            </div>
          )}

          <form onSubmit={handleSignUp} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={labelStyle}>First name</label>
                <input type="text" placeholder="First" value={firstName} onChange={e => setFirstName(e.target.value)} required style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Last name</label>
                <input type="text" placeholder="Last" value={lastName} onChange={e => setLastName(e.target.value)} required style={inputStyle} />
              </div>
            </div>

            <div>
              <label style={labelStyle}>Date of birth</label>
              <input type="date" value={dob} onChange={e => setDob(e.target.value)} required style={inputStyle} />
              <p style={{ fontSize: 12, color: '#9CA3AF', marginTop: 4 }}>Must be 18 or older</p>
            </div>

            <div>
              <label style={labelStyle}>Email</label>
              <input type="email" placeholder="your@email.com" value={email} onChange={e => setEmail(e.target.value)} required style={inputStyle} />
            </div>

            <div>
              <label style={labelStyle}>Password</label>
              <input type="password" placeholder="Create a password" value={password} onChange={e => setPassword(e.target.value)} required style={inputStyle} />
            </div>

            <div>
              <label style={labelStyle}>Confirm password</label>
              <input type="password" placeholder="Confirm your password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required style={inputStyle} />
            </div>

            <button
              type="submit"
              style={{
                padding: '14px 0', borderRadius: 50, border: 'none', cursor: 'pointer',
                backgroundColor: '#0072BC', color: '#fff', fontWeight: 700, fontSize: 16, marginTop: 8,
              }}
            >
              Create account
            </button>
          </form>

          <p style={{ fontSize: 12, color: '#9CA3AF', textAlign: 'center', marginTop: 20 }}>
            By signing up you agree to our terms of service. Lineup is a skill-based fantasy game for users 18+.
          </p>

          <p style={{ fontSize: 14, color: '#6B7280', textAlign: 'center', marginTop: 16 }}>
            Already have an account?{' '}
            <Link to="/login" style={{ color: '#0072BC', fontWeight: 600, textDecoration: 'none' }}>Log in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default SignUp;
