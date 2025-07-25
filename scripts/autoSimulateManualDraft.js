const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

const serviceAccountPath = path.resolve(__dirname, "serviceAccountKey.json");
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

const leagueId = process.argv[2];
if (!leagueId) {
  console.error("❌ Usage: node scripts/autoSimulateManualDraft.js <LEAGUE_ID>");
  process.exit(1);
}

function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

async function simulateDraft(leagueId) {
  const membersSnap = await db.collection("leagues").doc(leagueId).collection("members").get();
  const members = membersSnap.docs.map(doc => doc.id);

  const teamsSnap = await db.collection("teams").where("classification", "==", "FBS").get();
  const teamNames = teamsSnap.docs
    .map(doc => doc.data().school)
    .filter(Boolean);

  if (teamNames.length < members.length * 7) {
    throw new Error("❌ Not enough teams to assign 7 per manager.");
  }

  const draftOrder = shuffle(members);
  const availableTeams = shuffle(teamNames);
  const selectedTeams = {};
  let teamIndex = 0;

  for (const uid of draftOrder) {
    const picks = availableTeams.slice(teamIndex, teamIndex + 7);
    selectedTeams[uid] = picks;
    teamIndex += 7;

    const starters = picks.slice(0, 5);
    const bench = picks.slice(5, 7);

    // write all lineup fields
    await db.collection("leagues").doc(leagueId).collection("members").doc(uid).update({
      "lineup.drafted": picks,
      "lineup.currentRoster": picks,
      "lineup.starters": starters,
      "lineup.bench": bench
    });
  }

  // write full draft state
  const draftRef = db.collection("leagues").doc(leagueId).collection("meta").doc("draft");
  await draftRef.set({
    draftOrder,
    currentPickIndex: draftOrder.length * 7,
    availableTeams: availableTeams.slice(teamIndex), // the remaining undrafted teams
    selectedTeams,
    draftComplete: true
  });

  console.log(`🎉 Simulated manual-style draft for league ${leagueId}`);
}

simulateDraft(leagueId).catch((err) => {
  console.error("❌ Error simulating draft:", err);
  process.exit(1);
});
