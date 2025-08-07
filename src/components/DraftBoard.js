import React from "react";

function DraftBoard({ draftData, userMap, allTeams, userFirstNames }) {
  if (!draftData) return null;

  if (!draftData.draftOrder || !Array.isArray(draftData.draftOrder)) {
    const managerIds = Object.keys(draftData.teams || draftData.selectedTeams || {});
    if (managerIds.length === 0) {
      return <div>No draft data available</div>;
    }
    draftData.draftOrder = managerIds;
  }

  const totalRounds = 7;
  const draftOrder = draftData.draftOrder;
  const numManagers = draftOrder.length;
  const teamSelections = draftData.selectedTeams || draftData.teams || {};

  const snakeOrder = [];
  for (let round = 0; round < totalRounds; round++) {
    const order = round % 2 === 0 ? draftOrder : [...draftOrder].reverse();
    snakeOrder.push(...order);
  }

  const slotMap = {};
  draftOrder.forEach(uid => {
    slotMap[uid] = new Array(totalRounds).fill(null);
  });

  const flatPicks = [];
  for (let i = 0; i < snakeOrder.length; i++) {
    const uid = snakeOrder[i];
    const round = Math.floor(i / numManagers);
    const userTeams = teamSelections[uid] || [];
    const team = userTeams[round];
    flatPicks.push(team ? { uid, team } : null);
  }

  let pickNumber = 1;
  for (let i = 0; i < snakeOrder.length; i++) {
    const uid = snakeOrder[i];
    const round = Math.floor(i / numManagers);
    const pick = flatPicks[i];
    slotMap[uid][round] = pick && pick.uid === uid ? { team: pick.team, pickNumber } : { team: "", pickNumber };
    pickNumber++;
  }

  return (
    <div style={{ padding: "16px", width: "100%" }}>
      {/* Header */}
      <div style={{ marginBottom: "16px", textAlign: "center" }}>
        <h1 style={{ fontSize: "24px", fontWeight: "700", color: "#f1f5f9", marginBottom: "8px" }}>Draft Board</h1>
        <p style={{ fontSize: "14px", color: "#cbd5e1", margin: 0 }}>
          {draftData.draftComplete ? "Draft Complete" : `Pick ${draftData.currentPickIndex + 1} of ${totalRounds * numManagers}`}
        </p>
      </div>

      {/* Scrollable Area */}
      <div style={{ overflowX: "auto", width: "100%" }}>
        <div style={{ display: "flex", flexDirection: "column", minWidth: `${draftOrder.length * 120}px` }}>
          {/* Header Row */}
          <div style={{ display: "flex", background: "linear-gradient(135deg, #1e40af 0%, #0ea5e9 100%)", color: "white" }}>
            {draftOrder.map((uid, index) => {
              const teamName = userMap[uid]?.teamName || "Unnamed Team";
              const firstName = userFirstNames?.[uid] || "Unknown";
              return (
                <div key={uid} style={{
                  width: "120px",
                  padding: "16px 8px",
                  textAlign: "center",
                  borderRight: index < draftOrder.length - 1 ? "1px solid rgba(255, 255, 255, 0.2)" : "none",
                  position: "relative"
                }}>
                  <div style={{
                    position: "absolute",
                    top: "6px",
                    left: "6px",
                    width: "20px",
                    height: "20px",
                    borderRadius: "50%",
                    backgroundColor: "rgba(255, 255, 255, 0.2)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "10px",
                    fontWeight: "700"
                  }}>{index + 1}</div>
                  <div style={{
                    fontSize: "12px",
                    fontWeight: "700",
                    marginBottom: "4px",
                    marginTop: "8px",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap"
                  }}>{teamName}</div>
                  <div style={{
                    fontSize: "10px",
                    opacity: "0.9",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap"
                  }}>{firstName}</div>
                </div>
              );
            })}
          </div>

          {/* Draft Grid */}
          <div style={{ display: "flex" }}>
            {draftOrder.map((uid, managerIndex) => (
              <div key={uid} style={{ width: "120px", borderRight: managerIndex < draftOrder.length - 1 ? "1px solid #e2e8f0" : "none" }}>
                {slotMap[uid].map(({ team, pickNumber }, roundIndex) => {
                  const isEmpty = !team;
                  const isCurrentPick = pickNumber === (draftData.currentPickIndex + 1) && !draftData.draftComplete;
                  const isEvenRound = roundIndex % 2 === 0;

                  const teamData = allTeams?.[team];
                  const teamColor = teamData?.color;

                  const isLightColor = (color) => {
                    if (!color) return true;
                    const hex = color.replace('#', '');
                    const r = parseInt(hex.substr(0, 2), 16);
                    const g = parseInt(hex.substr(2, 2), 16);
                    const b = parseInt(hex.substr(4, 2), 16);
                    const brightness = ((r * 299) + (g * 587) + (b * 114)) / 1000;
                    return brightness > 155;
                  };

                  const backgroundColor = teamColor || "#f1f5f9";
                  const textColor = teamColor
                    ? (isLightColor(teamColor) ? "#1e293b" : "white")
                    : "#1e293b";

                  return (
                    <div key={roundIndex} style={{
                      minHeight: "70px",
                      padding: "12px 8px",
                      textAlign: "center",
                      borderBottom: roundIndex < totalRounds - 1 ? "1px solid #e2e8f0" : "none",
                      backgroundColor: isCurrentPick
                        ? "#fef3c7"
                        : isEvenRound
                          ? "#f8fafc"
                          : "white",
                      border: isCurrentPick ? "2px solid #f59e0b" : "none",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "center",
                      position: "relative"
                    }}>
                      <div style={{
                        position: "absolute",
                        top: "4px",
                        left: "6px",
                        fontSize: "9px",
                        fontWeight: "600",
                        color: "#64748b"
                      }}>#{pickNumber}</div>
                      <div style={{
                        position: "absolute",
                        top: "4px",
                        right: "6px",
                        fontSize: "9px",
                        fontWeight: "600",
                        color: "#64748b"
                      }}>R{roundIndex + 1}</div>
                      <div style={{ marginTop: "12px" }}>
                        {isCurrentPick && isEmpty ? (
                          <div style={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            gap: "6px"
                          }}>
                            <div style={{
                              width: "10px",
                              height: "10px",
                              backgroundColor: "#f59e0b",
                              borderRadius: "50%",
                              animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite"
                            }} />
                            <span style={{
                              fontSize: "10px",
                              fontWeight: "700",
                              color: "#d97706"
                            }}>ON CLOCK</span>
                          </div>
                        ) : isEmpty ? (
                          <div style={{
                            color: "#cbd5e1",
                            fontSize: "18px"
                          }}>—</div>
                        ) : (
                          <div style={{
                            backgroundColor,
                            color: textColor,
                            borderRadius: "8px",
                            padding: "4px 6px",
                            fontSize: "11px",
                            fontWeight: "700",
                            textAlign: "center",
                            border: teamColor ? "none" : "1px solid #e2e8f0",
                            textShadow: teamColor && !isLightColor(teamColor) ? "0 1px 2px rgba(0,0,0,0.3)" : "none",
                            height: "42px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            overflow: "hidden",
                            lineHeight: "1.1",
                            textOverflow: "ellipsis",
                            whiteSpace: "normal",
                            wordBreak: "break-word"
                          }}>
                            <span style={{
                              display: "inline-block",
                              width: "100%",
                              overflow: "hidden",
                              textOverflow: "ellipsis"
                            }}>
                              {teamData?.school || team}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Draft Progress Bar */}
      {!draftData.draftComplete && (
        <div style={{
          marginTop: "16px",
          backgroundColor: "white",
          borderRadius: "12px",
          padding: "16px",
          boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
          border: "1px solid #e2e8f0"
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
            <span style={{ fontSize: "14px", fontWeight: "600", color: "#1e293b" }}>Draft Progress</span>
            <span style={{ fontSize: "12px", color: "#64748b" }}>
              {Math.round(((draftData.currentPickIndex) / (totalRounds * numManagers)) * 100)}%
            </span>
          </div>
          <div style={{ height: "8px", backgroundColor: "#e2e8f0", borderRadius: "4px" }}>
            <div style={{
              width: `${((draftData.currentPickIndex) / (totalRounds * numManagers)) * 100}%`,
              height: "100%",
              background: "linear-gradient(90deg, #1e40af 0%, #0ea5e9 100%)",
              borderRadius: "4px"
            }} />
          </div>
        </div>
      )}

      {/* Pulse Animation */}
      <style>{`
        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.5;
          }
        }
      `}</style>
    </div>
  );
}

export default DraftBoard;