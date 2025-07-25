const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");
const Papa = require("papaparse");

const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
const csvPath = path.join(__dirname, "teams_update.csv");

const updateTeamsFromCSV = async () => {
  const csvFile = fs.readFileSync(csvPath, "utf8");
  const { data, errors } = Papa.parse(csvFile, {
    header: true,
    skipEmptyLines: true,
  });

  if (errors.length) {
    console.error("CSV Parse errors:", errors);
    return;
  }

  let updated = 0;
  let created = 0;

  for (const row of data) {
    const school = row.school?.trim();
    if (!school) continue;

    try {
      const teamsRef = db.collection("teams");
      const querySnapshot = await teamsRef.where("school", "==", school).get();

      const docData = {
        school: row.school || "",
        mascot: row.mascot || "",
        abbreviation: row.abbreviation || "",
        alternateNames1: row.alternateNames1 || "",
        alternateNames2: row.alternateNames2 || "",
        conference: row.conference || "",
        division: row.division || "",
        classification: row.classification || "FBS",
        color: row.color || "",
        alternateColor: row.alternateColor || "",
        logos1: row.logos1 || "",
        logos2: row.logos2 || "",
        twitter: row.twitter || "",
        stadiumName: row.stadiumName || "",
        city: row.city || "",
        state: row.state || "",
        draftable: row.draftable === "TRUE" || false,
        prevYearRecord: row.prevYearRecord || "",
        prevYearAts: row.prevYearAts || "",
        predictedWins: parseFloat(row.predictedWins) || null,
        confOdds: parseFloat(row.confOdds) || null,
        retStarters: parseInt(row.retStarters) || null,
        sosRank: parseInt(row.sosRank) || null,
        powerRank: parseInt(row.powerRank) || null,
        prevYearPoints: parseInt(row.prevYearPoints) || null,
        philMetrics: parseInt(row.philMetrics) || null,
        philMetricDraftRank: parseInt(row.philMetricDraftRank) || null,
      };

      if (!querySnapshot.empty) {
        // Update existing doc
        const docRef = querySnapshot.docs[0].ref;
        await docRef.set(docData, { merge: true });
        console.log(`🔄 Updated ${school}`);
        updated++;
      } else {
        // Create new doc
        await db.collection("teams").add(docData);
        console.log(`🆕 Created ${school}`);
        created++;
      }
    } catch (err) {
      console.error(`❌ Error for ${school}:`, err.message);
    }
  }

  console.log(`\n✅ Done. ${updated} updated, ${created} created.`);
};

updateTeamsFromCSV();
