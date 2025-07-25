const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

const serviceAccountPath = path.resolve(__dirname, "serviceAccountKey.json");
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

const backfillCurrentRoster = async () => {
  const leaguesSnap = await db.collection("leagues").get();

  for (const leagueDoc of leaguesSnap.docs) {
    const leagueId = leagueDoc.id;
    const membersRef = db.collection("leagues").doc(leagueId).collection("members");
    const membersSnap = await membersRef.get();

    for (const memberDoc of membersSnap.docs) {
      const memberData = memberDoc.data();
      const lineup = memberData.lineup || {};
      const drafted = lineup.drafted || [];
      const currentRoster = lineup.currentRoster || [];

      if (currentRoster.length === 0 && drafted.length > 0) {
        await memberDoc.ref.update({
          "lineup.currentRoster": drafted
        });
        console.log(`✅ Updated currentRoster for ${memberDoc.id} in league ${leagueId}`);
      } else {
        console.log(`⏭️ Skipped ${memberDoc.id} in league ${leagueId} (already set)`);
      }
    }
  }

  console.log("🏁 Backfill complete.");
};

backfillCurrentRoster().catch(console.error);
