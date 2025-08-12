// scripts/countUsers.js
const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

const KEY_PATH = process.env.SERVICE_ACCOUNT_PATH || path.join(__dirname, "serviceAccountKey.json");
const serviceAccount = JSON.parse(fs.readFileSync(KEY_PATH, "utf8"));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: serviceAccount.project_id,
});
const db = admin.firestore();

(async () => {
  try {
    const agg = await db.collection("users").count().get();
    console.log("users count:", agg.data().count);
  } catch (e) {
    // Fallback if your Admin SDK is too old for aggregation
    console.warn("Aggregation not available, falling back to scan:", e.message || e);
    const snap = await db.collection("users").select().get(); // no fields, cheap-ish scan
    console.log("users count (scan):", snap.size);
  }

  // Optional: also count members across all leagues
  if ((process.env.COUNT_MEMBERS || "false").toLowerCase() === "true") {
    try {
      const agg2 = await db.collectionGroup("members").count().get();
      console.log("members (collection group) count:", agg2.data().count);
    } catch (e) {
      console.warn("members count failed:", e.message || e);
    }
  }
  process.exit(0);
})();
