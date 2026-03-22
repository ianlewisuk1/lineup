import React from "react";
import { Link } from "react-router-dom";
import logoWordmark from "../assets/logo-wordmark-transparent.png";

const steps = [
  {
    n: '1',
    title: 'Join or create a league',
    body: 'Start by creating a private league or joining one with a friend\'s invite code. Play with people you know.',
  },
  {
    n: '2',
    title: 'Draft your teams',
    body: 'Take turns picking college teams in a live snake draft. You\'ll end up with 5 starters and 2 bench teams. Choose wisely.',
  },
  {
    n: '3',
    title: 'Earn points weekly',
    body: 'Your teams earn points based on their real-life game results every Saturday. Win when they win, lose when they lose.',
  },
  {
    n: '4',
    title: 'Manage your lineup',
    body: 'Swap starters with bench teams, pick up free agents, and drop underperformers throughout the season.',
  },
  {
    n: '5',
    title: 'Climb the standings',
    body: 'The manager with the most points at the end of the season wins.',
  },
];

function HowToPlay() {
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#ffffff', display: 'flex', flexDirection: 'column' }}>

      {/* Nav */}
      <nav style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '16px 24px', borderBottom: '1px solid #F3F4F6',
      }}>
        <Link to="/">
          <img src={logoWordmark} alt="Lineup" style={{ width: 'clamp(120px, 30vw, 200px)' }} />
        </Link>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <Link to="/login" style={{ fontSize: 14, fontWeight: 500, color: '#6B7280', textDecoration: 'none' }}>
            Log in
          </Link>
          <Link
            to="/signup"
            style={{
              fontSize: 14, fontWeight: 700, color: '#ffffff',
              padding: '8px 18px', borderRadius: 50, textDecoration: 'none',
              backgroundColor: '#0072BC',
            }}
          >
            Sign up free
          </Link>
        </div>
      </nav>

      {/* Content */}
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '40px 24px 64px', flex: 1 }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <h1 style={{ fontSize: 28, fontWeight: 900, color: '#111827', margin: '0 0 8px' }}>
            How it works
          </h1>
          <p style={{ fontSize: 16, color: '#6B7280', margin: 0 }}>
            College football fantasy in five simple steps.
          </p>
        </div>

        {/* Steps */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {steps.map(({ n, title, body }) => (
            <div
              key={n}
              style={{
                display: 'flex', gap: 16, alignItems: 'flex-start',
                backgroundColor: '#F9FAFB', borderRadius: 16, padding: '20px 20px',
                border: '1px solid #F3F4F6',
              }}
            >
              <div style={{
                width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
                backgroundColor: '#0072BC', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 800, fontSize: 16,
              }}>
                {n}
              </div>
              <div>
                <div style={{ fontWeight: 700, color: '#111827', fontSize: 16, marginBottom: 4 }}>{title}</div>
                <p style={{ fontSize: 14, color: '#6B7280', margin: 0, lineHeight: 1.6 }}>{body}</p>
              </div>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div style={{ textAlign: 'center', marginTop: 40 }}>
          <Link
            to="/signup"
            style={{
              display: 'inline-block', padding: '16px 40px', borderRadius: 50,
              backgroundColor: '#0072BC', color: '#fff', fontWeight: 700,
              fontSize: 16, textDecoration: 'none',
            }}
          >
            Get started — it's free
          </Link>
          <div style={{ marginTop: 16 }}>
            <Link to="/" style={{ fontSize: 14, color: '#9CA3AF', textDecoration: 'none' }}>
              ← Back
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default HowToPlay;
