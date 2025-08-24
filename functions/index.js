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

/** ESPN scoreboard base */
const ESPN_SCOREBOARD_BASE = 'https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard';

/** HTTPS + timeout + retry + FBS filter by default */
async function fetchESPNScoreboard(params = {}, { tries = 3, timeoutMs = 7000 } = {}) {
  const qs = new URLSearchParams({ groups: '80', ...params }); // FBS only
  const url = `${ESPN_SCOREBOARD_BASE}?${qs.toString()}`;

  for (let i = 1; i <= tries; i++) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        signal: ac.signal,
        headers: { 'User-Agent': 'LineupLiveScoring/1.0' }
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`ESPN HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      clearTimeout(timer);
      if (i === tries) throw err;
      await new Promise(r => setTimeout(r, 300 * i)); // simple backoff
    }
  }
}

// Enhanced team name normalization for ESPN
function baseNorm(s) {
  if (!s) return '';
  return s
    .replace(/\([^)]*\)/g, ' ')                         // remove parentheticals: "Miami (FL)" → "Miami"
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')   // strip accents: Hawaiʻi → Hawaii
    .replace(/&/g, ' and ')
    .replace(/\b(university|the|of|at|state)\b/gi, ' ')
    
    // NEW: Strip common mascot names automatically
    .replace(/\b(wildcats|cyclones|rebels|bengals|jayhawks|bulldogs|hilltoppers|bearkats|warriors|cardinal|tigers|eagles|bears|wolves|panthers|lions|hawks|falcons|owls|rams|bulls|cougars|broncos|mustangs|stallions|colts|knights|spartans|trojans|fighting|irish|crimson|tide|volunteers|gators|seminoles|hurricanes|demon|deacons|blue|devils|tar|heels|cavaliers|hokies|orange|golden|yellow|jackets|rainbow|warriors|aztecs|fresno|state|bulldogs)\b/gi, ' ')
    
    .replace(/[^a-z0-9]+/gi, '')
    .toLowerCase()
    .trim();
}

// Keep the existing aliases for edge cases
const ESPN_TEAM_ALIASES = new Map(Object.entries({
  'olemiss': 'mississippi',
  'miamifl': 'miami', 
  'miamioh': 'miamiohio',
  'utsa': 'texassanantonio',
  'utep': 'texaselpaso',
  'ucf': 'centralflorida',
  'usf': 'southflorida',
  'byu': 'brighamyoung',
  'smu': 'southernmethodist',
  'umass': 'massachusetts',
  'uconn': 'connecticut',
  'unlv': 'nevadalasvegas',
  'la-lafayette': 'louisiana',
  'louisiana-lafayette': 'louisiana',
  'la-tech': 'louisianatech',
  'hawaii': 'hawaii',
  
  // Add specific problematic cases as we find them
  'texasam': 'texasamuniversity',
  'notredame': 'notredamefighting',
  'southernmiss': 'southernmississippi',
  'appalachianst': 'appalachianstate',
}));

function normTeamNameESPN(s) {
  const n = baseNorm(s);
  return ESPN_TEAM_ALIASES.get(n) || n;
}
const keyFor = (home, away) => `${normTeamNameESPN(home)}::${normTeamNameESPN(away)}`;

/** Build O(1) index of ESPN events by multiple team-name variants */
function buildESPNIndex(espnEvents) {
  const idx = new Map();
  for (const ev of espnEvents || []) {
    const comp = ev?.competitions?.[0];
    if (!comp) continue;
    const homeT = comp.competitors?.find(c => c.homeAway === 'home')?.team;
    const awayT = comp.competitors?.find(c => c.homeAway === 'away')?.team;
    if (!homeT || !awayT) continue;

    [ keyFor(homeT.displayName, awayT.displayName),
      keyFor(homeT.shortDisplayName, awayT.shortDisplayName),
      keyFor(homeT.name, awayT.name)
    ].forEach(k => { if (k) idx.set(k, ev); });
  }
  return idx;
}

/** Safer ESPN status parsing */
function parseESPNEvent(espnEvent) {
  const comp = espnEvent?.competitions?.[0];
  const competitors = comp?.competitors || [];
  const home = competitors.find(c => c.homeAway === 'home');
  const away = competitors.find(c => c.homeAway === 'away');

  const homeScore = Number(home?.score ?? 0);
  const awayScore = Number(away?.score ?? 0);

  // NEW: Extract team records
  const getTeamRecord = (competitor) => {
    const records = competitor?.records || [];
    const overallRecord = records.find(r => r.name === 'overall' || r.type === 'total');
    return overallRecord?.summary || overallRecord?.displayValue || null;
  };

  const homeRecord = getTeamRecord(home);
  const awayRecord = getTeamRecord(away);

  const st = comp?.status;
  const t = st?.type || {};
  const state = (t.state || '').toLowerCase();       // 'pre' | 'in' | 'post'
  const name = (t.name || '').toUpperCase();         // 'STATUS_FINAL', etc.
  const desc = (t.description || '').toLowerCase();

  const isCanceled  = name === 'STATUS_CANCELED'  || desc.includes('canceled') || desc.includes('cancelled');
  const isPostponed = name === 'STATUS_POSTPONED' || desc.includes('postponed');
  const isFinal     = !!t.completed || state === 'post' || name === 'STATUS_FINAL';

  let gameStatus = 'scheduled';
  if (isCanceled) gameStatus = 'canceled';
  else if (isPostponed) gameStatus = 'postponed';
  else if (isFinal) gameStatus = 'final';
  else if (state === 'in') gameStatus = 'in_progress';

  return {
    homeScore,
    awayScore,
    gameStatus,
    period: st?.period ?? 1,
    clock: st?.displayClock ?? null,
    isComplete: gameStatus === 'final',
    // NEW: Add team records
    homeRecord,
    awayRecord,
  };
}

/** Matching with direct, swapped, and final set-based fallback */
function findMatchingESPNEvent(index, espnEvents, homeTeam, awayTeam) {
  let ev = index.get(keyFor(homeTeam, awayTeam));
  if (ev) return ev;
  ev = index.get(keyFor(awayTeam, homeTeam));
  if (ev) return ev;

  // tiny scan fallback: set equality
  const want = new Set([normTeamNameESPN(homeTeam), normTeamNameESPN(awayTeam)]);
  for (const cand of espnEvents || []) {
    const comp = cand?.competitions?.[0];
    if (!comp) continue;
    const names = (comp.competitors || [])
      .map(c => normTeamNameESPN(c?.team?.displayName || c?.team?.name || ''));
    if (names.length === 2 && names.every(n => want.has(n))) return cand;
  }
  return undefined;
}

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

/** Enhanced: Authoritative schedule management + spread data from CFBD lines */
async function manageScheduleFromCFBD(bw, db, games, year, week) {
  if (!games || games.length === 0) return 0;

  let scheduleUpdated = 0;
  const weekRef = db.collection('schedule').doc(String(year)).collection('weeks').doc(String(week));

  for (const game of games) {
    if (!game.homeTeam || !game.awayTeam || !game.startDate) continue;

    const cfbdGameId = String(game.id || '');
    if (!cfbdGameId) continue;

    try {
      // NEW: Extract spread data from the processed game (which has linesByProvider)
      let homeSpread = null;
      let spreadProvider = null;
      
      if (game.linesByProvider) {
        // Try consensus first, then any available provider
        const providers = ['consensus', 'Bovada', 'ESPN Bet', 'DraftKings', 'FanDuel'];
        
        for (const provider of providers) {
          const line = game.linesByProvider[provider];
          if (line && typeof line.spread === 'number') {
            homeSpread = line.spread;  // This is from HOME team's perspective
            spreadProvider = provider;
            console.log(`📊 Found spread for ${game.homeTeam} vs ${game.awayTeam}: ${homeSpread} (${provider})`);
            break;
          }
        }
      }

      // Check if this CFBD game already exists in our schedule
      const existingGamesSnap = await weekRef.collection('games')
        .where('cfbdGameId', '==', cfbdGameId)
        .get();

      if (!existingGamesSnap.empty) {
        // Update existing CFBD entry with normalized team names AND spread data
        const existingDoc = existingGamesSnap.docs[0];
        console.log(`Updating existing schedule game: ${game.homeTeam} vs ${game.awayTeam} [${cfbdGameId}]${homeSpread !== null ? ` - Spread: ${homeSpread}` : ' - No spread'}`);
        
        const normalizedHomeTeamUpdate = normalizeTeamNameForApp(game.homeTeam);
        const normalizedAwayTeamUpdate = normalizeTeamNameForApp(game.awayTeam);

        console.log(`📝 Normalizing update: ${game.homeTeam} → ${normalizedHomeTeamUpdate}, ${game.awayTeam} → ${normalizedAwayTeamUpdate}`);

        const updateData = {
          homeTeam: normalizedHomeTeamUpdate,
          awayTeam: normalizedAwayTeamUpdate,
          date: game.startDate,
          venue: game.venue ?? null,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        // NEW: Add spread data if available
        if (typeof homeSpread === 'number') {
          updateData.homeSpread = homeSpread;
          updateData.spreadProvider = spreadProvider;
          updateData.spreadLastUpdated = admin.firestore.FieldValue.serverTimestamp();
          console.log(`📊 Adding spread data: homeSpread=${homeSpread}, provider=${spreadProvider}`);
        } else {
          console.log(`⚠️ No spread data available for ${game.homeTeam} vs ${game.awayTeam}`);
        }

        bw.update(existingDoc.ref, updateData);
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

        // Create new CFBD entry with normalized team names AND spread data
        console.log(`Creating new schedule game: ${game.homeTeam} vs ${game.awayTeam} [${cfbdGameId}]${homeSpread !== null ? ` - Spread: ${homeSpread}` : ' - No spread'}`);
        
        const newGameRef = weekRef.collection('games').doc(cfbdGameId);
        const normalizedHomeTeam = normalizeTeamNameForApp(game.homeTeam);
        const normalizedAwayTeam = normalizeTeamNameForApp(game.awayTeam);

        console.log(`📝 Normalizing teams: ${game.homeTeam} → ${normalizedHomeTeam}, ${game.awayTeam} → ${normalizedAwayTeam}`);

        const newGameData = {
          homeTeam: normalizedHomeTeam,  // Now uses "Hawaii" instead of "Hawai'i"
          awayTeam: normalizedAwayTeam,  // Now uses "Hawaii" instead of "Hawai'i"
          date: game.startDate,
          venue: game.venue ?? null,
          cfbdGameId: cfbdGameId,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        // NEW: Add spread data if available
        if (typeof homeSpread === 'number') {
          newGameData.homeSpread = homeSpread;
          newGameData.spreadProvider = spreadProvider;
          newGameData.spreadLastUpdated = admin.firestore.FieldValue.serverTimestamp();
          console.log(`📊 Adding spread data to new game: homeSpread=${homeSpread}, provider=${spreadProvider}`);
        } else {
          console.log(`⚠️ No spread data available for new game: ${game.homeTeam} vs ${game.awayTeam}`);
        }

        bw.set(newGameRef, newGameData);
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
      const currentWeek = seasonData.currentWeek || "Week 1";
      const currentWeekString = String(currentWeek); // Force to string
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
      const existingWeeklyData = weeklyLineupsSnap.exists ? weeklyLineupsSnap.data() : {};      
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

/**
 * Update team record when game completes
 * @param {BatchWriter} bw - Batch writer
 * @param {FirebaseFirestore} db - Firestore instance
 * @param {string} teamName - Team name
 * @param {string} record - Team record (e.g., "3-1")
 */
async function updateTeamRecord(bw, db, teamName, record) {
  if (!record) return; // Skip if no record available

  try {
    const slug = slugTeam(teamName);
    const teamRef = db.collection('teams').doc(slug);
    
    // Check if team document exists
    const teamSnap = await teamRef.get();
    if (!teamSnap.exists) {
      console.warn(`⚠️ Team document not found for record update: ${teamName} (${slug})`);
      return;
    }

    // Update the team's record
    bw.update(teamRef, {
      'currentSeason.record': record,
      'currentSeason.recordLastUpdated': admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(`📊 Updated ${teamName} record: ${record}`);

  } catch (error) {
    console.error(`Error updating record for ${teamName}:`, error);
  }
}

/* -------------------------------------------------------------------------- */
/*                           Complete Live Scoring System                      */
/* -------------------------------------------------------------------------- */

/** Every 2 minutes during games */
exports.ingestLiveScores = onSchedule(
  { schedule: '*/2 * * * *', timeZone: 'America/New_York' },
  async () => {
    try {
      console.log('🔴 Starting ESPN live score ingestion...');
      const db = admin.firestore();

      const currentWeek = await getCurrentWeek(db);
      if (!currentWeek) {
        console.log('❌ No current week found');
        return;
      }

      const activeGames = await getActiveGames(db, currentWeek);
      if (activeGames.length === 0) {
        console.log('📭 No active games to update');
        return;
      }

      console.log(`🏈 Found ${activeGames.length} active games to update`);

      // Optionally pass ESPN date filters: { dates: 'YYYYMMDD' or 'YYYYMMDD-YYYYMMDD' }
      const result = await processLiveScoring(db, activeGames, currentWeek, {
        espnParams: { /* dates */ }
      });

      console.log(`✅ ESPN live scoring complete:`, result);
    } catch (error) {
      console.error('❌ ESPN live score ingestion failed:', error);
    }
  }
);

/** Manual trigger: supports ?week= and optional ?dates=YYYYMMDD or YYYYMMDD-YYYYMMDD */
exports.triggerLiveScores = onRequest(async (req, res) => {
  try {
    const week = parseInt(req.query.week) || null;
    const forceAll = req.query.forceAll === 'true';
    const dates = typeof req.query.dates === 'string' ? req.query.dates : undefined;

    console.log(`🔧 Manual ESPN live score trigger: Week ${week || 'current'}, Force all: ${forceAll}, Dates: ${dates || 'auto'}`);

    const db = admin.firestore();
    const targetWeek = week || await getCurrentWeek(db);
    if (!targetWeek) {
      return res.status(400).json({ error: 'No target week found' });
    }

    const games = forceAll
      ? await getAllGamesForWeek(db, targetWeek)
      : await getActiveGames(db, targetWeek);

    console.log(`📋 Processing ${games.length} games with ESPN`);

    const result = await processLiveScoring(db, games, targetWeek, {
      espnParams: dates ? { dates } : {}
    });

    res.json({
      success: true,
      week: targetWeek,
      provider: 'ESPN',
      ...result
    });

  } catch (error) {
    console.error('❌ Manual ESPN live score trigger failed:', error);
    res.status(500).json({ error: error.message });
  }
});


/* -------------------------------------------------------------------------- */
/*                         Live Scoring Helper Functions                       */
/* -------------------------------------------------------------------------- */

/**
 * Get current week from season config - handles both string and number formats
 */
async function getCurrentWeek(db) {
  try {
    const seasonSnap = await db.collection('config').doc('season').get();
    if (!seasonSnap.exists) return null;
    
    const seasonData = seasonSnap.data();
    const currentWeek = seasonData.currentWeek;
    
    // Handle different formats
    if (typeof currentWeek === 'number') {
      // Direct number: currentWeek: 1
      return currentWeek;
    } else if (typeof currentWeek === 'string') {
      // String format: "Week 1" or "1"
      const weekMatch = currentWeek.match(/\d+/);
      return weekMatch ? parseInt(weekMatch[0]) : 1;
    } else {
      // Fallback to week 1
      console.warn('currentWeek format not recognized, defaulting to week 1:', currentWeek);
      return 1;
    }
  } catch (error) {
    console.error('Error getting current week:', error);
    return null;
  }
}

/**
 * Get games that are currently active (started but not complete)
 */
async function getActiveGames(db, week) {
  try {
    const now = new Date();
    
    const gamesSnap = await db
      .collection('schedule').doc('2025')
      .collection('weeks').doc(week.toString())
      .collection('games')
      .get();
    
    const activeGames = [];
    
    gamesSnap.forEach(doc => {
      const game = doc.data();
      const gameDate = new Date(game.date);
      
      // Game has started but is not complete
      if (gameDate <= now && !game.gameComplete) {
        activeGames.push({
          ref: doc.ref,
          id: doc.id,
          ...game
        });
      }
    });
    
    return activeGames;
  } catch (error) {
    console.error(`Error getting active games for week ${week}:`, error);
    return [];
  }
}

/**
 * Get all games for a week (for manual testing)
 */
async function getAllGamesForWeek(db, week) {
  try {
    const gamesSnap = await db
      .collection('schedule').doc('2025')
      .collection('weeks').doc(week.toString())
      .collection('games')
      .get();
    
    const allGames = [];
    gamesSnap.forEach(doc => {
      allGames.push({
        ref: doc.ref,
        id: doc.id,
        ...doc.data()
      });
    });
    
    return allGames;
  } catch (error) {
    console.error(`Error getting all games for week ${week}:`, error);
    return [];
  }
}

/**
 * Main live scoring processor - handles everything from CFBD data to member points
 */
/**
 * Updated live scoring processor using ESPN API instead of CFBD
 */
/**
 * Live scoring processor using ESPN (hardened)
 */
async function processLiveScoring(db, activeGames, week, { espnParams = {} } = {}) {
  const bw = new BatchWriter(db);
  let gamesUpdated = 0;
  let gamesCompleted = 0;
  let teamsUpdated = 0;
  let membersUpdated = 0;

  const completedTeams = new Set();

  // Fetch once per run
  const espnData = await fetchESPNScoreboard(espnParams);
  const espnEvents = espnData?.events || [];
  console.log(`📊 Retrieved ${espnEvents.length} ESPN events`);

  // Build index for O(1) lookups
  const index = buildESPNIndex(espnEvents);

  for (const game of activeGames) {
    const espnEvent = findMatchingESPNEvent(index, espnEvents, game.homeTeam, game.awayTeam);
    if (!espnEvent) {
      console.log(`⚠️ No ESPN match found for: ${game.homeTeam} vs ${game.awayTeam}`);
      continue;
    }

    const { homeScore, awayScore, gameStatus, period, clock, isComplete, homeRecord, awayRecord } = parseESPNEvent(espnEvent);
    console.log(`🔄 ${game.homeTeam} ${homeScore} - ${awayScore} ${game.awayTeam} ${isComplete ? '(Final)' : `(${gameStatus})`}`);

    const gameUpdates = {
      homeScore,
      awayScore,
      period: period || 1,
      clock: clock || null,
      gameStatus,
      lastScoreUpdate: admin.firestore.FieldValue.serverTimestamp()
    };

    // Points with your existing logic
    const homeSpread = game.homeSpread ?? 0;
    const homeMargin = homeScore - awayScore;
    const awayMargin = awayScore - homeScore;

    const homePoints = calculateTeamFantasyPoints(
      homeScore > awayScore,
      homeMargin,
      homeSpread,
      game.homeTeam
    );

    const awayPoints = calculateTeamFantasyPoints(
      awayScore > homeScore,
      awayMargin,
      -homeSpread,
      game.awayTeam
    );

    await updateTeamWeeklyPoints(bw, db, game.homeTeam, homePoints, week, isComplete);
    await updateTeamWeeklyPoints(bw, db, game.awayTeam, awayPoints, week, isComplete);
    teamsUpdated += 2;

    if (isComplete && !game.gameComplete) {
      completedTeams.add(game.homeTeam);
      completedTeams.add(game.awayTeam);
      gameUpdates.gameComplete = true;
      gameUpdates.finalScore = { home: homeScore, away: awayScore };
      gamesCompleted++;
    }

    // NEW: Update team records for any completed game (whether newly complete or already complete)
    if (isComplete) {
      if (homeRecord) {
        await updateTeamRecord(bw, db, game.homeTeam, homeRecord);
        console.log(`📊 ${game.homeTeam} final record: ${homeRecord}`);
      }
      if (awayRecord) {
        await updateTeamRecord(bw, db, game.awayTeam, awayRecord);
        console.log(`📊 ${game.awayTeam} final record: ${awayRecord}`);
      }
    }

    bw.update(game.ref, gameUpdates);
    gamesUpdated++;
  }

  await bw.commit();

  if (completedTeams.size > 0 || gamesUpdated > 0) {
    console.log(`🔄 Recalculating member points`);
    membersUpdated = await recalculateAllMemberPoints(db, week);
  }

  return {
    gamesUpdated,
    gamesCompleted,
    teamsUpdated,
    membersUpdated,
    completedTeams: Array.from(completedTeams)
  };
}

/**
 * Calculate fantasy points based on your scoring system
 * ✅ FIXED: Corrected spread calculation logic
 */
function calculateTeamFantasyPoints(won, actualMargin, teamSpread, teamName) {
  // Base points: +5 for win, -3 for loss
  const basePoints = won ? 5 : -3;
  
  // Underdog bonus: +3 additional points if team was underdog AND won
  const wasUnderdog = teamSpread > 0;
  const underdogBonus = won && wasUnderdog ? 3 : 0;
  
  // ✅ FIXED: Cover calculation
  // For favorites (negative spread): coverPoints = actualMargin - Math.abs(teamSpread)
  // For underdogs (positive spread): coverPoints = actualMargin + teamSpread
  let coverPoints;
  if (teamSpread < 0) {
    // Team was favored - they need to win by more than the spread
    coverPoints = actualMargin - Math.abs(teamSpread);
  } else if (teamSpread > 0) {
    // Team was underdog - they get points for "covering" even in a loss
    coverPoints = actualMargin + teamSpread;
  } else {
    // Pick 'em game
    coverPoints = actualMargin;
  }
  
  let spreadPoints = 0;
  if (coverPoints >= 20) {
    spreadPoints = 5;        // Covered by 20+ points
  } else if (coverPoints >= 14.5) {
    spreadPoints = 3;        // Covered by 14.5-19.5 points  
  } else if (coverPoints >= 7.5) {
    spreadPoints = 2;        // Covered by 7.5-14 points
  } else if (coverPoints >= 1) {
    spreadPoints = 1;        // Covered by 1-7 points
  } else {
    // Failed to cover - negative penalties
    const failAmount = Math.abs(coverPoints);
    if (failAmount >= 20) {
      spreadPoints = -5;     // Failed by 20+ points
    } else if (failAmount >= 14.5) {
      spreadPoints = -3;     // Failed by 14.5-19.5 points
    } else if (failAmount >= 7.5) {
      spreadPoints = -2;     // Failed by 7.5-14 points  
    } else {
      spreadPoints = -1;     // Failed by 1-7 points
    }
  }
  
  const totalPoints = basePoints + underdogBonus + spreadPoints;
  
  console.log(`🧮 ${teamName}: Base ${basePoints} + Underdog ${underdogBonus} + Spread ${spreadPoints} = ${totalPoints} (cover: ${coverPoints}, spread: ${teamSpread})`);
  
  return totalPoints;
}

/**
 * Update team document with weekly fantasy points
 */
async function updateTeamWeeklyPoints(bw, db, teamName, points, week, isGameComplete) {
  try {
    const slug = slugTeam(teamName);
    const teamRef = db.collection('teams').doc(slug);
    
    // Check if team document exists
    const teamSnap = await teamRef.get();
    if (!teamSnap.exists) {
      console.warn(`⚠️ Team document not found: ${teamName} (${slug})`);
      
      // Log to misses collection
      try {
        await db.collection('cfb').doc('misses').collection('teams').add({
          raw: teamName,
          slugTried: slug,
          context: 'weekly_points_update',
          week,
          points,
          when: admin.firestore.FieldValue.serverTimestamp(),
        });
      } catch (e) {
        console.warn('[updateTeamWeeklyPoints] miss log failed', teamName, e);
      }
      return;
    }
    
    const teamData = teamSnap.data();
    const currentWeeklyPoints = teamData.currentSeason?.weeklyPoints || {};
    const currentGamePoints = teamData.currentSeason?.gamePoints || 0;
    
    // Update weekly points for this week
    const weekKey = `week${week}`;
    const previousWeekPoints = currentWeeklyPoints[weekKey] || 0;
    
    // Calculate new season total (remove old week points, add new week points)
    const newGamePoints = currentGamePoints - previousWeekPoints + points;
    
    // Prepare update object
    const updateData = {
      [`currentSeason.weeklyPoints.${weekKey}`]: points,
      'currentSeason.gamePoints': newGamePoints,
      'currentSeason.lastPointsUpdate': admin.firestore.FieldValue.serverTimestamp(),
    };
    
    // Only update gameComplete status when game actually completes
    if (isGameComplete) {
      updateData['currentSeason.gameComplete'] = true;
    }
    
    bw.update(teamRef, updateData);
    
    console.log(`📝 Updated ${teamName}: Week ${week}: ${points} pts, Season total: ${newGamePoints} pts`);
    
  } catch (error) {
    console.error(`Error updating weekly points for ${teamName}:`, error);
  }
}

/**
 * Recalculate all member points based on their STARTER rosters only
 */
async function recalculateAllMemberPoints(db, currentWeek) {
  try {
    let totalMembersUpdated = 0;
    
    // Get all leagues
    const leaguesSnap = await db.collection('leagues').get();
    
    for (const leagueDoc of leaguesSnap.docs) {
      const leagueId = leagueDoc.id;
      console.log(`📊 Recalculating member points for league: ${leagueId}`);
      
      // Get all members in this league
      const membersSnap = await db
        .collection('leagues').doc(leagueId)
        .collection('members')
        .get();
      
      const memberUpdates = [];
      
      for (const memberDoc of membersSnap.docs) {
        const memberData = memberDoc.data();
        const lineup = memberData.lineup || {};
        
        // ✅ FIXED: Only get STARTERS, not bench players
        const starterTeams = (lineup.starters || [])
          .filter(teamName => teamName && teamName.trim() !== '');
        
        if (starterTeams.length === 0) {
          console.log(`⏭️ Member ${memberDoc.id} has no starter teams, skipping`);
          continue;
        }
        
        console.log(`📝 Member ${memberDoc.id} has ${starterTeams.length} starters: [${starterTeams.join(', ')}]`);
        
        // Calculate member's total season points and current week points (STARTERS ONLY)
        let memberSeasonTotal = 0;
        let memberCurrentWeekPoints = 0;
        
        // ✅ FIXED: Loop through starterTeams, not allTeamsInRoster
        for (const teamName of starterTeams) {
          try {
            const slug = slugTeam(teamName);
            const teamRef = db.collection('teams').doc(slug);
            const teamSnap = await teamRef.get();
            
            if (teamSnap.exists) {
              const teamData = teamSnap.data();
              const teamGamePoints = teamData.currentSeason?.gamePoints || 0;
              const teamWeeklyPoints = teamData.currentSeason?.weeklyPoints || {};
              const teamCurrentWeekPoints = teamWeeklyPoints[`week${currentWeek}`] || 0;
              
              memberSeasonTotal += teamGamePoints;
              memberCurrentWeekPoints += teamCurrentWeekPoints;
              
              console.log(`  📊 ${teamName}: ${teamGamePoints} season pts, ${teamCurrentWeekPoints} week pts`);
            } else {
              console.warn(`⚠️ Team not found for member calculation: ${teamName} (${slug})`);
            }
          } catch (error) {
            console.error(`Error calculating points for team ${teamName}:`, error);
          }
        }
        
        // Queue member update
        memberUpdates.push({
          ref: memberDoc.ref,
          points: memberSeasonTotal,
          weeklyPoints: memberCurrentWeekPoints
        });
        
        console.log(`📊 Member ${memberDoc.id} FINAL: ${memberSeasonTotal} season pts (${starterTeams.length} starters), ${memberCurrentWeekPoints} week pts`);
      }
      
      // Batch update all members in this league
      if (memberUpdates.length > 0) {
        const memberBatch = db.batch();
        
        memberUpdates.forEach(update => {
          memberBatch.update(update.ref, {
            points: update.points,
            weeklyPoints: update.weeklyPoints,
            lastPointsUpdate: admin.firestore.FieldValue.serverTimestamp()
          });
        });
        
        await memberBatch.commit();
        totalMembersUpdated += memberUpdates.length;
        
        console.log(`✅ Updated ${memberUpdates.length} members in league ${leagueId}`);
      }
    }
    
    console.log(`✅ Total members updated across all leagues: ${totalMembersUpdated}`);
    return totalMembersUpdated;
    
  } catch (error) {
    console.error('❌ Error recalculating member points:', error);
    return 0;
  }
}

/* -------------------------------------------------------------------------- */
/*                           Clear Future Game Scores                         */
/* -------------------------------------------------------------------------- */

exports.recalculateMemberPoints = onRequest(async (req, res) => {
  try {
    const week = parseInt(req.query.week) || 1;
    
    console.log(`🔄 Manual member points recalculation for week ${week}...`);
    
    const db = admin.firestore();
    const membersUpdated = await recalculateAllMemberPoints(db, week);
    
    res.json({
      success: true,
      week,
      membersUpdated,
      message: `Recalculated points for ${membersUpdated} members`
    });
    
  } catch (error) {
    console.error('❌ Member points recalculation failed:', error);
    res.status(500).json({ error: error.message });
  }
});

exports.clearFutureGameScores = onRequest(async (req, res) => {
  try {
    const db = admin.firestore();
    const week = parseInt(req.query.week) || 1;
    const cutoffDate = new Date(); // Only clear games after now
    
    console.log(`🧹 Clearing future game scores for week ${week}...`);
    
    const gamesSnap = await db
      .collection('schedule').doc('2025')
      .collection('weeks').doc(week.toString())
      .collection('games')
      .get();
    
    const batch = db.batch();
    let cleared = 0;
    
    gamesSnap.forEach(doc => {
      const game = doc.data();
      const gameDate = new Date(game.date);
      
      // If game is in future but has scores, clear them
      if (gameDate > cutoffDate && (game.homeScore !== undefined || game.awayScore !== undefined)) {
        console.log(`🗑️ Clearing scores for future game: ${game.homeTeam} vs ${game.awayTeam} (${game.date})`);
        
        batch.update(doc.ref, {
          homeScore: admin.firestore.FieldValue.delete(),
          awayScore: admin.firestore.FieldValue.delete(),
          gameStatus: admin.firestore.FieldValue.delete(),
          gameComplete: admin.firestore.FieldValue.delete(),
          period: admin.firestore.FieldValue.delete(),
          clock: admin.firestore.FieldValue.delete(),
          lastScoreUpdate: admin.firestore.FieldValue.delete(),
          finalScore: admin.firestore.FieldValue.delete()
        });
        cleared++;
      }
    });
    
    if (cleared > 0) {
      await batch.commit();
      console.log(`✅ Cleared ${cleared} future games`);
    } else {
      console.log(`📋 No future games needed clearing`);
    }
    
    res.json({ 
      success: true, 
      gamesCleared: cleared,
      message: `Cleared scores from ${cleared} future games in week ${week}`
    });
    
  } catch (error) {
    console.error('❌ Error clearing future game scores:', error);
    res.status(500).json({ error: error.message });
  }
});

exports.debugESPN = onRequest(async (req, res) => {
  try {
    const dates = req.query.dates || '20250823';
    
    const espnData = await fetchESPNScoreboard({ dates });
    const events = espnData?.events || [];
    
    const gameDetails = events.map(event => {
      const comp = event?.competitions?.[0];
      const competitors = comp?.competitors || [];
      const home = competitors.find(c => c.homeAway === 'home');
      const away = competitors.find(c => c.homeAway === 'away');
      const status = comp?.status?.type;
      
      return {
        homeTeam: home?.team?.displayName,
        awayTeam: away?.team?.displayName,
        homeScore: home?.score,
        awayScore: away?.score,
        status: status?.name,
        completed: status?.completed,
        date: comp?.date
      };
    });
    
    res.json({
      totalEvents: events.length,
      dateFilter: dates,
      games: gameDetails
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

exports.resetAllTeamPoints = onRequest(async (req, res) => {
  try {
    const db = admin.firestore();
    const week = parseInt(req.query.week) || 1;
    
    console.log(`🔄 Resetting all team points for week ${week}...`);
    
    const teamsSnap = await db.collection('teams').get();
    const bw = new BatchWriter(db);
    let resetCount = 0;
    
    teamsSnap.forEach(teamDoc => {
      const weekKey = `week${week}`;
      bw.update(teamDoc.ref, {
        [`currentSeason.weeklyPoints.${weekKey}`]: 0,
        'currentSeason.gamePoints': 0,
        'currentSeason.lastPointsUpdate': admin.firestore.FieldValue.serverTimestamp()
      });
      resetCount++;
    });
    
    await bw.commit();
    
    // Recalculate all member points
    const membersUpdated = await recalculateAllMemberPoints(db, week);
    
    res.json({
      success: true,
      teamsReset: resetCount,
      membersUpdated,
      message: `Reset ${resetCount} teams and ${membersUpdated} members for week ${week}`
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/** 
 * SAFE Manual trigger: Only processes games that have actually started
 * Replaces the dangerous forceAll=true option
 */
exports.triggerLiveScoresSafe = onRequest(async (req, res) => {
  try {
    const week = parseInt(req.query.week) || null;
    
    console.log(`🔧 SAFE Manual ESPN live score trigger: Week ${week || 'current'}`);

    const db = admin.firestore();
    const targetWeek = week || await getCurrentWeek(db);
    if (!targetWeek) {
      return res.status(400).json({ error: 'No target week found' });
    }

    // Only get games that have started (no forceAll bypass)
    const activeGames = await getActiveGames(db, targetWeek);
    
    if (activeGames.length === 0) {
      return res.json({
        success: true,
        message: 'No active games to process',
        week: targetWeek,
        gamesUpdated: 0
      });
    }

    console.log(`📋 Processing ${activeGames.length} active games with ESPN`);

    const result = await processLiveScoring(db, activeGames, targetWeek, {
      espnParams: {} // No date filtering needed - we're only processing started games
    });

    res.json({
      success: true,
      week: targetWeek,
      provider: 'ESPN',
      message: `Safely processed ${result.gamesUpdated} active games`,
      ...result
    });

  } catch (error) {
    console.error('❌ Safe manual live score trigger failed:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Helper: Get games that finished recently but might not have final scoring data
 */
async function getRecentlyFinishedGames(db, week, hoursBack) {
  try {
    const now = new Date();
    const cutoff = new Date(now.getTime() - (hoursBack * 60 * 60 * 1000)); // X hours ago
    
    const gamesSnap = await db
      .collection('schedule').doc('2025')
      .collection('weeks').doc(week.toString())
      .collection('games')
      .get();
    
    const recentlyFinishedGames = [];
    
    gamesSnap.forEach(doc => {
      const game = doc.data();
      const gameDate = new Date(game.date);
      
      // Game should be finished by now (started more than 4 hours ago)
      // AND either not marked complete OR missing final scores
      const gameEndEstimate = new Date(gameDate.getTime() + (4 * 60 * 60 * 1000)); // Game + 4 hours
      
      if (gameEndEstimate > cutoff && gameEndEstimate <= now) {
        // This game should have finished recently
        if (!game.gameComplete || !game.homeScore || !game.awayScore) {
          // But it's missing final data - include it for backfill
          recentlyFinishedGames.push({
            ref: doc.ref,
            id: doc.id,
            ...game
          });
        }
      }
    });
    
    return recentlyFinishedGames;
  } catch (error) {
    console.error(`Error getting recently finished games for week ${week}:`, error);
    return [];
  }
}

/**
 * BACKFILL function: Safely processes recently finished games that might have been missed
 * Only processes games that finished in the last 6 hours
 */
exports.backfillRecentGames = onRequest(async (req, res) => {
  try {
    const week = parseInt(req.query.week) || null;
    const hoursBack = parseInt(req.query.hours) || 6; // Default 6 hours
    
    console.log(`🔄 Backfilling recently finished games: Week ${week || 'current'}, ${hoursBack} hours back`);

    const db = admin.firestore();
    const targetWeek = week || await getCurrentWeek(db);
    if (!targetWeek) {
      return res.status(400).json({ error: 'No target week found' });
    }

    // Get recently finished games (completed in last X hours but might not have final data)
    const recentlyFinishedGames = await getRecentlyFinishedGames(db, targetWeek, hoursBack);
    
    if (recentlyFinishedGames.length === 0) {
      return res.json({
        success: true,
        message: `No recently finished games found in last ${hoursBack} hours`,
        week: targetWeek,
        gamesUpdated: 0
      });
    }

    console.log(`📋 Backfilling ${recentlyFinishedGames.length} recently finished games`);

    const result = await processLiveScoring(db, recentlyFinishedGames, targetWeek, {
      espnParams: {}
    });

    res.json({
      success: true,
      week: targetWeek,
      provider: 'ESPN',
      message: `Backfilled ${result.gamesUpdated} recently finished games`,
      hoursBack,
      ...result
    });

  } catch (error) {
    console.error('❌ Backfill recent games failed:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * AUTOMATIC DAILY BACKFILL: Runs every morning to catch any missed games
 * This ensures no games ever get lost due to function failures
 */
exports.dailyBackfillMissedGames = onSchedule(
  { 
    schedule: '0 6 * * *',           // 6 AM daily
    timeZone: 'America/New_York' 
  },
  async () => {
    try {
      console.log('🌅 Starting daily backfill for missed games...');
      
      const db = admin.firestore();
      const currentWeek = await getCurrentWeek(db);
      
      if (!currentWeek) {
        console.log('❌ No current week found');
        return;
      }

      // Backfill last 24 hours of games
      const hoursBack = 24;
      const recentlyFinishedGames = await getRecentlyFinishedGames(db, currentWeek, hoursBack);
      
      if (recentlyFinishedGames.length === 0) {
        console.log(`📭 No missed games found in last ${hoursBack} hours`);
        return;
      }

      console.log(`🔄 Found ${recentlyFinishedGames.length} games that may need backfilling`);

      const result = await processLiveScoring(db, recentlyFinishedGames, currentWeek, {
        espnParams: {}
      });

      console.log(`✅ Daily backfill complete:`, {
        week: currentWeek,
        gamesProcessed: result.gamesUpdated,
        gamesCompleted: result.gamesCompleted,
        teamsUpdated: result.teamsUpdated,
        membersUpdated: result.membersUpdated
      });

      // Log successful backfill to Firestore for monitoring
      try {
        await db.collection('system').doc('backfill-log').collection('daily').add({
          week: currentWeek,
          hoursBack,
          gamesFound: recentlyFinishedGames.length,
          result,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          status: 'success'
        });
      } catch (logError) {
        console.warn('Failed to log backfill result:', logError);
      }

    } catch (error) {
      console.error('❌ Daily backfill failed:', error);
      
      // Log failure to Firestore for monitoring
      try {
        const db = admin.firestore();
        await db.collection('system').doc('backfill-log').collection('daily').add({
          error: error.message,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          status: 'failed'
        });
      } catch (logError) {
        console.warn('Failed to log backfill error:', logError);
      }
    }
  }
);

/** NEW: Manual trigger for lines + spread sync (for immediate testing) */
exports.testSpreadSync = onRequest(async (req, res) => {
  try {
    const key = CFB_KEY.value();
    const year = Number(req.query.year) || 2025;
    const week = Number(req.query.week) || 1;
    const seasonType = String(req.query.seasonType || 'regular');
    const book = String(req.query.book || 'consensus');

    console.log(`🚀 Testing spread sync for Week ${week}...`);

    // Run the full ingest (which will now include spread data in schedule docs)
    const result = await ingestLines({ 
      year, 
      week, 
      seasonType, 
      book, 
      updateTeams: true, 
      updateSchedule: true,  // This will call the enhanced manageScheduleFromCFBD
      key 
    });

    return res.json({
      success: true,
      message: `Updated ${result.wrote} line entries and ${result.scheduleUpdated} schedule games with spread data`,
      ...result
    });
  } catch (e) {
    console.error('testSpreadSync error:', e);
    return res.status(500).send(String(e?.message || e));
  }
});

/**
 * One-time function to sync records for all completed games
 */
exports.syncRecordsForCompletedGames = onRequest(async (req, res) => {
  try {
    const db = admin.firestore();
    const week = parseInt(req.query.week) || 1;
    
    console.log(`📊 Syncing records for completed games in week ${week}...`);

    // Get all completed games for the week
    const gamesSnap = await db
      .collection('schedule').doc('2025')
      .collection('weeks').doc(week.toString())
      .collection('games')
      .where('gameComplete', '==', true)
      .get();

    if (gamesSnap.empty) {
      return res.json({
        success: true,
        message: 'No completed games found',
        week,
        gamesProcessed: 0
      });
    }

    const completedGames = [];
    gamesSnap.forEach(doc => {
      completedGames.push({
        ref: doc.ref,
        id: doc.id,
        ...doc.data()
      });
    });

    console.log(`🔄 Processing ${completedGames.length} completed games for record sync...`);

    // Process them through the live scoring system (which will now update records)
    const result = await processLiveScoring(db, completedGames, week, {
      espnParams: {}
    });

    res.json({
      success: true,
      week,
      message: `Synced records for ${result.gamesUpdated} completed games`,
      ...result
    });

  } catch (error) {
    console.error('❌ Record sync failed:', error);
    res.status(500).json({ error: error.message });
  }
});

exports.debugESPNFull = onRequest(async (req, res) => {
  try {
    const dates = req.query.dates || '20250823';
    
    const espnData = await fetchESPNScoreboard({ dates });
    const events = espnData?.events || [];
    
    // Find the Kansas State game specifically
    const ksGame = events.find(event => {
      const comp = event?.competitions?.[0];
      const competitors = comp?.competitors || [];
      return competitors.some(c => 
        c?.team?.displayName?.includes('Kansas State') || 
        c?.team?.name?.includes('Kansas State')
      );
    });
    
    if (ksGame) {
      const comp = ksGame?.competitions?.[0];
      const competitors = comp?.competitors || [];
      
      res.json({
        found: true,
        fullCompetitors: competitors,
        competitorStructure: competitors.map(c => ({
          team: c.team?.displayName,
          homeAway: c.homeAway,
          score: c.score,
          records: c.records,  // This is what we're looking for!
          allFields: Object.keys(c)
        }))
      });
    } else {
      res.json({
        found: false,
        message: 'Kansas State game not found',
        allGames: events.map(e => {
          const comp = e?.competitions?.[0];
          const competitors = comp?.competitors || [];
          return {
            homeTeam: competitors.find(c => c.homeAway === 'home')?.team?.displayName,
            awayTeam: competitors.find(c => c.homeAway === 'away')?.team?.displayName,
          };
        })
      });
    }
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});