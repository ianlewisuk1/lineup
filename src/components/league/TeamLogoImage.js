import React from "react";

const getInitials = (name) => {
  if (!name) return "?";
  const words = name.trim().split(/\s+/);
  if (words.length === 1) return name.slice(0, 2).toUpperCase();
  return words.map(w => w[0]).join("").slice(0, 2).toUpperCase();
};

const TeamLogoImage = ({ teamId, teamName, primaryColor, size = 32 }) => {
  const initials = getInitials(teamName);
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", overflow: "hidden",
      position: "relative", backgroundColor: primaryColor || "#374151",
      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0
    }}>
      <span style={{ color: "white", fontSize: size * 0.28, fontWeight: "700", letterSpacing: "0.5px", userSelect: "none" }}>
        {initials}
      </span>
      <img
        src={`/logos/${teamId}.png`}
        alt={teamName}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain" }}
        onError={e => { e.target.style.display = "none"; }}
      />
    </div>
  );
};

export default TeamLogoImage;
