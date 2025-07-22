const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json"); // Replace with your actual path

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function updateFBSTeams() {
  const teamsRef = db.collection("teams");
  const snapshot = await teamsRef.get();

  const defaultSeasonData = {
    record: "0-0",
    confRecord: "0-0",
    gamesPlayed: "0",
    ATS: "PENDING SCHEDULE",
    nextOpponent: "PENDING SCHEDULE",
    nextGameDate: "PENDING SCHEDULE",
    totalPointsFor: "0",
    totalPointsAgainst: "0",
    avgPointsFor: "0",
    avgPointsAgainst: "0",
    division: ""
  };

  const batch = db.batch();
  let count = 0;

  snapshot.forEach((doc) => {
    const data = doc.data();
    if (data.classification === "FBS") {
      const teamRef = doc.ref;
      batch.update(teamRef, {
        currentSeason: defaultSeasonData
      });
      count++;
    }
  });

  await batch.commit();
  console.log(`✅ Updated ${count} FBS teams with currentSeason data.`);
}

updateFBSTeams().catch(console.error);
