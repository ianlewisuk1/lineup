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

/**
 * Normalize team names from CFBD to match our app's expected format
 * @param {string} teamName - Raw team name from CFBD
 * @returns {string} Normalized team name for our app
 */
function normalizeTeamNameForApp(teamName) {
  if (!teamName) return teamName;
  
  // Handle Hawaii/Hawai'i - normalize to "Hawaii" (without apostrophe)
  if (teamName === "Hawai'i") {
    return "Hawaii";
  }
  
  // Add other normalizations as needed:
  const normalizations = {
    "Hawai'i": "Hawaii",
    // Add more as you discover them:
    // "Miami (FL)": "Miami",
    // "Texas A&M-College Station": "Texas A&M",
  };
  
  return normalizations[teamName] || teamName;
}

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
  delete(ref) { this.batch.delete(ref); this.count++; this.totalWrites++; return this._maybeFlush(); }
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

/** Collect all games for teams, then update with chronologically next game */
async function patchTeamsForAllGames(bw, db, games) {
  // Group games by team
  const teamGames = new Map();
  
  for (const game of games) {
    if (!game.homeTeam || !game.awayTeam || !game.startDate) continue;
    
    const line = game.linesByProvider?.['consensus'] || 
                 Object.values(game.linesByProvider || {}).find(Boolean) || null;
    
    if (!line) continue;
    
    // Add game to home team's list
    if (!teamGames.has(game.homeTeam)) {
      teamGames.set(game.homeTeam, []);
    }
    teamGames.get(game.homeTeam).push({
      ...game,
      isHome: true,
      opponent: game.awayTeam,
      line
    });
    
    // Add game to away team's list
    if (!teamGames.has(game.awayTeam)) {
      teamGames.set(game.awayTeam, []);
    }
    teamGames.get(game.awayTeam).push({
      ...game,
      isHome: false,
      opponent: game.homeTeam,
      line
    });
  }
  
  // Now process each team's games to find the chronologically next game
  const now = new Date();
  
  for (const [teamName, teamGamesList] of teamGames) {
    // Sort games by start date
    const sortedGames = teamGamesList
      .filter(g => g.startDate)
      .map(g => ({
        ...g,
        gameDate: new Date(g.startDate)
      }))
      .sort((a, b) => a.gameDate.getTime() - b.gameDate.getTime());
    
    // Find the next upcoming game (first future game, or if none, the most recent)
    let nextGame = sortedGames.find(g => g.gameDate > now);
    if (!nextGame && sortedGames.length > 0) {
      // If no future games, take the most recent (last in sorted array)
      nextGame = sortedGames[sortedGames.length - 1];
    }
    
    if (!nextGame) continue;
    
    // Update the team document
    const slug = slugTeam(teamName);
    const ref = db.collection('teams').doc(slug);
    
    try {
      const snap = await ref.get();
      if (!snap.exists) {
        // Log missing team but don't create new docs
        try {
          await db.collection('cfb').doc('misses').collection('teams').add({
            raw: teamName,
            slugTried: slug,
            game: {
              homeTeam: nextGame.homeTeam || null,
              awayTeam: nextGame.awayTeam || null,
              startDate: nextGame.startDate || null
            },
            when: admin.firestore.FieldValue.serverTimestamp(),
          });
        } catch (e) {
          console.warn('[patchTeamsForAllGames] miss log failed', teamName, e);
        }
        continue;
      }
      
      // Calculate spread from team's perspective
      const spreadNum = (typeof nextGame.line.spread === 'number')
        ? (nextGame.isHome ? nextGame.line.spread : -nextGame.line.spread)
        : null;
      
      // Human-friendly display string
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
      
      console.log(`Updating ${teamName}: next game vs ${nextGame.opponent} on ${nextGame.startDate} (spread: ${spreadDisplay})`);
      
      bw.set(ref, {
        currentSeason: {
          nextOpponent: nextGame.opponent ?? null,
          nextGameDate: nextGame.startDate,
          nextGameIsHome: !!nextGame.isHome,
          nextOpponentSpread: spreadNum,
          nextOpponentSpreadDisplay: spreadDisplay,
          nextOverUnder: (typeof nextGame.line.overUnder === 'number') ? nextGame.line.overUnder : null,
          nextOpponentProvider: nextGame.line.provider ?? null,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }
      }, { merge: true });
      
    } catch (error) {
      console.error(`Error updating team ${teamName}:`, error);
    }
  }
}

/** NEW: Authoritative schedule management - CFBD is the single source of truth */
async function manageScheduleFromCFBD(bw, db, games, year, week) {
  if (!games || games.length === 0) return 0;

  let scheduleUpdated = 0;
  const weekRef = db.collection('schedule').doc(String(year)).collection('weeks').doc(String(week));

  for (const game of games) {
    if (!game.homeTeam || !game.awayTeam || !game.startDate) continue;

    const cfbdGameId = String(game.id || '');
    if (!cfbdGameId) continue;

    try {
      // Check if this CFBD game already exists in our schedule
      const existingGamesSnap = await weekRef.collection('games')
        .where('cfbdGameId', '==', cfbdGameId)
        .get();

      if (!existingGamesSnap.empty) {
        // Update existing CFBD entry with normalized team names
        const existingDoc = existingGamesSnap.docs[0];
        console.log(`Updating existing schedule game: ${game.homeTeam} vs ${game.awayTeam} [${cfbdGameId}]`);
        
        const normalizedHomeTeamUpdate = normalizeTeamNameForApp(game.homeTeam);
        const normalizedAwayTeamUpdate = normalizeTeamNameForApp(game.awayTeam);

        console.log(`📝 Normalizing update: ${game.homeTeam} → ${normalizedHomeTeamUpdate}, ${game.awayTeam} → ${normalizedAwayTeamUpdate}`);

        bw.update(existingDoc.ref, {
          homeTeam: normalizedHomeTeamUpdate,
          awayTeam: normalizedAwayTeamUpdate,
          date: game.startDate,
          venue: game.venue ?? null,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        
        scheduleUpdated++;
      } else {
        // Check for conflicting entries using normalized team names for conflict detection
        const gameHomeNormalized = normalizeTeamNameForApp(game.homeTeam);
        const gameAwayNormalized = normalizeTeamNameForApp(game.awayTeam);
        const conflictCheckHome = slugTeam(gameHomeNormalized);
        const conflictCheckAway = slugTeam(gameAwayNormalized);
        const normalizedTeams = [conflictCheckHome, conflictCheckAway].sort();
        
        const conflictingGamesSnap = await weekRef.collection('games').get();
        
        let hasConflict = false;
        const conflictsToDelete = [];
        
        conflictingGamesSnap.forEach(doc => {
          const existingGame = doc.data();
          if (!existingGame.cfbdGameId && existingGame.homeTeam && existingGame.awayTeam) {
            // Normalize existing game team names for comparison
            const existingNormalizedHome = slugTeam(existingGame.homeTeam);
            const existingNormalizedAway = slugTeam(existingGame.awayTeam);
            const existingNormalizedTeams = [existingNormalizedHome, existingNormalizedAway].sort();
            
            // Compare normalized team names
            if (normalizedTeams[0] === existingNormalizedTeams[0] && 
                normalizedTeams[1] === existingNormalizedTeams[1]) {
              console.log(`Found conflicting manual entry: ${existingGame.homeTeam} vs ${existingGame.awayTeam} conflicts with CFBD ${game.homeTeam} vs ${game.awayTeam}`);
              conflictsToDelete.push(doc.ref);
              hasConflict = true;
            }
          }
        });

        // Delete conflicting manual entries
        conflictsToDelete.forEach(ref => {
          console.log(`🗑️ Deleting conflicting manual entry: ${ref.id}`);
          bw.delete(ref);
        });

        // Create new CFBD entry with normalized team names
        console.log(`Creating new schedule game: ${game.homeTeam} vs ${game.awayTeam} [${cfbdGameId}]`);
        
        const newGameRef = weekRef.collection('games').doc(cfbdGameId);
        const normalizedHomeTeam = normalizeTeamNameForApp(game.homeTeam);
        const normalizedAwayTeam = normalizeTeamNameForApp(game.awayTeam);

        console.log(`📝 Normalizing teams: ${game.homeTeam} → ${normalizedHomeTeam}, ${game.awayTeam} → ${normalizedAwayTeam}`);

        bw.set(newGameRef, {
          homeTeam: normalizedHomeTeam,  // Now uses "Hawaii" instead of "Hawai'i"
          awayTeam: normalizedAwayTeam,  // Now uses "Hawaii" instead of "Hawai'i"
          date: game.startDate,
          venue: game.venue ?? null,
          cfbdGameId: cfbdGameId,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        
        scheduleUpdated++;
      }
    } catch (error) {
      console.error(`Error managing schedule for ${game.homeTeam} vs ${game.awayTeam}:`, error);
    }
  }

  return scheduleUpdated;
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

  // Process lines collection and collect games for other updates
  const processedGames = [];

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

    const gameWithLines = {
      gameId,
      season: g.season ?? year,
      seasonType: g.seasonType ?? seasonType,
      week, book,
      homeTeam: g.homeTeam ?? null,
      awayTeam: g.awayTeam ?? null,
      startDate: g.startDate ?? null,
      venue: g.venue ?? null,
      consensus: linesByProvider['consensus'] || null,
      linesByProvider,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    bw.set(docRef, gameWithLines, { merge: true });

    // Collect for team and schedule processing
    processedGames.push({
      ...g,
      linesByProvider
    });

    wrote++;
  }

  // NEW: Authoritative schedule management
  if (updateSchedule && processedGames.length > 0) {
    console.log(`Managing schedule for ${processedGames.length} games in week ${week}...`);
    scheduleUpdated = await manageScheduleFromCFBD(bw, db, processedGames, year, week);
  }

  // Process all games at once for teams to find chronologically next games
  if (updateTeams && processedGames.length > 0) {
    console.log(`Processing ${processedGames.length} games for team next-game updates...`);
    await patchTeamsForAllGames(bw, db, processedGames);
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
        updateSchedule: true,  // Enable authoritative schedule management
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
/*                            Debug/Admin Functions                            */
/* -------------------------------------------------------------------------- */

/**
 * Debug function to see what's actually in the schedule for a specific team
 */
exports.debugSchedule = onRequest(async (req, res) => {
  try {
    const db = admin.firestore();
    const year = req.query.year || '2025';
    const teamName = req.query.team || 'Kansas State';
    const week = req.query.week || null;
    
    console.log(`🔍 Debugging schedule for ${teamName} in ${year}${week ? ` week ${week}` : ''}`);
    
    const results = [];
    
    // Get weeks to check
    const weeksToCheck = week ? [week] : ['1', '2', '3', '4', '5'];
    
    for (const weekNum of weeksToCheck) {
      try {
        const gamesSnap = await db
          .collection('schedule').doc(year)
          .collection('weeks').doc(weekNum)
          .collection('games')
          .get();
        
        const weekGames = [];
        
        gamesSnap.forEach(gameDoc => {
          const game = gameDoc.data();
          if (game.homeTeam === teamName || game.awayTeam === teamName) {
            weekGames.push({
              docId: gameDoc.id,
              week: weekNum,
              homeTeam: game.homeTeam,
              awayTeam: game.awayTeam,
              date: game.date,
              venue: game.venue,
              cfbdGameId: game.cfbdGameId,
              updatedAt: game.updatedAt?.toDate?.() || game.updatedAt
            });
          }
        });
        
        if (weekGames.length > 0) {
          results.push({
            week: weekNum,
            games: weekGames
          });
        }
      } catch (error) {
        console.warn(`Error checking week ${weekNum}:`, error);
      }
    }
    
    // Format response
    let output = `📋 Schedule Debug for ${teamName}\n\n`;
    
    results.forEach(weekData => {
      output += `Week ${weekData.week}:\n`;
      weekData.games.forEach((game, index) => {
        const isHome = game.homeTeam === teamName;
        const opponent = isHome ? game.awayTeam : game.homeTeam;
        const homeAway = isHome ? 'vs' : '@';
        
        output += `  ${index + 1}. ${homeAway} ${opponent}\n`;
        output += `     Date: ${game.date || 'TBD'}\n`;
        output += `     Venue: ${game.venue || 'TBD'}\n`;
        output += `     Doc ID: ${game.docId}\n`;
        output += `     Home: ${game.homeTeam} | Away: ${game.awayTeam}\n`;
        output += `     CFBD ID: ${game.cfbdGameId || 'none'}\n\n`;
      });
    });
    
    console.log(output);
    
    res.json({
      success: true,
      team: teamName,
      year,
      results,
      formatted: output
    });
    
  } catch (error) {
    console.error('❌ Debug failed:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * One-time cleanup function to remove conflicting manual entries
 * This can be run if you ever need to clean up manual vs CFBD conflicts again
 */
exports.cleanupManualEntries = onRequest(async (req, res) => {
  try {
    const db = admin.firestore();
    const year = req.query.year || '2025';
    
    console.log(`🧹 Cleaning up manual schedule entries that conflict with CFBD data for ${year}...`);
    
    let totalRemoved = 0;
    const bw = new BatchWriter(db);
    
    // Get all weeks
    const weeksSnap = await db.collection('schedule').doc(year).collection('weeks').get();
    
    for (const weekDoc of weeksSnap.docs) {
      const weekNum = weekDoc.id;
      console.log(`🔍 Processing week ${weekNum}...`);
      
      const gamesSnap = await weekDoc.ref.collection('games').get();
      
      // Group games by team matchup (regardless of home/away order)
      const matchupGroups = new Map();
      
      gamesSnap.forEach(gameDoc => {
        const game = gameDoc.data();
        if (!game.homeTeam || !game.awayTeam) return;
        
        // Create normalized matchup key (alphabetical order)
        const teams = [game.homeTeam, game.awayTeam].sort();
        const matchupKey = `${teams[0]}_vs_${teams[1]}`;
        
        if (!matchupGroups.has(matchupKey)) {
          matchupGroups.set(matchupKey, []);
        }
        
        matchupGroups.get(matchupKey).push({
          docId: gameDoc.id,
          ref: gameDoc.ref,
          ...game
        });
      });
      
      // Find and remove manual entries that conflict with CFBD entries
      for (const [matchup, games] of matchupGroups) {
        if (games.length <= 1) continue;
        
        const cfbdEntries = games.filter(g => g.cfbdGameId);
        const manualEntries = games.filter(g => !g.cfbdGameId);
        
        if (cfbdEntries.length > 0 && manualEntries.length > 0) {
          console.log(`🗑️  Removing ${manualEntries.length} manual entries for ${matchup} (keeping ${cfbdEntries.length} CFBD entries)`);
          
          manualEntries.forEach(entry => {
            bw.delete(entry.ref);
            totalRemoved++;
          });
        }
      }
    }
    
    await bw.commit();
    console.log(`✅ Cleanup complete! Removed ${totalRemoved} manual entries.`);
    
    res.json({
      success: true,
      message: `Removed ${totalRemoved} conflicting manual entries for ${year}`,
      entriesRemoved: totalRemoved
    });
    
  } catch (error) {
    console.error('❌ Cleanup failed:', error);
    res.status(500).json({ error: error.message });
  }
});

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