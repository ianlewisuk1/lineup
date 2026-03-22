import React from "react";
import { Link } from "react-router-dom";
import logoFullName from "../assets/logo-full-name.png";

function Landing() {
  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#ffffff',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '32px 24px',
    }}>
      <img src={logoFullName} alt="Lineup Fantasy Sports" style={{ width: 220, marginBottom: 24 }} />

      <p style={{ fontSize: 16, color: '#6B7280', marginBottom: 48, textAlign: 'center' }}>
        College football fantasy, reimagined.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', maxWidth: 320 }}>
        <Link
          to="/signup"
          style={{
            backgroundColor: '#0072BC',
            color: '#ffffff',
            textAlign: 'center',
            padding: '16px 0',
            borderRadius: 50,
            fontWeight: 700,
            fontSize: 16,
            textDecoration: 'none',
          }}
        >
          Get started
        </Link>
        <Link
          to="/login"
          style={{
            backgroundColor: '#ffffff',
            color: '#0072BC',
            textAlign: 'center',
            padding: '16px 0',
            borderRadius: 50,
            fontWeight: 600,
            fontSize: 16,
            textDecoration: 'none',
            border: '2px solid #0072BC',
          }}
        >
          Log in
        </Link>
        <Link
          to="/how-to-play"
          style={{
            color: '#0072BC',
            textAlign: 'center',
            padding: '12px 0',
            fontSize: 15,
            fontWeight: 600,
            textDecoration: 'none',
          }}
        >
          How does it work? →
        </Link>
      </div>
    </div>
  );
}

export default Landing;
