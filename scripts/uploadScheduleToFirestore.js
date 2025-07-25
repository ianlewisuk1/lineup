const admin = require("firebase-admin");
const fetch = require("node-fetch");
const fs = require("fs");

const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

const API_KEY = "CAv+hzLPB+Egn4elkCCtU4ZiimKrvdOKf81Q1YUJreEQ/+vwyx4QkNYocrVotFip"; // Your CollegeFootballData.com API key

async function fetchSchedule() {
  const url = "https://api.collegefootballdata.com/games?year=2025&seasonType=regular&classification=fbs";

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });

  const games = await response.json();
  return games;
}

async function uploadToFirestore() {
  const games = await fetchSchedule();

  const groupedByWeek = {};

  games.forEach(game => {
    const week = game.week || 0;
    if (!groupedByWeek[week]) groupedByWeek[week] = [];

    groupedByWeek[week].push({
      date: game.startDate?.split("T")[0] ?? null, // ✅ fixed here
      homeTeam: game.home_team || game.homeTeam || null,
      awayTeam: game.away_team || game.awayTeam || null,
      venue: game.venue || null,
      neutralSite: game.neutral_site || false,
      conferenceGame: game.conference_game || false,
      homePoints: game.home_points ?? null,
      awayPoints: game.away_points ?? null,
    });
  });

  for (const week in groupedByWeek) {
    const weekRef = db.collection("schedule").doc("2025").collection("weeks").doc(week);
    await weekRef.set({ week: parseInt(week), updatedAt: new Date() });

    const gamesRef = weekRef.collection("games");
    const batch = db.batch();

    let added = 0;
    let skipped = 0;

    groupedByWeek[week].forEach((game, index) => {
      if (!game.homeTeam || !game.awayTeam) {
        skipped++;
        return;
      }

      const docRef = gamesRef.doc(String(index));
      batch.set(docRef, game); // overwrites existing if already there
      added++;
    });

    if (added > 0) {
      await batch.commit();
      console.log(`✅ Week ${week}: added ${added}, skipped ${skipped}`);
    } else {
      console.log(`⚠️  Week ${week}: no valid games to upload (skipped ${skipped})`);
    }
  }

  console.log("🎉 All valid games uploaded.");
}

uploadToFirestore().catch(console.error);
