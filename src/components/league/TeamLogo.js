import React from "react";
import { normalize, getScheduleEntry, isTeamOnBye } from "../../utils/scheduleUtils";
import { getCurrentWeekNumber } from "../../utils/leagueUtils";

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
  const team = allTeams[normalize(teamName)];
  const logoUrl = team?.logo;
  const scheduleGame = getScheduleEntry(scheduleData, teamName);
  const hasWeekSchedule = !scheduleLoading && Object.keys(scheduleData || {}).length > 0;
  const byeThisWeek = viewMode === 'current' && hasWeekSchedule && isTeamOnBye(teamName, scheduleData);

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
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    cursor: clickable ? "pointer" : "default",
    transition: "all 0.3s ease",
    flexShrink: 0,
    boxShadow: isCaptain ? "0 4px 12px rgba(251, 191, 36, 0.3)" :
              isTripPlay ? "0 4px 12px rgba(6, 182, 212, 0.3)" :
              "0 4px 12px rgba(0, 0, 0, 0.1)",
    transform: "scale(1)",
    position: "relative",
    backdropFilter: "blur(10px)"
  };

  const currentWeekNum = getCurrentWeekNumber(currentWeek);

  const getTeamDisplayState = () => {

    if (viewMode !== 'current') {
      return {
        display: "?",
        state: "historical",
        color: "#6b7280",
        bgColor: "#374151",
        shouldPulse: false
      };
    }

    // BYE: no game entry this week
    if (byeThisWeek) {
      return {
        display: "—",
        state: "bye",
        color: "#9ca3af",
        bgColor: "#4b5563",
        shouldPulse: false
      };
    }

    // First check schedule data (most reliable for current week)
    if (scheduleGame && !scheduleLoading) {
      const gameStatus = scheduleGame.gameStatus;
      const gameComplete = scheduleGame.gameComplete;
      const hasLiveGame = scheduleGame.hasLiveGame;

      // Get weekly points from team document
      let weeklyPoints = team?.currentSeason?.weeklyPoints?.[`week${currentWeekNum}`] || 0;

      // Apply captain and trip play bonuses for display (backend handles actual scoring)
      if (isCaptain && isTripPlay && weeklyPoints !== 0) {
        weeklyPoints *= 5; // 5x combo
      } else if (isCaptain && weeklyPoints !== 0) {
        weeklyPoints *= 2; // Captain 2x
      } else if (isTripPlay && weeklyPoints !== 0) {
        weeklyPoints *= 3; // Trip play 3x
      }

      // Determine status based on schedule data
      if (gameComplete === true || gameStatus === 'final') {
        return {
          display: weeklyPoints,
          state: "final",
          color: isCaptain || isTripPlay ? "#fbbf24" : "#3b82f6", // Gold for multipliers, blue for others
          bgColor: isCaptain || isTripPlay ? "#f59e0b" : "#2563eb",
          shouldPulse: false
        };
      }

      // Game is currently in progress (based on schedule)
      if (gameStatus === 'in_progress' || hasLiveGame) {
        return {
          display: weeklyPoints,
          state: "live",
          color: isCaptain || isTripPlay ? "#fbbf24" : "#10b981", // Gold for multipliers, green for others
          bgColor: isCaptain || isTripPlay ? "#f59e0b" : "#059669",
          shouldPulse: true
        };
      }

      // Game hasn't started yet but is scheduled
      return {
        display: "?",
        state: "unplayed",
        color: "#6b7280",
        bgColor: "#374151",
        shouldPulse: false
      };
    }

    // Fallback to team document if no schedule data (shouldn't happen for current week)
    let weeklyPoints = team?.currentSeason?.weeklyPoints?.[`week${currentWeekNum}`] || 0;

    const gameComplete = team?.currentSeason?.gameComplete;
    const gameStatus = team?.currentSeason?.gameStatus;
    const hasLiveGame = team?.currentSeason?.hasLiveGame;

    // Apply captain and trip play bonuses for display (backend handles actual scoring)
    if (isCaptain && isTripPlay && weeklyPoints !== 0) {
      weeklyPoints *= 5; // 5x combo
    } else if (isCaptain && weeklyPoints !== 0) {
      weeklyPoints *= 2; // Captain 2x
    } else if (isTripPlay && weeklyPoints !== 0) {
      weeklyPoints *= 3; // Trip play 3x
    }

    if (gameComplete === true || gameStatus === 'final') {
      return {
        display: weeklyPoints,
        state: "final",
        color: isCaptain || isTripPlay ? "#fbbf24" : "#3b82f6",
        bgColor: isCaptain || isTripPlay ? "#f59e0b" : "#2563eb",
        shouldPulse: false
      };
    }

    if (gameStatus === 'in_progress' || hasLiveGame || (weeklyPoints !== 0 && gameComplete === false)) {
      return {
        display: weeklyPoints,
        state: "live",
        color: isCaptain || isTripPlay ? "#fbbf24" : "#10b981",
        bgColor: isCaptain || isTripPlay ? "#f59e0b" : "#059669",
        shouldPulse: true
      };
    }

    // Game hasn't started yet
    return {
      display: "?",
      state: "unplayed",
      color: "#6b7280",
      bgColor: "#374151",
      shouldPulse: false
    };
  };

  const teamState = getTeamDisplayState();

  // Get the spread for display - use nextOpponentSpreadDisplay or calculate from nextOpponentSpread
  const getSpreadDisplay = () => {
    // Only show spread for current week
    if (viewMode !== 'current') return null;

    const spreadDisplayVal = team?.currentSeason?.nextOpponentSpreadDisplay;
    const spreadNum = team?.currentSeason?.nextOpponentSpread;

    // If we have a formatted display string, use it
    if (spreadDisplayVal && spreadDisplayVal !== "TBD") {
      return spreadDisplayVal;
    }

    // Otherwise format the number
    if (typeof spreadNum === 'number' && !isNaN(spreadNum)) {
      if (spreadNum === 0) return "PK";  // Pick 'em
      return spreadNum > 0 ? `+${spreadNum}` : `${spreadNum}`;
    }

    return null; // No spread available
  };

  const spreadDisplay = getSpreadDisplay();

  if (logoUrl) {
    return (
      <div style={{ position: "relative", display: "inline-block" }}>
        {/* Special 5X Combo Badge - appears when BOTH captain and trip play are active */}
        {isCaptain && isTripPlay && clickable ? (
          <div style={{
            position: "absolute",
            top: "-15px",
            right: "-10px",
            background: "linear-gradient(135deg, #fbbf24 0%, #06b6d4 50%, #8b5cf6 100%)",
            color: "white",
            borderRadius: "12px",
            width: "28px",
            height: "20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "11px",
            fontWeight: "900",
            zIndex: 20,
            border: "2px solid rgba(255, 255, 255, 0.9)",
            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.4), 0 0 15px rgba(251, 191, 36, 0.3)",
            animation: "pulse 2s infinite, glow 3s ease-in-out infinite alternate",
            textShadow: "0 1px 2px rgba(0, 0, 0, 0.8)",
            letterSpacing: "0.5px"
          }}>
            5X
          </div>
        ) : (
          <>
            {/* Captain Crown - only show if no trip play combo */}
            {isCaptain && clickable && (
              <div style={{
                position: "absolute",
                top: "-12px",
                right: "-8px",
                backgroundColor: "#fbbf24",
                color: "#92400e",
                borderRadius: "50%",
                width: "18px",
                height: "18px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "12px",
                zIndex: 15,
                border: "2px solid rgba(255, 255, 255, 0.8)",
                boxShadow: "0 2px 6px rgba(0, 0, 0, 0.3)"
              }}>
                👑
              </div>
            )}

            {/* Trip Play Lightning Badge - only show if no captain combo */}
            {isTripPlay && clickable && (
              <div style={{
                position: "absolute",
                top: "-12px",
                right: "-8px",
                backgroundColor: "#06b6d4",
                color: "#083344",
                borderRadius: "50%",
                width: "18px",
                height: "18px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "12px",
                zIndex: 15,
                border: "2px solid rgba(255, 255, 255, 0.9)",
                boxShadow: "0 2px 6px rgba(0, 0, 0, 0.3), 0 0 8px rgba(6, 182, 212, 0.6)"
              }}>
                ⚡
              </div>
            )}
          </>
        )}

        {/* Weekly Points Badge - Above logo with enhanced styling */}
        {clickable && (
          <div
            className={teamState.shouldPulse ? "animate-pulse" : ""}
            style={{
              position: "absolute",
              top: "-8px",
              left: "50%",
              transform: "translateX(-50%)",
              backgroundColor: teamState.bgColor,
              color: "white",
              borderRadius: "50%",
              width: "18px",
              height: "18px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "9px",
              fontWeight: "700",
              zIndex: 10,
              border: "2px solid rgba(255, 255, 255, 0.3)",
              boxShadow: `0 2px 6px rgba(0, 0, 0, 0.2)${teamState.shouldPulse ? ', 0 0 10px ' + teamState.color + '40' : ''}`
            }}
          >
            {teamState.display}
          </div>
        )}

        {/* Spread Badge - Below logo */}
        {clickable && viewMode === 'current' && (
          <div style={{
            position: "absolute",
            bottom: "-10px",
            left: "50%",
            transform: "translateX(-50%)",
            backgroundColor: byeThisWeek
              ? "#7c3aed"
              : !spreadDisplay
                ? "#6b7280"
                : spreadDisplay.includes('-')
                  ? "#10b981"
                  : spreadDisplay === "PK"
                    ? "#6366f1"
                    : "#ef4444",
            color: "white",
            borderRadius: "8px",
            width: `${size}px`,
            height: "16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "8px",
            fontWeight: "800",
            zIndex: 10,
            border: "1px solid rgba(255, 255, 255, 0.3)",
            boxShadow: "0 2px 6px rgba(0, 0, 0, 0.2)",
            padding: "0 6px",
            letterSpacing: "0.3px",
            textTransform: "uppercase"
          }}>
            {byeThisWeek ? "BYE" : (spreadDisplay || "TBD")}
          </div>
        )}

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
          title={clickable ? `Click to view ${teamName} details${isCaptain ? ' (Captain - 2x Points)' : ''}${isTripPlay ? ' (Trip Play - 3x Points)' : ''}${isCaptain && isTripPlay ? ' (5x Combo!)' : ''}` : teamName}
        >
          <img
            src={logoUrl}
            alt={teamName}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover"
            }}
            onError={(e) => {
              const fallbackUrl = team?.logos2;
              if (fallbackUrl && e.target.src !== fallbackUrl) {
                e.target.src = fallbackUrl;
              } else {
                e.target.style.display = 'none';
                e.target.nextSibling.style.display = 'flex';
              }
            }}
          />
          <div style={{
            display: 'none',
            width: '100%',
            height: '100%',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: size < 30 ? '10px' : '12px',
            fontWeight: '600',
            color: 'white',
            textAlign: 'center',
            background: (isCaptain || isTripPlay) ? 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)' : 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)'
          }}>
            {teamName ? teamName.split(' ').map(word => word[0]).join('').slice(0, 3) : '?'}
          </div>
        </div>
      </div>
    );
  }

  // Fallback placeholder with team initials and gradient
  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      {/* Captain Crown */}
      {isCaptain && clickable && (
        <div style={{
          position: "absolute",
          top: "-12px",
          right: "-8px",
          backgroundColor: "#fbbf24",
          color: "#92400e",
          borderRadius: "50%",
          width: "18px",
          height: "18px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "12px",
          zIndex: 15,
          border: "2px solid rgba(255, 255, 255, 0.8)",
          boxShadow: "0 2px 6px rgba(0, 0, 0, 0.3)"
        }}>
          👑
        </div>
      )}

      {/* Trip Play Lightning Badge */}
      {isTripPlay && clickable && (
        <div style={{
          position: "absolute",
          top: "-12px",
          left: "-8px",
          backgroundColor: "#06b6d4",
          color: "#083344",
          borderRadius: "50%",
          width: "18px",
          height: "18px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "12px",
          zIndex: 15,
          border: "2px solid rgba(255, 255, 255, 0.8)",
          boxShadow: "0 2px 6px rgba(0, 0, 0, 0.3)"
        }}>
          ⚡
        </div>
      )}

      {/* Combined 5x Badge for Captain + Trip Play */}
      {isCaptain && isTripPlay && clickable && (
        <div style={{
          position: "absolute",
          bottom: "-12px",
          left: "50%",
          transform: "translateX(-50%)",
          background: "linear-gradient(45deg, #fbbf24, #06b6d4)",
          color: "white",
          borderRadius: "8px",
          padding: "2px 6px",
          fontSize: "10px",
          fontWeight: "bold",
          zIndex: 16,
          border: "1px solid rgba(255, 255, 255, 0.3)",
          boxShadow: "0 2px 6px rgba(0, 0, 0, 0.3)"
        }}>
          5X
        </div>
      )}

      {/* Weekly Points Badge - Enhanced for fallback */}
      {clickable && (
        <div
          className={teamState.shouldPulse ? "animate-pulse" : ""}
          style={{
            position: "absolute",
            top: "-8px",
            left: "50%",
            transform: "translateX(-50%)",
            backgroundColor: teamState.bgColor,
            color: "white",
            borderRadius: "50%",
            width: "18px",
            height: "18px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "9px",
            fontWeight: "700",
            zIndex: 10,
            border: "2px solid rgba(255, 255, 255, 0.3)",
            boxShadow: `0 2px 6px rgba(0, 0, 0, 0.2)${teamState.shouldPulse ? ', 0 0 10px ' + teamState.color + '40' : ''}`
          }}
        >
          {teamState.display}
        </div>
      )}

      {/* Spread Badge - Positioned above logo */}
      {clickable && spreadDisplay && (
        <div style={{
          position: "absolute",
          bottom: "-8px",
          left: "50%",
          transform: "translateX(-50%)",
          backgroundColor: spreadDisplay.includes('+') ? "#10b981" :
                         spreadDisplay === "PK" ? "#6366f1" :
                         "#ef4444",
          color: "white",
          borderRadius: "10px",
          minWidth: "24px",
          height: "16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "8px",
          fontWeight: "700",
          zIndex: 10,
          border: "1px solid rgba(255, 255, 255, 0.3)",
          boxShadow: "0 2px 6px rgba(0, 0, 0, 0.2)",
          padding: "0 4px"
        }}>
          {spreadDisplay}
        </div>
      )}

      <div
        style={{
          ...logoStyle,
          background: (isCaptain || isTripPlay) ? "linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)" : "linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)",
          color: "white",
          fontSize: size < 30 ? '10px' : '12px',
          fontWeight: '600'
        }}
        onClick={handleClick}
        onMouseEnter={(e) => {
          if (clickable) {
            e.currentTarget.style.transform = "scale(1.05)";
            e.currentTarget.style.boxShadow = (isCaptain || isTripPlay) ? "0 6px 20px rgba(251, 191, 36, 0.5)" : "0 6px 20px rgba(59, 130, 246, 0.3)";
          }
        }}
        onMouseLeave={(e) => {
          if (clickable) {
            e.currentTarget.style.transform = "scale(1)";
            e.currentTarget.style.boxShadow = (isCaptain || isTripPlay) ? "0 4px 12px rgba(251, 191, 36, 0.3)" : "0 4px 12px rgba(0, 0, 0, 0.1)";
          }
        }}
        title={clickable ? `Click to view ${teamName} details${isCaptain ? ' (Captain - 2x Points)' : ''}${isTripPlay ? ' (Trip Play - 3x Points)' : ''}${isCaptain && isTripPlay ? ' (5x Combo!)' : ''}` : teamName}
      >
        {teamName ? teamName.split(' ').map(word => word[0]).join('').slice(0, 3) : '?'}
      </div>
    </div>
  );
};

export default TeamLogo;
