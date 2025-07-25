// scripts/addGamePointsToAllTeams.js

const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

const serviceAccountPath = path.resolve(__dirname, "serviceAccountKey.json");
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

const addGamePointsToAllTeams = async () => {
  const teamsRef = db.collection("teams");
  const snapshot = await teamsRef.get();

  if (snapshot.empty) {
    console.log("⚠️ No teams found.");
    return;
  }

  const updates = snapshot.docs.map(async (docSnap) => {
    const ref = docSnap.ref;
    await ref.update({ gamePoints: 0 });
    console.log(`✅ Updated ${docSnap.data().name}`);
  });

  await Promise.all(updates);
  console.log("🎉 All teams updated with gamePoints: 0");
};

addGamePointsToAllTeams().catch((err) => {
  console.error("❌ Error updating teams:", err);
});
