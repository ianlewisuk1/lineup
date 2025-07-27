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

// 🛡 List of admin emails or UIDs to protect
const ADMIN_EMAILS = ["lewisian8787@gmail.com"];
const ADMIN_UIDS = ["pAC8AShZgsaL1x66SnlL7RN3jtC2"];

// Delete all Firebase Auth users EXCEPT admin
async function deleteAllUsers(nextPageToken) {
  const listUsersResult = await auth.listUsers(1000, nextPageToken);
  const deletions = listUsersResult.users.map((userRecord) => {
    const { uid, email } = userRecord;
    if (ADMIN_EMAILS.includes(email) || ADMIN_UIDS.includes(uid)) {
      console.log(`🛑 Skipping admin Auth user: ${email}`);
      return null;
    }

    console.log(`Deleting Auth user: ${email}`);
    return auth.deleteUser(uid);
  });

  await Promise.all(deletions.filter(Boolean));

  if (listUsersResult.pageToken) {
    return deleteAllUsers(listUsersResult.pageToken);
  }
}

// Delete all Firestore user documents EXCEPT admin
async function deleteAllUserDocs() {
  const usersSnapshot = await db.collection("users").get();
  const deletions = usersSnapshot.docs.map((doc) => {
    const data = doc.data();
    const uid = doc.id;
    const email = data.email;

    if (ADMIN_EMAILS.includes(email) || ADMIN_UIDS.includes(uid)) {
      console.log(`🛑 Skipping admin Firestore doc: ${email || uid}`);
      return null;
    }

    console.log(`Deleting Firestore user doc: ${uid}`);
    return db.collection("users").doc(uid).delete();
  });

  await Promise.all(deletions.filter(Boolean));
}

// Recursively delete all subcollections for a league
async function deleteSubcollections(docPath) {
  const collections = await db.collection(docPath).listCollections();
  for (const sub of collections) {
    const subSnap = await sub.get();
    const deletions = subSnap.docs.map((doc) => {
      console.log(`   Deleting ${doc.ref.path}`);
      return doc.ref.delete();
    });
    await Promise.all(deletions);
  }
}

// Delete all leagues and their subcollections
async function deleteAllLeaguesWithSubcollections() {
  const leaguesSnapshot = await db.collection("leagues").get();

  for (const doc of leaguesSnapshot.docs) {
    const leagueId = doc.id;
    console.log(`Deleting league: ${leagueId}`);

    await deleteSubcollections(`leagues/${leagueId}`);
    await db.collection("leagues").doc(leagueId).delete();
  }
}

async function run() {
  try {
    console.log("Deleting all Firebase Auth users...");
    await deleteAllUsers();
    console.log("✅ All Auth users deleted (admin protected).");

    console.log("Deleting all Firestore user docs...");
    await deleteAllUserDocs();
    console.log("✅ All Firestore user documents deleted (admin protected).");

    console.log("Deleting all leagues and subcollections...");
    await deleteAllLeaguesWithSubcollections();
    console.log("✅ All leagues and subcollections deleted.");

    process.exit(0);
  } catch (err) {
    console.error("❌ Error during deletion process:", err);
    process.exit(1);
  }
}

run();
