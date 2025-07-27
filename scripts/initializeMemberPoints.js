const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

const serviceAccountPath = path.resolve(__dirname, "serviceAccountKey.json");
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function initializePointsForAllMembers() {
  const leaguesSnap = await db.collection("leagues").get();

  for (const leagueDoc of leaguesSnap.docs) {
    const leagueId = leagueDoc.id;
    const membersSnap = await db
      .collection("leagues")
      .doc(leagueId)
      .collection("members")
      .get();

    for (const memberDoc of membersSnap.docs) {
      const memberData = memberDoc.data();
      const updates = {};

      if (memberData.points === undefined) {
        updates.points = 0;
      }

      if (memberData.weeklyPoints === undefined) {
        updates.weeklyPoints = {};
      }

      if (Object.keys(updates).length > 0) {
        await memberDoc.ref.update(updates);
        console.log(`✅ Initialized points for ${memberDoc.id} in league ${leagueId}`);
      } else {
        console.log(`⏭️ Already initialized for ${memberDoc.id} in league ${leagueId}`);
      }
    }
  }

  console.log("🎯 Initialization complete for all league members.");
}

initializePointsForAllMembers();
