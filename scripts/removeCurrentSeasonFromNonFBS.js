const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json"); // Replace with actual path

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function removeCurrentSeasonFromNonFBS() {
  const teamsRef = db.collection("teams");
  const snapshot = await teamsRef.get();

  const batch = db.batch();
  let count = 0;

  snapshot.forEach((doc) => {
    const data = doc.data();
    if (data.classification !== "FBS") {
      batch.update(doc.ref, {
        currentSeason: admin.firestore.FieldValue.delete(),
      });
      count++;
    }
  });

  if (count > 0) {
    await batch.commit();
    console.log(`✅ Removed currentSeason from ${count} non-FBS teams.`);
  } else {
    console.log("✅ No non-FBS teams found to update.");
  }
}

removeCurrentSeasonFromNonFBS().catch(console.error);
