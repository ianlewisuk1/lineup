const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

const serviceAccountPath = path.resolve(__dirname, "serviceAccountKey.json");
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function updateNextGameIsHomeFlag() {
  const teamsSnap = await db.collection("teams").get();
  const weeksSnap = await db
    .collection("schedule")
    .doc("2025")
    .collection("weeks")
    .get();

  // Gather all games across all weeks
  let allGames = [];
  for (const weekDoc of weeksSnap.docs) {
    const weekId = weekDoc.id;
    const gamesSnap = await db
      .collection("schedule")
      .doc("2025")
      .collection("weeks")
      .doc(weekId)
      .collection("games")
      .get();

    for (const gameDoc of gamesSnap.docs) {
      const game = gameDoc.data();
      game.id = gameDoc.id;
      game.week = weekId;
      allGames.push(game);
    }
  }

  const now = new Date();

  for (const teamDoc of teamsSnap.docs) {
    const team = teamDoc.data();
    const teamName = team.school;

    const upcoming = allGames
      .filter(
        (g) =>
          (g.homeTeam === teamName || g.awayTeam === teamName) &&
          g.gameComplete === false &&
          new Date(g.date) > now
      )
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    if (upcoming.length === 0) {
      await teamDoc.ref.update({
        "currentSeason.nextGameIsHome": null,
      });
      console.log(`🟡 No upcoming game found for ${teamName}`);
      continue;
    }

    const nextGame = upcoming[0];
    const isHome = nextGame.homeTeam === teamName;

    await teamDoc.ref.update({
      "currentSeason.nextGameIsHome": isHome,
    });

    console.log(`✅ ${teamName}: nextGameIsHome = ${isHome}`);
  }

  console.log("🎯 Done setting nextGameIsHome for all teams.");
}

updateNextGameIsHomeFlag();
