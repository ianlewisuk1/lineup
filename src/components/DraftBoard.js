import React from "react";
import "./DraftBoard.css";

function DraftBoard({ draftData, userMap }) {
  if (!draftData) return null;

  const totalRounds = 7;
  const draftOrder = draftData.draftOrder;
  const numManagers = draftOrder.length;

  // Build flat pick sequence in true snake order
  const snakeOrder = [];
  for (let round = 0; round < totalRounds; round++) {
    const order = round % 2 === 0 ? draftOrder : [...draftOrder].reverse();
    snakeOrder.push(...order);
  }

  // Map picks to the correct UID slots
  const slotMap = {};
  draftOrder.forEach(uid => {
    slotMap[uid] = new Array(totalRounds).fill(null);
  });

  const flatPicks = [];
  Object.entries(draftData.selectedTeams).forEach(([uid, teams]) => {
    teams.forEach(team => flatPicks.push({ uid, team }));
  });

  let pickNumber = 1;
  for (let i = 0; i < snakeOrder.length; i++) {
    const uid = snakeOrder[i];
    const round = Math.floor(i / numManagers);
    const pick = flatPicks[i];

    if (pick && pick.uid === uid) {
      slotMap[uid][round] = { team: pick.team, pickNumber };
    } else {
      slotMap[uid][round] = { team: "", pickNumber };
    }

    pickNumber++;
  }

  return (
    <div className="draft-board">
      <div className="row header-row">
        {draftOrder.map(uid => (
          <div key={uid} className="cell header-cell">
            {userMap[uid] || uid}
          </div>
        ))}
      </div>

      <div className="row body-row">
        {draftOrder.map(uid => (
          <div key={uid} className="column">
            {slotMap[uid].map(({ team, pickNumber }, i) => (
              <div key={i} className="cell">
                <div className="pick-number">#{pickNumber}</div>
                {team}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export default DraftBoard;
