/**
 * export-firestore.js
 *
 * Exports all Firestore collections to JSON files in /export/.
 * Run this BEFORE switching to Supabase to capture the full dataset.
 *
 * Usage:
 *   node scripts/export-firestore.js
 *
 * Requirements:
 *   - Firebase service account JSON at ./serviceAccount.json
 *     (download from Firebase console > Project Settings > Service accounts)
 *   - npm install firebase-admin
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
const serviceAccount = require('./serviceAccount.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
const OUT_DIR = path.join(__dirname, '..', 'export');

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

function write(filename, data) {
  const filePath = path.join(OUT_DIR, filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  console.log(`  ✓ ${filename} (${Array.isArray(data) ? data.length : Object.keys(data).length} records)`);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function exportCollection(collectionPath) {
  const snap = await db.collection(collectionPath).get();
  return snap.docs.map((doc) => ({ _id: doc.id, ...doc.data() }));
}

async function exportLeagueSubcollection(leagueId, sub) {
  const snap = await db.collection(`leagues/${leagueId}/${sub}`).get();
  return snap.docs.map((doc) => ({ _id: doc.id, ...doc.data() }));
}

// ---------------------------------------------------------------------------
// Export: users
// ---------------------------------------------------------------------------
async function exportUsers() {
  console.log('\nExporting users...');
  const users = await exportCollection('users');
  write('users.json', users);
}

// ---------------------------------------------------------------------------
// Export: teams
// ---------------------------------------------------------------------------
async function exportTeams() {
  console.log('\nExporting teams...');
  const teams = await exportCollection('teams');
  write('teams.json', teams);
}

// ---------------------------------------------------------------------------
// Export: config
// ---------------------------------------------------------------------------
async function exportConfig() {
  console.log('\nExporting config...');
  const snap = await db.doc('config/season').get();
  write('config.json', [{ _id: 'season', ...snap.data() }]);
}

// ---------------------------------------------------------------------------
// Export: schedule (all years/weeks/games)
// ---------------------------------------------------------------------------
async function exportSchedule() {
  console.log('\nExporting schedule...');
  const games = [];

  const yearsSnap = await db.collection('schedule').get();
  for (const yearDoc of yearsSnap.docs) {
    const year = parseInt(yearDoc.id, 10);
    const weeksSnap = await db.collection(`schedule/${yearDoc.id}/weeks`).get();
    for (const weekDoc of weeksSnap.docs) {
      const week = weekDoc.id;
      const gamesSnap = await db.collection(`schedule/${yearDoc.id}/weeks/${weekDoc.id}/games`).get();
      for (const gameDoc of gamesSnap.docs) {
        games.push({ _id: gameDoc.id, year, week, ...gameDoc.data() });
      }
    }
  }

  write('games.json', games);
}

// ---------------------------------------------------------------------------
// Export: leagues + all subcollections
// ---------------------------------------------------------------------------
async function exportLeagues() {
  console.log('\nExporting leagues...');
  const leaguesSnap = await db.collection('leagues').get();
  const leagues = [];
  const members = [];
  const drafts = [];
  const weeklyLineups = [];
  const weeklyStandings = [];
  const moveHistory = [];
  const playoffs = [];

  for (const leagueDoc of leaguesSnap.docs) {
    const leagueId = leagueDoc.id;
    leagues.push({ _id: leagueId, ...leagueDoc.data() });

    // members subcollection
    const membersSnap = await db.collection(`leagues/${leagueId}/members`).get();
    for (const m of membersSnap.docs) {
      members.push({ _id: m.id, leagueId, ...m.data() });
    }

    // meta/draft document
    const draftDoc = await db.doc(`leagues/${leagueId}/meta/draft`).get();
    if (draftDoc.exists) {
      drafts.push({ _id: leagueId, leagueId, ...draftDoc.data() });
    }

    // weeklyLineups subcollection (docs keyed by week)
    const wlSnap = await db.collection(`leagues/${leagueId}/weeklyLineups`).get();
    for (const wlDoc of wlSnap.docs) {
      weeklyLineups.push({ _id: wlDoc.id, leagueId, ...wlDoc.data() });
    }

    // weeklyStandings subcollection (docs keyed by userId)
    const wsSnap = await db.collection(`leagues/${leagueId}/weeklyStandings`).get();
    for (const wsDoc of wsSnap.docs) {
      weeklyStandings.push({ _id: wsDoc.id, leagueId, ...wsDoc.data() });
    }

    // moveHistory subcollection
    const mhSnap = await db.collection(`leagues/${leagueId}/moveHistory`).get();
    for (const mhDoc of mhSnap.docs) {
      moveHistory.push({ _id: mhDoc.id, leagueId, ...mhDoc.data() });
    }

    // playoffs subcollection (docs keyed by year e.g. "2025")
    const poSnap = await db.collection(`leagues/${leagueId}/playoffs`).get();
    for (const poDoc of poSnap.docs) {
      playoffs.push({ _id: poDoc.id, leagueId, ...poDoc.data() });
    }

    process.stdout.write(`  League ${leagueId} done\n`);
  }

  write('leagues.json', leagues);
  write('league_members.json', members);
  write('drafts.json', drafts);
  write('weekly_lineups.json', weeklyLineups);
  write('weekly_standings.json', weeklyStandings);
  write('move_history.json', moveHistory);
  write('playoffs.json', playoffs);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('=== Firestore Export ===');
  console.log(`Output directory: ${OUT_DIR}\n`);

  await exportUsers();
  await exportTeams();
  await exportConfig();
  await exportSchedule();
  await exportLeagues();

  console.log('\n=== Export complete ===');
}

main().catch((err) => {
  console.error('Export failed:', err);
  process.exit(1);
});
