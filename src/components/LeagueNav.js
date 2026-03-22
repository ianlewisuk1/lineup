import React from "react";
import { Link } from "react-router-dom";
import ProfileDropdown from "./ProfileDropdown";
import logoWordmark from "../assets/logo-wordmark-transparent.png";

function LeagueNav() {
  return (
    <nav style={{
      backgroundColor: '#ffffff',
      borderBottom: '1px solid #F3F4F6',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '12px 20px',
      position: 'sticky',
      top: 0,
      zIndex: 40,
    }}>
      <Link to="/home">
        <img src={logoWordmark} alt="Lineup" style={{ width: 'clamp(80px, 20vw, 140px)' }} />
      </Link>
      <ProfileDropdown />
    </nav>
  );
}

export default LeagueNav;
