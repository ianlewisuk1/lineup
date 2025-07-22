const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

const serviceAccountPath = path.resolve(__dirname, "serviceAccountKey.json");
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function deleteSubcollection(docRef, subcollectionName) {
  const subSnap = await docRef.collection(subcollectionName).get();
  for (const subDoc of subSnap.docs) {
    console.log(`   ↳ Deleting ${subcollectionName}/${subDoc.id}`);
    await subDoc.ref.delete();
  }
}

async function deleteAllLeagues() {
  const leaguesSnapshot = await db.collection("leagues").get();

  for (const leagueDoc of leaguesSnapshot.docs) {
    const leagueId = leagueDoc.id;
    const leagueRef = db.collection("leagues").doc(leagueId);

    console.log(`🗑️ Deleting league: ${leagueId}`);

    // Delete known subcollections
    await deleteSubcollection(leagueRef, "members");
    await deleteSubcollection(leagueRef, "draft");

    // Add more subcollections here if needed
    // await deleteSubcollection(leagueRef, "matchups");

    // Delete the league document itself
    await leagueRef.delete();
    console.log(`✅ Deleted league ${leagueId}`);
  }

  console.log("🎉 All leagues and subcollections deleted.");
}

deleteAllLeagues().catch((err) => {
  console.error("❌ Error deleting leagues:", err);
  process.exit(1);
});
