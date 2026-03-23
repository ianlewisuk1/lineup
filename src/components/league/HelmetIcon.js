import React from "react";

const toHex = (c) => {
  if (!c) return null;
  if (c.startsWith("#")) return c;
  if (/^[0-9a-fA-F]{6}$/.test(c)) return `#${c}`;
  return c;
};

const HelmetIcon = ({ color, alternate_color, size = 40 }) => {
  const primary = toHex(color) || "#1e3a5f";
  const secondary = toHex(alternate_color) || "#ffffff";

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Helmet dome */}
      <path
        d="M 18,82 C 9,82 7,70 7,57 C 7,20 36,7 57,7 C 79,7 93,25 93,50 C 93,68 81,82 65,82 L 18,82 Z"
        fill={primary}
      />

      {/* Speed stripe */}
      <path
        d="M 54,8 C 71,9 86,23 92,46 L 92,60 C 90,68 84,74 76,75 L 62,75 C 62,58 55,30 54,8 Z"
        fill={secondary}
        opacity="0.9"
      />

      {/* Earhole */}
      <circle cx="34" cy="52" r="11" fill="rgba(0,0,0,0.25)" />

      {/* Facemask bars */}
      <line x1="82" y1="41" x2="92" y2="38" stroke={secondary} strokeWidth="5.5" strokeLinecap="round" />
      <line x1="83" y1="53" x2="92" y2="56" stroke={secondary} strokeWidth="5.5" strokeLinecap="round" />

      {/* Subtle dome highlight */}
      <path
        d="M 22,28 Q 42,14 62,18"
        stroke="rgba(255,255,255,0.18)"
        strokeWidth="5"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
};

export default HelmetIcon;
