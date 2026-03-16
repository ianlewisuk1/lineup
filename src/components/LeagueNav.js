import React from "react";
import { Link } from "react-router-dom";
import ProfileDropdown from "./ProfileDropdown";

function LeagueNav() {
  return (
    <nav className="relative z-10 flex justify-between items-center p-4 sm:p-6 lg:p-8">
      <Link to="/home" className="flex items-center space-x-3">
        <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-r from-purple-500 to-blue-500 rounded-lg flex items-center justify-center font-bold text-lg sm:text-xl">
          L
        </div>
        <span className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
          Lineup
        </span>
      </Link>
      <ProfileDropdown />
    </nav>
  );
}

export default LeagueNav;
