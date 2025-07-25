// scripts/seedTestStats.js
const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

const serviceAccountPath = path.resolve(__dirname, "serviceAccountKey.json");
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

const getRandomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

const seed = async () => {
  const snapshot = await db.collection("teams").get();
  const fbsDocs = snapshot.docs.filter(doc => doc.data().classification === "FBS");

  if (fbsDocs.length < 10) {
    console.error("❌ Not enough FBS teams to pick 10.");
    process.exit(1);
  }

  // Shuffle and select 10 random teams
  const shuffled = fbsDocs.sort(() => 0.5 - Math.random()).slice(0, 10);

  for (const docRef of shuffled) {
    const data = docRef.data();
    const updated = {
      currentSeason: {
        ...data.currentSeason,
        gamePoints: getRandomInt(1, 50),
        avgPointsFor: getRandomInt(1, 50),
        avgPointsAgainst: getRandomInt(1, 50),
      }
    };

    await docRef.ref.update(updated);
    console.log(`✅ Updated ${data.school}`);
  }

  process.exit(0);
};

seed();
