const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");
const Papa = require("papaparse");

const serviceAccount = require("./serviceAccountKey.json"); // 🔐 Replace with your key if different

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

// Load CSV
const csvFilePath = path.resolve(__dirname, "teams.csv");
const csvContent = fs.readFileSync(csvFilePath, "utf8");
const parsed = Papa.parse(csvContent, { header: true });

const teamsToFix = ["michigan", "texas"];

async function fixTeams() {
  const teamsCollection = db.collection("teams");

  // 🔁 Delete incorrect docs
  const allDocs = await teamsCollection.get();
  for (let doc of allDocs.docs) {
    const school = doc.data().school?.toLowerCase()?.replace(/\s+/g, "-");
    if (teamsToFix.includes(school)) {
      console.log(`❌ Deleting bad doc: ${doc.id} (${doc.data().school})`);
      await doc.ref.delete();
    }
  }

  // ✅ Add correct ones from CSV
  for (let row of parsed.data) {
    const rawSchool = row.school?.toLowerCase()?.replace(/\s+/g, "-");
    if (!teamsToFix.includes(rawSchool)) continue;

    const docId = rawSchool;

    const teamData = {
      id: docId,
      school: row.school,
      mascot: row.mascot,
      abbreviation: row.abbreviation,
      alternateNames1: row.alternateNames1,
      alternateNames2: row.alternateNames2,
      conference: row.conference,
      division: row.division,
      classification: row.classification,
      color: row.color,
      alternateColor: row.alternateColor,
      logos1: row.logos1,
      logos2: row.logos2,
      twitter: row.twitter,
      stadiumName: row.stadiumName,
      city: row.city,
      state: row.state,
      draftable: row.draftable === "true",
      prevYearRecord: row.prevYearRecord,
      prevYearAts: row.prevYearAts,
      predictedWins: parseFloat(row.predictedWins || 0),
      confOdds: parseFloat(row.confOdds || 0),
      retStarters: parseInt(row.retStarters || 0),
      sosRank: parseInt(row.sosRank || 0),
      powerRank: parseInt(row.powerRank || 0),
      prevYearPoints: parseFloat(row.prevYearPoints || 0),
      philMetrics: parseInt(row.philMetrics || 0),
      philMetricDraftRank: parseInt(row.philMetricDraftRank || 0)
    };

    await db.collection("teams").doc(docId).set(teamData);
    console.log(`✅ Fixed: ${row.school} → ${docId}`);
  }

  console.log("🎯 Done.");
}

fixTeams();
