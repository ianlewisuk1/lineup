import React from "react";
import lineupLogo from "../assets/logo-full-name.png";

function SplashScreen() {
  return (
    <div style={{
      position: 'fixed', inset: 0,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      backgroundColor: '#ffffff',
      gap: 32,
    }}>
      <img src={lineupLogo} alt="Lineup" style={{ width: 250, marginBottom: 32 }} />
      <div style={{ display: 'flex', gap: 6 }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            width: 8, height: 8, borderRadius: '50%', backgroundColor: '#0072BC',
            animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
            opacity: 0.7,
          }} />
        ))}
      </div>
      <style>{`@keyframes pulse { 0%, 100% { transform: scale(1); opacity: 0.4; } 50% { transform: scale(1.4); opacity: 1; } }`}</style>
    </div>
  );
}

export default SplashScreen;
