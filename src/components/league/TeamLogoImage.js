import React from "react";
import { teamLogoUrl } from "../../utils/teamLogo";

const getInitials = (name) => {
  if (!name) return "?";
  const words = name.trim().split(/\s+/);
  if (words.length === 1) return name.slice(0, 2).toUpperCase();
  return words.map(w => w[0]).join("").slice(0, 2).toUpperCase();
};

// Resolves the logo from teamName, not the DB id — the two disagree for at
// least one team (Texas A&M is id "texas-a-m" but school "Texas A&M").
const TeamLogoImage = ({ teamName, primaryColor, size = 32 }) => {
  const initials = getInitials(teamName);
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", overflow: "hidden",
      position: "relative",
      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0
    }}>
      <span style={{ color: primaryColor || "#374151", fontSize: size * 0.28, fontWeight: "700", letterSpacing: "0.5px", userSelect: "none" }}>
        {initials}
      </span>
      <img
        src={teamLogoUrl(teamName)}
        alt={teamName}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain" }}
        onError={e => { e.target.style.display = "none"; }}
      />
    </div>
  );
};

export default TeamLogoImage;
