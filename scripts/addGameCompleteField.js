const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

const serviceAccountPath = path.resolve(__dirname, "serviceAccountKey.json");
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function updateScheduleGames() {
  const weeksSnap = await db
    .collection("schedule")
    .doc("2025")
    .collection("weeks")
    .get();

  for (const weekDoc of weeksSnap.docs) {
    const weekId = weekDoc.id;
    const gamesRef = db
      .collection("schedule")
      .doc("2025")
      .collection("weeks")
      .doc(weekId)
      .collection("games");

    const gamesSnap = await gamesRef.get();

    for (const gameDoc of gamesSnap.docs) {
      await gamesRef.doc(gameDoc.id).update({
        gameComplete: false,
      });
      console.log(`✅ Set gameComplete: false for week ${weekId}, game ${gameDoc.id}`);
    }
  }

  console.log("🎉 Done updating all games under schedule/2025");
}

updateScheduleGames();
