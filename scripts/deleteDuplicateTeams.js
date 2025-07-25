// scripts/deleteDuplicateTeams.js
const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

const serviceAccountPath = path.resolve(__dirname, "serviceAccountKey.json");
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

const deleteDuplicates = async () => {
  const snapshot = await db.collection("teams").get();
  const seen = new Map(); // key = school, value = first doc ID

  const duplicates = [];

  snapshot.forEach(doc => {
    const data = doc.data();
    const school = data.school;
    if (!school) return;

    if (seen.has(school)) {
      duplicates.push(doc.ref);
    } else {
      seen.set(school, doc.id);
    }
  });

  console.log(`Found ${duplicates.length} duplicate teams. Deleting...`);
  for (const ref of duplicates) {
    await ref.delete();
  }

  console.log("✅ Cleanup complete.");
  process.exit(0);
};

deleteDuplicates();
