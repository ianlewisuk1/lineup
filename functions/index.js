// functions/index.js

/**
 * v2 Cloud Functions (HTTP + Scheduler) with a Secret for the CFBD key.
 * We keep v1 only for the callable (deleteAuthUser).
 * Node 20 runtime has global fetch.
 */

const functions = require('firebase-functions'); // v1 (for callables + HttpsError)
const admin = require('firebase-admin');

const { setGlobalOptions } = require('firebase-functions/v2');
const { onRequest } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { defineSecret } = require('firebase-functions/params');

// Declare the secret once
const CFB_KEY = defineSecret('CFB_KEY');

// Apply ONE global options call (add any other defaults here)
setGlobalOptions({
  region: 'us-central1',
  secrets: [CFB_KEY],
  timeoutSeconds: 120,
  memory: '256MiB',
});

try { admin.initializeApp(); } catch (_) {}

/* -------------------------------------------------------------------------- */
/*                               Helper utilities                             */
/* -------------------------------------------------------------------------- */

const CFBD_API_BASE = 'https://api.collegefootballdata.com';

/** Slug + aliases so Firestore team doc ids are consistent. */
const TEAM_ALIASES = {
  "hawai'i": 'hawaii',
  "hawaii": 'hawaii',
  "miami-oh": 'miami-ohio',
  "miami (oh)": 'miami-ohio',
  "utsa": 'texas-san-antonio',
  "ucf": 'central-florida',
  "umass": 'massachusetts',
  "ole-miss": 'mississippi',
  "smu": 'southern-methodist',

  // Texas A&M variations -> your doc id
  "texas-a-and-m": "texas-a-m",
  "texas-am": "texas-a-m",
};

function slugify(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[''`]/g, '')    // drop apostrophes/curly quotes
    .replace(/&/g, '')        // drop ampersand -> "texas-am"
    .replace(/[^a-z0-9]+/g, '-')  // non-alnum to dashes
    .replace(/^-+|-+$/g, '');
}
const slugTeam = (name) => TEAM_ALIASES[slugify(name)] || slugify(name);

/** Firestore batch helper that auto-flushes before hitting limits. */
class BatchWriter {
  constructor(db, maxPerBatch = 450) {
    this.db = db;
    this.max = maxPerBatch;
    this.batch = db.batch();
    this.count = 0;
    this.totalWrites = 0;
  }
  set(ref, data, opts) { this.batch.set(ref, data, opts); this.count++; this.totalWrites++; return this._maybeFlush(); }
  update(ref, data) { this.batch.update(ref, data); this.count++; this.totalWrites++; return this._maybeFlush(); }
  async _maybeFlush() {
    if (this.count >= this.max) {
      await this.batch.commit();
      this.batch = this.db.batch();
      this.count = 0;
    }
  }
  async commit() {
    if (this.count > 0) { await this.batch.commit(); this.count = 0; }
    return this.totalWrites;
  }
}

/* -------------------------------------------------------------------------- */
/*                           Callable: deleteAuthUser                          */
/* -------------------------------------------------------------------------- */

exports.deleteAuthUser = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');

  const callerUid = context.auth.uid;
  const userDoc = await admin.firestore().collection('users').doc(callerUid).get();
  if (!userDoc.exists || !userDoc.data().isAdmin) {
    throw new functions.https.HttpsError('permission-denied', 'Only admins can delete users.');
  }

  const { uid } = data || {};
  if (!uid) throw new functions.https.HttpsError('invalid-argument', 'UID is required.');

  try {
    await admin.auth().deleteUser(uid);
    return { success: true, message: `User ${uid} deleted successfully from Authentication` };
  } catch (error) {
    if (error.code === 'auth/user-not-found') {
      return { success: true, message: `User ${uid} was not found in Authentication (may have been deleted already)` };
    }
    throw new functions.https.HttpsError('internal', `Failed to delete user: ${error.message}`);
  }
});

/* -------------------------------------------------------------------------- */
/*                      CFB Lines -> Firestore Ingestor core                   */
/* -------------------------------------------------------------------------- */

/** CFBD spread is from the HOME team's perspective. */
function normalizeLine(game, providerLine) {
  const s = providerLine?.spread;
  let favorite = null, favIsHome = null;

  if (typeof s === 'number' && !Number.isNaN(s)) {
    if (s < 0) { favorite = game.homeTeam; favIsHome = true; }
    else if (s > 0) { favorite = game.awayTeam; favIsHome = false; }
    else { favorite = 'PICK'; favIsHome = null; }
  }

  const formatSpread = (spread) => {
    if (typeof spread !== 'number' || Number.isNaN(spread)) return null;
    if (spread === 0) return 'PICK';
    return spread > 0 ? `+${spread}` : String(spread);
  };

  return {
    provider: providerLine?.provider ?? 'unknown',
    spread: (typeof s === 'number') ? s : null,   // home perspective
    overUnder: providerLine?.overUnder ?? null,
    homeMoneyline: providerLine?.homeMoneyline ?? null,
    awayMoneyline: providerLine?.awayMoneyline ?? null,
    favorite, favIsHome,
    formattedSpread: formatSpread(s), // Use our formatting function
    updated: providerLine?.updated ?? null,
  };
}

async function patchTeamsForGameIfExists(bw, db, game, linesByProvider) {
  const line =
    linesByProvider['consensus'] ||
    Object.values(linesByProvider).find(Boolean) || null;
  if (!line) return;

  // CHANGE: Keep full timestamp instead of just date
  // const dateOnly = (game.startDate || '').slice(0, 10) || null;  // OLD - removes time
  const gameDateTime = game.startDate || null;  // NEW - preserves full timestamp

  const patchOne = async (teamName, isHome, oppName) => {
    if (!teamName) return;

    const slug = slugTeam(teamName);
    const ref = db.collection('teams').doc(slug);
    const snap = await ref.get();

    if (!snap.exists) {
      try {
        await db.collection('cfb').doc('misses').collection('teams').add({
          raw: teamName,
          slugTried: slug,
          role: isHome ? 'home' : 'away',
          game: {
            homeTeam: game.homeTeam || null,
            awayTeam: game.awayTeam || null,
            startDate: game.startDate || null
          },
          when: admin.firestore.FieldValue.serverTimestamp(),
        });
      } catch (e) {
        console.warn('[patchTeamsForGameIfExists] miss log failed', teamName, e);
      }
      return; // update-only: skip creating new docs
    }

    // Keep numeric (home-perspective from CFBD; flip for away)
    const spreadNum = (typeof line.spread === 'number')
      ? (isHome ? line.spread : -line.spread)
      : null;

    // Human-friendly display string: "+X" for underdog, "-X" for favorite, "PICK" for 0
    let spreadDisplay = null;
    if (typeof spreadNum === 'number') {
      if (spreadNum === 0) {
        spreadDisplay = 'PICK';
      } else if (spreadNum > 0) {
        spreadDisplay = `+${spreadNum}`;
      } else {
        spreadDisplay = String(spreadNum);
      }
    }

    bw.set(ref, {
      currentSeason: {
        nextOpponent: oppName ?? null,
        nextGameDate: gameDateTime,  // CHANGED: Now preserves full timestamp
        nextGameIsHome: !!isHome,
        nextOpponentSpread: spreadNum,                 // number (safe for math)
        nextOpponentSpreadDisplay: spreadDisplay,      // string (for UI)
        nextOverUnder: (typeof line.overUnder === 'number') ? line.overUnder : null,
        nextOpponentProvider: line.provider ?? null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }
    }, { merge: true });
  };

  await patchOne(game.homeTeam, true, game.awayTeam);
  await patchOne(game.awayTeam, false, game.homeTeam);
}

/** Update schedule for existing games (using team matchup like teams function) */
async function patchScheduleForGameIfExists(bw, db, game, year, week) {
  if (!game.startDate || !game.homeTeam || !game.awayTeam) return;

  try {
    // Find existing game by team matchup (same strategy as teams function)
    const existingGamesSnap = await db
      .collection('schedule').doc(String(year))
      .collection('weeks').doc(String(week))
      .collection('games')
      .where('homeTeam', '==', game.homeTeam)
      .where('awayTeam', '==', game.awayTeam)
      .get();

    if (!existingGamesSnap.empty) {
      // Update existing document (like teams function)
      const existingDoc = existingGamesSnap.docs[0];
      console.log(`Updating existing schedule game: ${game.homeTeam} vs ${game.awayTeam}`);
      
      bw.update(existingDoc.ref, {
        date: game.startDate,  // Add full timestamp
        cfbdGameId: String(game.id || ''),  // Store CFBD ID for reference
        venue: game.venue ?? null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      
      return true; // Successfully updated existing game
    } else {
      console.log(`No existing game found for: ${game.homeTeam} vs ${game.awayTeam}`);
      return false; // No existing game found
    }
  } catch (error) {
    console.error(`Error updating schedule for ${game.homeTeam} vs ${game.awayTeam}:`, error);
    return false;
  }
}

/** Core ingestion routine (shared by HTTP + Scheduler). */
async function ingestLines({ year, week, seasonType = 'regular', book = 'consensus', updateTeams = true, updateSchedule = true, key }) {
  const KEY = (key || '').trim();
  if (!KEY) throw new Error('Missing CFB key');

  const url = `${CFBD_API_BASE}/lines?year=${year}&week=${week}&seasonType=${seasonType}&book=${encodeURIComponent(book)}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${KEY}` } });
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    throw new Error(`CFB API error ${r.status}: ${text}`);
  }

  const games = await r.json();
  const db = admin.firestore();
  const bw = new BatchWriter(db);

  // Point to the *document* /cfb/lines/{year}/weeks/{week}/{book}
  const bookDoc = db
    .collection('cfb').doc('lines')
    .collection(String(year)).doc('weeks')
    .collection(String(week)).doc(book);

  let wrote = 0;
  let scheduleUpdated = 0;

  for (const g of games) {
    const gameId = g.id
      ? String(g.id)
      : `${(g.startDate || '').slice(0, 10)}_${(g.awayTeam || 'AWAY').replace(/\s+/g, '-')}_at_${(g.homeTeam || 'HOME').replace(/\s+/g, '-')}`.toLowerCase();

    // Lines collection update (existing code)
    const docRef = bookDoc.collection('games').doc(gameId);

    const linesByProvider = {};
    for (const pl of (g.lines || [])) {
      const norm = normalizeLine(g, pl);
      linesByProvider[norm.provider] = norm;
    }

    bw.set(docRef, {
      gameId,
      season: g.season ?? year,
      seasonType: g.seasonType ?? seasonType,
      week, book,
      homeTeam: g.homeTeam ?? null,
      awayTeam: g.awayTeam ?? null,
      startDate: g.startDate ?? null,
      consensus: linesByProvider['consensus'] || null,
      linesByProvider,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    // NEW: Update existing schedule games with proper kickoff times (using teams strategy)
    if (updateSchedule) {
      const updated = await patchScheduleForGameIfExists(bw, db, g, year, week);
      if (updated) {
        scheduleUpdated++;
      }
    }

    if (updateTeams) {
      await patchTeamsForGameIfExists(bw, db, g, linesByProvider);
    }

    wrote++;
  }

  await bw.commit();
  return { 
    year, 
    week, 
    book, 
    wrote, 
    scheduleUpdated, 
    games: games.length 
  };
}

/* -------------------------------------------------------------------------- */
/*                             HTTP: manual ingest                             */
/* -------------------------------------------------------------------------- */

exports.cfbIngestLines = onRequest(async (req, res) => {
  try {
    const key = CFB_KEY.value();
    const year = Number(req.query.year) || 2025;
    const week = Number(req.query.week) || 1;
    const seasonType = String(req.query.seasonType || 'regular');
    const book = String(req.query.book || 'consensus');
    const updateSchedule = req.query.updateSchedule !== 'false'; // Default true

    const result = await ingestLines({ 
      year, 
      week, 
      seasonType, 
      book, 
      updateTeams: true, 
      updateSchedule,
      key 
    });
    return res.json(result);
  } catch (e) {
    console.error('cfbIngestLines error:', e);
    return res.status(500).send(String(e?.message || e));
  }
});

/* -------------------------------------------------------------------------- */
/*                        Scheduler: daily automatic ingest                    */
/* -------------------------------------------------------------------------- */

exports.cfbIngestLinesScheduled = onSchedule(
  { schedule: '10 7,19 * * *', timeZone: 'America/New_York' },
  async () => {
    try {
      const key = CFB_KEY.value();

      // TODO: make these dynamic if you store current year/week in Firestore
      const year = 2025;
      const week = 1;
      const seasonType = 'regular';
      const book = 'consensus';

      const result = await ingestLines({ 
        year, 
        week, 
        seasonType, 
        book, 
        updateTeams: true, 
        updateSchedule: true,  // Enable schedule syncing
        key 
      });
      console.log('Scheduled ingest result:', result);
      return null;
    } catch (e) {
      console.error('cfbIngestLinesScheduled error:', e);
      return null;
    }
  }
);

/* -------------------------------------------------------------------------- */
/*                    Auto-Migration: Member Lineups to Weekly                */
/* -------------------------------------------------------------------------- */

/**
 * Scheduled function to auto-migrate member lineups to weekly collection
 * when week lock times are reached
 */
exports.autoMigrateLineups = onSchedule(
  { schedule: '*/30 * * * *', timeZone: 'America/New_York' }, // Every 30 minutes
  async () => {
    try {
      console.log('🔄 Starting auto-migration check...');
      
      const db = admin.firestore();
      const now = new Date();
      
      // Get current season info
      const seasonRef = db.collection('config').doc('season');
      const seasonSnap = await seasonRef.get();
      const seasonData = seasonSnap.data();
      
      if (!seasonData) {
        console.log('❌ No season data found');
        return;
      }
      
      // Parse current week
      const currentWeekString = seasonData.currentWeek || "Week 1";
      const currentWeekMatch = currentWeekString.match(/\d+/);
      const currentWeekNum = currentWeekMatch ? parseInt(currentWeekMatch[0]) : 1;
      
      console.log(`📅 Current week: ${currentWeekNum}`);
      
      // Check weeks for lock times (current week and any that might have been missed)
      const weeksToCheck = [];
      for (let week = Math.max(1, currentWeekNum - 1); week <= currentWeekNum; week++) {
        weeksToCheck.push(week);
      }
      
      for (const week of weeksToCheck) {
        console.log(`🔍 Checking week ${week} for migration...`);
        
        // Get lock time for this week
        const lockTime = await getWeekLockTime(week);
        
        if (!lockTime) {
          console.log(`⏭️ Week ${week}: No lock time found, skipping`);
          continue;
        }
        
        if (now < lockTime) {
          console.log(`⏰ Week ${week}: Lock time not reached yet (${lockTime.toISOString()})`);
          continue;
        }
        
        console.log(`🔒 Week ${week}: Lock time passed, checking for migrations needed`);
        
        // Get all leagues
        const leaguesSnap = await db.collection('leagues').get();
        
        for (const leagueDoc of leaguesSnap.docs) {
          const leagueId = leagueDoc.id;
          await migrateLeagueWeek(db, leagueId, week, lockTime);
        }
      }
      
      console.log('✅ Auto-migration check completed');
      
    } catch (error) {
      console.error('❌ Auto-migration failed:', error);
    }
  }
);

/**
 * Manual trigger for testing migration (HTTP endpoint)
 */
exports.triggerLineupMigration = onRequest(async (req, res) => {
  try {
    const week = parseInt(req.query.week) || null;
    const leagueId = req.query.leagueId || null;
    
    if (!week) {
      return res.status(400).json({ error: 'Week parameter required' });
    }
    
    console.log(`🔧 Manual migration trigger: Week ${week}, League: ${leagueId || 'all'}`);
    
    const db = admin.firestore();
    const lockTime = await getWeekLockTime(week);
    
    if (!lockTime) {
      return res.status(400).json({ error: `No lock time found for week ${week}` });
    }
    
    if (leagueId) {
      // Migrate specific league
      await migrateLeagueWeek(db, leagueId, week, lockTime);
      res.json({ success: true, message: `Migrated league ${leagueId}, week ${week}` });
    } else {
      // Migrate all leagues
      const leaguesSnap = await db.collection('leagues').get();
      
      for (const leagueDoc of leaguesSnap.docs) {
        await migrateLeagueWeek(db, leagueDoc.id, week, lockTime);
      }
      
      res.json({ success: true, message: `Migrated all leagues, week ${week}` });
    }
    
  } catch (error) {
    console.error('❌ Manual migration failed:', error);
    res.status(500).json({ error: error.message });
  }
});

/* -------------------------------------------------------------------------- */
/*                     Auto-Migration Helper Functions                         */
/* -------------------------------------------------------------------------- */

/**
 * Get lock time for a specific week
 */
async function getWeekLockTime(weekNum) {
  try {
    const db = admin.firestore();
    const gamesSnap = await db
      .collection('schedule').doc('2025')
      .collection('weeks').doc(weekNum.toString())
      .collection('games')
      .get();
    
    let firstGameTime = null;
    
    gamesSnap.forEach(gameDoc => {
      const gameData = gameDoc.data();
      if (gameData.date) {
        const gameTime = new Date(gameData.date);
        if (!firstGameTime || gameTime < firstGameTime) {
          firstGameTime = gameTime;
        }
      }
    });
    
    if (firstGameTime) {
      // Return 1 hour before first game
      return new Date(firstGameTime.getTime() - (60 * 60 * 1000));
    }
    
    return null;
  } catch (error) {
    console.error(`Error getting lock time for week ${weekNum}:`, error);
    return null;
  }
}

/**
 * Migrate all members in a league for a specific week
 */
async function migrateLeagueWeek(db, leagueId, week, lockTime) {
  try {
    console.log(`📋 Migrating league ${leagueId}, week ${week}`);
    
    // Get all members in this league
    const membersSnap = await db
      .collection('leagues').doc(leagueId)
      .collection('members')
      .get();
    
    let migratedCount = 0;
    const batch = db.batch();
    
    for (const memberDoc of membersSnap.docs) {
      const userId = memberDoc.id;
      const memberData = memberDoc.data();
      
      // Check if this week already exists in weeklyLineups
      const weeklyLineupsRef = db
        .collection('leagues').doc(leagueId)
        .collection('weeklyLineups').doc(userId);
      
      const weeklyLineupsSnap = await weeklyLineupsRef.get();
      const existingWeeklyData = weeklyLineupsSnap.exists() ? weeklyLineupsSnap.data() : {};
      
      const weekKey = `week${week}`;
      
      // Skip if this week already migrated
      if (existingWeeklyData[weekKey] && existingWeeklyData[weekKey].lockedAt) {
        console.log(`⏭️ User ${userId} week ${week} already migrated`);
        continue;
      }
      
      // Get lineup from member document
      const currentLineup = memberData.lineup || {
        starters: Array(5).fill(null),
        bench: Array(2).fill(null)
      };
      
      // Prepare weekly lineup data
      const weeklyLineupData = {
        starters: currentLineup.starters || Array(5).fill(null),
        bench: currentLineup.bench || Array(2).fill(null),
        lockedAt: lockTime.toISOString(),
        migratedAt: admin.firestore.FieldValue.serverTimestamp()
      };
      
      // Add to batch
      batch.set(weeklyLineupsRef, {
        ...existingWeeklyData,
        [weekKey]: weeklyLineupData
      });
      
      migratedCount++;
      console.log(`📦 Queued migration: User ${userId}, Week ${week}`);
    }
    
    // Execute batch
    if (migratedCount > 0) {
      await batch.commit();
      console.log(`✅ Migrated ${migratedCount} lineups for league ${leagueId}, week ${week}`);
    } else {
      console.log(`📋 No migrations needed for league ${leagueId}, week ${week}`);
    }
    
  } catch (error) {
    console.error(`❌ Error migrating league ${leagueId}, week ${week}:`, error);
  }
}