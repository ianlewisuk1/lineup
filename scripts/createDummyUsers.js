// scripts/createDummyUsers.js
const admin = require("firebase-admin");
const { v4: uuidv4 } = require("uuid");
const args = require("minimist")(process.argv.slice(2));

const fs = require("fs");
const path = require("path");
const serviceAccountPath = path.resolve(__dirname, "serviceAccountKey.json");
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

const createDummyLeagueWithUsers = async (count) => {
  if (![8, 10, 12].includes(count)) {
    console.error("❌ Only 8, 10, or 12 managers allowed.");
    process.exit(1);
  }

  const leagueId = uuidv4();
  const adminUid = `user1`;
  const leagueDocRef = db.collection("leagues").doc(leagueId);

  // Create the league doc
  await leagueDocRef.set({
    name: `Test League (${count})`,
    scoringType: "head_to_head",
    members: Array.from({ length: count }, (_, i) => `user${i + 1}`),
    createdAt: new Date(),
    createdBy: adminUid,
    admin: adminUid,
    maxManagers: count
  });

    // Create dummy users and add them to Firestore and league's subcollection
  for (let i = 1; i <= count; i++) {
    const uid = `user${i}`;
    const email = `user${i}@users.com`;

    // ✅ Create actual Firebase Auth user
    await admin.auth().createUser({
      uid,
      email,
      password: "test123", // set a default password
      displayName: `User${i}`,
    });

    // Create Firestore user doc
    await db.collection("users").doc(uid).set({
      email,
      firstName: `User`,
      lastName: `${i}`,
      dob: "2000-01-01",
      leagueIds: [leagueId],
    });

    // Add to league's members subcollection
    await db
      .collection("leagues")
      .doc(leagueId)
      .collection("members")
      .doc(uid)
      .set({
        email,
        displayName: `User${i}`,
        teamName: `Team ${i}`,
        lineup: {
          starters: [],
          bench: [],
          drafted: [],
        },
        joinedAt: new Date(),
      });
  }


  console.log(`✅ League created with ${count} dummy users. League ID: ${leagueId}`);
};

const count = parseInt(args.count || args.c, 10);
if (!count) {
  console.error("❌ Please provide a user count via --count=8|10|12");
  process.exit(1);
}

createDummyLeagueWithUsers(count).catch(console.error);
