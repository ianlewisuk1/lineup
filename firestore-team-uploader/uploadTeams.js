const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");
const admin = require("firebase-admin");

// 🔐 Load your Firebase service account key
const serviceAccount = require("./serviceAccountKey.json");

// 🚀 Initialize Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

const results = [];
fs.createReadStream(path.resolve(__dirname, "teams.csv"))
  .pipe(csv())
  .on("data", (data) => results.push(data))
  .on("end", async () => {
    for (let team of results) {
      try {
        const id = team.school
          .toLowerCase()
          .replace(/[^a-z0-9]/gi, "-")
          .replace(/-+/g, "-")
          .replace(/(^-|-$)/g, "");

        const draftable = team.draftable?.toLowerCase?.() === "true";
        const classification = draftable ? "FBS" : "FCS";

        const docData = {
          ...team,
          draftable,
          classification,
        };

        await db.collection("teams").doc(id).set(docData);
        console.log(`✅ Uploaded ${team.school}`);
      } catch (err) {
        console.error(`❌ Error uploading ${team.school}:`, err);
      }
    }

    console.log("🚀 Upload complete!");
  });
