// updateHawaiiReferences.js
const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json"); // <-- replace with your service account path

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function updateHawaiiNames() {
  const scheduleRef = db.collection("schedule").doc("2025").collection("weeks");

  const weeksSnap = await scheduleRef.get();
  for (const weekDoc of weeksSnap.docs) {
    const weekId = weekDoc.id;
    const gamesRef = weekDoc.ref.collection("games");
    const gamesSnap = await gamesRef.get();

    const batch = db.batch();

    gamesSnap.forEach((gameDoc) => {
      const data = gameDoc.data();
      const updates = {};

      if (data.homeTeam === "Hawai'i") updates.homeTeam = "Hawaii";
      if (data.awayTeam === "Hawai'i") updates.awayTeam = "Hawaii";

      if (Object.keys(updates).length > 0) {
        batch.update(gameDoc.ref, updates);
        console.log(`🛠️ Queued update: Week ${weekId}, Game ${gameDoc.id}`, updates);
      }
    });

    await batch.commit();
    console.log(`✅ Finished week ${weekId}`);
  }

  console.log("🎉 All done!");
}

updateHawaiiNames().catch(console.error);
