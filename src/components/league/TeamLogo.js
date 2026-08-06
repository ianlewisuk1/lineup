import React from "react";
import { normalize, getScheduleEntry, isTeamOnBye } from "../../utils/scheduleUtils";
import { getCurrentWeekNumber } from "../../utils/leagueUtils";
import TeamLogoImage from "./TeamLogoImage";

const TeamLogo = ({
  teamName,
  size = 32,
  clickable = false,
  isCaptain = false,
  isTripPlay = false,
  allTeams,
  scheduleData,
  scheduleLoading,
  viewMode,
  currentWeek,
  onTeamClick,
}) => {
  const team = allTeams?.[normalize(teamName)];
  const scheduleGame = getScheduleEntry(scheduleData, teamName);
  const hasWeekSchedule = !scheduleLoading && Object.keys(scheduleData || {}).length > 0;
  const byeThisWeek = viewMode === "current" && hasWeekSchedule && isTeamOnBye(teamName, scheduleData);

  const handleClick = () => {
    if (clickable && teamName) {
      onTeamClick({ name: teamName, ...team, isFlipped: false });
    }
  };

  const logoStyle = {
    width: size,
    height: size,
    borderRadius: "50%",
    overflow: "hidden",
    border: isCaptain ? "3px solid #fbbf24" :
            isTripPlay ? "3px solid #06b6d4" :
            "2px solid rgba(255, 255, 255, 0.3)",
    cursor: clickable ? "pointer" : "default",
    transition: "all 0.3s ease",
    flexShrink: 0,
    boxShadow: isCaptain ? "0 4px 12px rgba(251, 191, 36, 0.3)" :
              isTripPlay ? "0 4px 12px rgba(6, 182, 212, 0.3)" :
              "0 4px 12px rgba(0, 0, 0, 0.1)",
    transform: "scale(1)",
    position: "relative",
  };

  const currentWeekNum = getCurrentWeekNumber(currentWeek);

  const getTeamDisplayState = () => {
    if (viewMode !== "current") {
      return { display: "?", state: "historical", color: "#6b7280", bgColor: "#374151", shouldPulse: false };
    }

    if (byeThisWeek) {
      return { display: "—", state: "bye", color: "#9ca3af", bgColor: "#4b5563", shouldPulse: false };
    }

    if (scheduleGame && !scheduleLoading) {
      const { gameStatus, gameComplete, hasLiveGame } = scheduleGame;
      let weeklyPoints = team?.currentSeason?.weeklyPoints?.[`week${currentWeekNum}`] || 0;

      if (isCaptain && isTripPlay && weeklyPoints !== 0) weeklyPoints *= 5;
      else if (isCaptain && weeklyPoints !== 0) weeklyPoints *= 2;
      else if (isTripPlay && weeklyPoints !== 0) weeklyPoints *= 3;

      if (gameComplete === true || gameStatus === "final") {
        return { display: weeklyPoints, state: "final", color: isCaptain || isTripPlay ? "#fbbf24" : "#3b82f6", bgColor: isCaptain || isTripPlay ? "#f59e0b" : "#2563eb", shouldPulse: false };
      }
      if (gameStatus === "in_progress" || hasLiveGame) {
        return { display: weeklyPoints, state: "live", color: isCaptain || isTripPlay ? "#fbbf24" : "#10b981", bgColor: isCaptain || isTripPlay ? "#f59e0b" : "#059669", shouldPulse: true };
      }
      return { display: "?", state: "unplayed", color: "#6b7280", bgColor: "#374151", shouldPulse: false };
    }

    let weeklyPoints = team?.currentSeason?.weeklyPoints?.[`week${currentWeekNum}`] || 0;
    const { gameComplete, gameStatus, hasLiveGame } = team?.currentSeason || {};

    if (isCaptain && isTripPlay && weeklyPoints !== 0) weeklyPoints *= 5;
    else if (isCaptain && weeklyPoints !== 0) weeklyPoints *= 2;
    else if (isTripPlay && weeklyPoints !== 0) weeklyPoints *= 3;

    if (gameComplete === true || gameStatus === "final") {
      return { display: weeklyPoints, state: "final", color: isCaptain || isTripPlay ? "#fbbf24" : "#3b82f6", bgColor: isCaptain || isTripPlay ? "#f59e0b" : "#2563eb", shouldPulse: false };
    }
    if (gameStatus === "in_progress" || hasLiveGame || (weeklyPoints !== 0 && gameComplete === false)) {
      return { display: weeklyPoints, state: "live", color: isCaptain || isTripPlay ? "#fbbf24" : "#10b981", bgColor: isCaptain || isTripPlay ? "#f59e0b" : "#059669", shouldPulse: true };
    }
    return { display: "?", state: "unplayed", color: "#6b7280", bgColor: "#374151", shouldPulse: false };
  };

  const teamState = getTeamDisplayState();

  const getSpreadDisplay = () => {
    if (viewMode !== "current") return null;
    const spreadDisplayVal = team?.currentSeason?.nextOpponentSpreadDisplay;
    const spreadNum = team?.currentSeason?.nextOpponentSpread;
    if (spreadDisplayVal && spreadDisplayVal !== "TBD") return spreadDisplayVal;
    if (typeof spreadNum === "number" && !isNaN(spreadNum)) {
      if (spreadNum === 0) return "PK";
      return spreadNum > 0 ? `+${spreadNum}` : `${spreadNum}`;
    }
    return null;
  };

  const spreadDisplay = getSpreadDisplay();
  const primaryColor = team?.colors?.primary || "#374151";

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      {/* 5X Combo Badge */}
      {isCaptain && isTripPlay && clickable ? (
        <div style={{
          position: "absolute", top: "-15px", right: "-10px",
          background: "linear-gradient(135deg, #fbbf24 0%, #06b6d4 50%, #8b5cf6 100%)",
          color: "white", borderRadius: "12px", width: "28px", height: "20px",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "11px", fontWeight: "900", zIndex: 20,
          border: "2px solid rgba(255, 255, 255, 0.9)",
          boxShadow: "0 4px 12px rgba(0, 0, 0, 0.4), 0 0 15px rgba(251, 191, 36, 0.3)",
          animation: "pulse 2s infinite, glow 3s ease-in-out infinite alternate",
          textShadow: "0 1px 2px rgba(0, 0, 0, 0.8)", letterSpacing: "0.5px"
        }}>5X</div>
      ) : (
        <>
          {isCaptain && clickable && (
            <div style={{
              position: "absolute", top: "-12px", right: "-8px",
              backgroundColor: "#fbbf24", color: "#92400e", borderRadius: "50%",
              width: "18px", height: "18px", display: "flex", alignItems: "center",
              justifyContent: "center", fontSize: "12px", zIndex: 15,
              border: "2px solid rgba(255, 255, 255, 0.8)", boxShadow: "0 2px 6px rgba(0, 0, 0, 0.3)"
            }}>👑</div>
          )}
          {isTripPlay && clickable && (
            <div style={{
              position: "absolute", top: "-12px", right: "-8px",
              backgroundColor: "#06b6d4", color: "#083344", borderRadius: "50%",
              width: "18px", height: "18px", display: "flex", alignItems: "center",
              justifyContent: "center", fontSize: "12px", zIndex: 15,
              border: "2px solid rgba(255, 255, 255, 0.9)",
              boxShadow: "0 2px 6px rgba(0, 0, 0, 0.3), 0 0 8px rgba(6, 182, 212, 0.6)"
            }}>⚡</div>
          )}
        </>
      )}

      {/* Weekly Points Badge */}
      {clickable && (
        <div
          className={teamState.shouldPulse ? "animate-pulse" : ""}
          style={{
            position: "absolute", top: "-8px", left: "50%", transform: "translateX(-50%)",
            backgroundColor: teamState.bgColor, color: "white", borderRadius: "50%",
            width: "18px", height: "18px", display: "flex", alignItems: "center",
            justifyContent: "center", fontSize: "9px", fontWeight: "700", zIndex: 10,
            border: "2px solid rgba(255, 255, 255, 0.3)",
            boxShadow: `0 2px 6px rgba(0, 0, 0, 0.2)${teamState.shouldPulse ? ", 0 0 10px " + teamState.color + "40" : ""}`
          }}
        >{teamState.display}</div>
      )}

      {/* Spread Badge */}
      {clickable && viewMode === "current" && (
        <div style={{
          position: "absolute", bottom: "-10px", left: "50%", transform: "translateX(-50%)",
          backgroundColor: byeThisWeek ? "#7c3aed" : !spreadDisplay ? "#6b7280" : spreadDisplay.includes("-") ? "#10b981" : spreadDisplay === "PK" ? "#6366f1" : "#ef4444",
          color: "white", borderRadius: "8px", width: `${size}px`, height: "16px",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "8px", fontWeight: "800", zIndex: 10,
          border: "1px solid rgba(255, 255, 255, 0.3)", boxShadow: "0 2px 6px rgba(0, 0, 0, 0.2)",
          padding: "0 6px", letterSpacing: "0.3px", textTransform: "uppercase"
        }}>{byeThisWeek ? "BYE" : (spreadDisplay || "TBD")}</div>
      )}

      {/* Logo */}
      <div
        style={logoStyle}
        onClick={handleClick}
        onMouseEnter={(e) => {
          if (clickable) {
            e.currentTarget.style.transform = "scale(1.05)";
            e.currentTarget.style.boxShadow = isCaptain ? "0 6px 20px rgba(251, 191, 36, 0.5)" : "0 6px 20px rgba(59, 130, 246, 0.3)";
          }
        }}
        onMouseLeave={(e) => {
          if (clickable) {
            e.currentTarget.style.transform = "scale(1)";
            e.currentTarget.style.boxShadow = isCaptain ? "0 4px 12px rgba(251, 191, 36, 0.3)" : "0 4px 12px rgba(0, 0, 0, 0.1)";
          }
        }}
        title={clickable ? `Click to view ${teamName} details${isCaptain ? " (Captain - 2x Points)" : ""}${isTripPlay ? " (Trip Play - 3x Points)" : ""}${isCaptain && isTripPlay ? " (5x Combo!)" : ""}` : teamName}
      >
        <TeamLogoImage teamName={teamName} primaryColor={primaryColor} size={size} />
      </div>
    </div>
  );
};

export default TeamLogo;
