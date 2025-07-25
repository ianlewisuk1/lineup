// scripts/fixConfOdds.js
const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

// Load service account
const serviceAccountPath = path.resolve(__dirname, "serviceAccountKey.json");
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function fixConfOdds() {
  const teamsRef = db.collection("teams");
  const snapshot = await teamsRef.get();

  let count = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data();

    if (data.confOdds == null) {
      await doc.ref.update({ confOdds: 0.1 });
      console.log(`✅ Updated ${data.school} (ID: ${doc.id})`);
      count++;
    }
  }

  console.log(`\n🎯 Finished. Updated ${count} teams.`);
  process.exit(0);
}

fixConfOdds().catch((err) => {
  console.error("❌ Error updating confOdds:", err);
  process.exit(1);
});
