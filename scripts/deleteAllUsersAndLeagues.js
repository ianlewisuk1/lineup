const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

const serviceAccountPath = path.resolve(__dirname, "serviceAccountKey.json");
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const auth = admin.auth();
const db = admin.firestore();

// Delete all Firebase Auth users
async function deleteAllUsers(nextPageToken) {
  const listUsersResult = await auth.listUsers(1000, nextPageToken);
  const deletions = listUsersResult.users.map((userRecord) => {
    console.log(`Deleting Auth user: ${userRecord.email}`);
    return auth.deleteUser(userRecord.uid);
  });

  await Promise.all(deletions);

  if (listUsersResult.pageToken) {
    return deleteAllUsers(listUsersResult.pageToken);
  }
}

// Delete all Firestore user documents
async function deleteAllUserDocs() {
  const usersSnapshot = await db.collection("users").get();
  const deletions = usersSnapshot.docs.map((doc) => {
    console.log(`Deleting Firestore user doc: ${doc.id}`);
    return db.collection("users").doc(doc.id).delete();
  });

  await Promise.all(deletions);
}

// Delete all leagues
async function deleteAllLeagues() {
  const leaguesSnapshot = await db.collection("leagues").get();
  const deletions = leaguesSnapshot.docs.map(async (doc) => {
    console.log(`Deleting league: ${doc.id}`);
    return db.collection("leagues").doc(doc.id).delete();
  });

  await Promise.all(deletions);
}

async function run() {
  try {
    console.log("Deleting all Firebase Auth users...");
    await deleteAllUsers();
    console.log("✅ All Auth users deleted.");

    console.log("Deleting all Firestore user docs...");
    await deleteAllUserDocs();
    console.log("✅ All Firestore user documents deleted.");

    console.log("Deleting all leagues from Firestore...");
    await deleteAllLeagues();
    console.log("✅ All leagues deleted.");

    process.exit(0);
  } catch (err) {
    console.error("❌ Error deleting users or leagues:", err);
    process.exit(1);
  }
}

run();
