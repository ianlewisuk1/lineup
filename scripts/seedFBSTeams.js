// scripts/seedFBSTeams.js
const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

const serviceAccountPath = path.resolve(__dirname, "serviceAccountKey.json");
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

const fbsTeams = [
  {
    school: "Alabama",
    conference: "SEC",
    classification: "FBS",
    currentSeason: {
      record: "10-2",
      confRecord: "6-2",
      ats: "8-4",
      avgPointsFor: 35.2,
      avgPointsAgainst: 21.1,
      nextOpponent: "Georgia",
      nextOpponentSpread: "-3.5",
      gamePoints: 88,
      sosRank: 3,
      philMetrics: 92
    }
  },
  {
    school: "Michigan",
    conference: "Big Ten",
    classification: "FBS",
    currentSeason: {
      record: "12-0",
      confRecord: "9-0",
      ats: "9-3",
      avgPointsFor: 38.5,
      avgPointsAgainst: 17.8,
      nextOpponent: "Iowa",
      nextOpponentSpread: "-10.5",
      gamePoints: 104,
      sosRank: 6,
      philMetrics: 96
    }
  },
  {
    school: "Texas",
    conference: "Big 12",
    classification: "FBS",
    currentSeason: {
      record: "11-1",
      confRecord: "8-1",
      ats: "7-5",
      avgPointsFor: 37.9,
      avgPointsAgainst: 22.4,
      nextOpponent: "Oklahoma State",
      nextOpponentSpread: "-7.0",
      gamePoints: 97,
      sosRank: 8,
      philMetrics: 89
    }
  }
];

const seed = async () => {
  for (const team of fbsTeams) {
    const ref = db.collection("teams").doc(); // generates random ID
    await ref.set(team);
    console.log(`✅ Added ${team.school}`);
  }
  process.exit(0);
};

seed();
