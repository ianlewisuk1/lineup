const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

const serviceAccountPath = path.resolve(__dirname, "serviceAccountKey.json");
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

const updateTeams = async () => {
  const teamsRef = db.collection("teams");
  const snapshot = await teamsRef.get();

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const currentSeason = data.currentSeason || {};

    // Move gamePoints if it exists at root level
    if (data.hasOwnProperty("gamePoints")) {
      currentSeason.gamePoints = data.gamePoints;
    }

    // Add nextOpponentSpread field
    currentSeason.nextOpponentSpread = "TBD";

    // Apply the updates
    await doc.ref.update({
      currentSeason,
    });

    // Delete gamePoints from root if it was present
    if (data.hasOwnProperty("gamePoints")) {
      await doc.ref.update({
        gamePoints: admin.firestore.FieldValue.delete(),
      });
    }

    console.log(`✅ Updated ${data.school}`);
  }

  console.log("✅ All teams updated.");
};

updateTeams().catch((err) => {
  console.error("❌ Error updating teams:", err);
});
