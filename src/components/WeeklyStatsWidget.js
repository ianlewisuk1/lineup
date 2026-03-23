import React from "react";
import { TrendingUp, TrendingDown } from "lucide-react";
import { useAuth } from "../context/AuthContext";

// TODO: Replace all dummy data with real platform-wide aggregated stats from the DB
// Trending = net roster change (additions - drops) over the current week across all leagues
// Owned % = (leagues where team is on a roster / total leagues) * 100

const DUMMY_TRENDING_UP = [
  { name: "Houston" },
  { name: "Florida International" },
  { name: "Cincinnati" },
];

const DUMMY_TRENDING_DOWN = [
  { name: "Michigan" },
  { name: "Michigan State" },
  { name: "Georgia" },
];

const DUMMY_MOST_OWNED = [
  { name: "Georgia",      pct: 99.8 },
  { name: "Notre Dame",   pct: 99.4 },
  { name: "North Texas",  pct: 99.1 },
  { name: "JMU",          pct: 99.0 },
  { name: "Indiana",      pct: 98.7 },
];

// Normalize a team name to match the key format used in the teams map
const normalize = (name) =>
  name?.toLowerCase().replace(/\s+/g, "-").replace(/&/g, "").replace(/[^a-z0-9-]/g, "");

function TeamRow({ name, teams, right }) {
  const team = teams[normalize(name)];
  const logo = team?.logo || null;

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {logo ? (
          <img src={logo} alt={name} style={{ width: 24, height: 24, objectFit: 'contain', flexShrink: 0 }} />
        ) : (
          <div style={{ width: 24, height: 24, borderRadius: '50%', backgroundColor: '#F3F4F6', flexShrink: 0 }} />
        )}
        <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{name}</span>
      </div>
      {right}
    </div>
  );
}

function WeeklyStatsWidget() {
  const { teams } = useAuth();

  return (
    <div style={{ marginBottom: 24 }}>
      {/* Section title */}
      <div style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
        Key Stats — Week 14 · 2025
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

        {/* Trending Up + Trending Down — side by side */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>

          {/* Trending Up */}
          <div style={{ backgroundColor: '#ffffff', border: '1.5px solid #F3F4F6', borderRadius: 12, padding: '12px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <TrendingUp size={13} color="#16A34A" />
              <span style={{ fontSize: 11, fontWeight: 700, color: '#16A34A', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Trending Up</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {DUMMY_TRENDING_UP.map((t, i) => (
                <TeamRow key={i} name={t.name} teams={teams} right={
                  <span style={{ fontSize: 11, color: '#16A34A', fontWeight: 700 }}>▲</span>
                } />
              ))}
            </div>
          </div>

          {/* Trending Down */}
          <div style={{ backgroundColor: '#ffffff', border: '1.5px solid #F3F4F6', borderRadius: 12, padding: '12px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <TrendingDown size={13} color="#DC2626" />
              <span style={{ fontSize: 11, fontWeight: 700, color: '#DC2626', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Trending Down</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {DUMMY_TRENDING_DOWN.map((t, i) => (
                <TeamRow key={i} name={t.name} teams={teams} right={
                  <span style={{ fontSize: 11, color: '#DC2626', fontWeight: 700 }}>▼</span>
                } />
              ))}
            </div>
          </div>
        </div>

        {/* Most Owned */}
        <div style={{ backgroundColor: '#ffffff', border: '1.5px solid #F3F4F6', borderRadius: 12, padding: '12px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#0072BC', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Most Owned</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {DUMMY_MOST_OWNED.map((t, i) => {
              const team = teams[normalize(t.name)];
              const logo = team?.logo || null;
              // Scale bar relative to the top entry so differences are visible
              const barWidth = (t.pct / DUMMY_MOST_OWNED[0].pct) * 100;
              return (
                <div key={i}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {logo ? (
                        <img src={logo} alt={t.name} style={{ width: 20, height: 20, objectFit: 'contain', flexShrink: 0 }} />
                      ) : (
                        <div style={{ width: 20, height: 20, borderRadius: '50%', backgroundColor: '#F3F4F6', flexShrink: 0 }} />
                      )}
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{t.name}</span>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#0072BC' }}>{t.pct}%</span>
                  </div>
                  {/* Bar scaled relative to top entry so small differences remain visible */}
                  <div style={{ height: 4, backgroundColor: '#F3F4F6', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${barWidth}%`, backgroundColor: '#0072BC', borderRadius: 2 }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </div>
    </div>
  );
}

export default WeeklyStatsWidget;
