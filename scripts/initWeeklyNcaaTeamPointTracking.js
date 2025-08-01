// initWeeklyNcaaTeamPointTracking.js

import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = getFirestore();

async function initializeWeeklyTracking() {
  const teamsRef = db.collection("teams");
  const teamsSnap = await teamsRef.get();

  for (const teamDoc of teamsSnap.docs) {
    const teamId = teamDoc.id;
    const teamData = teamDoc.data();
    const currentSeason = teamData.currentSeason;

    if (!currentSeason) {
      console.log(`⚠️ Skipping ${teamId} — no currentSeason`);
      continue;
    }

    const updates = {};

    if (currentSeason.currentWeekPoints === undefined) {
      updates["currentSeason.currentWeekPoints"] = 0;
    }

    if (
      !currentSeason.weeklyPoints ||
      typeof currentSeason.weeklyPoints !== "object"
    ) {
      updates["currentSeason.weeklyPoints"] = {};
    }

    if (currentSeason.seasonTotalPoints === undefined) {
      updates["currentSeason.seasonTotalPoints"] = 0;
    }

    if (Object.keys(updates).length > 0) {
      await db.collection("teams").doc(teamId).update(updates);
      console.log(`✅ Updated ${teamId}`);
    } else {
      console.log(`✅ Skipped ${teamId} — already has tracking`);
    }
  }

  console.log("🎉 Finished weekly point tracking initialization");
}

initializeWeeklyTracking().catch((err) => {
  console.error("❌ Script failed:", err);
});
