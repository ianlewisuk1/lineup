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

// FIXED team name normalization - preserves State distinctions and handles ESPN patterns  
function baseNorm(s) {
  if (!s) return '';
  
  // Handle Miami (OH) specially to preserve distinction
  let normalized = s;
  if (s.includes('Miami') && s.includes('(OH)')) {
    normalized = s.replace(/\(OH\)/g, 'OH'); 
  }
  
  // CRITICAL: Handle State schools before general normalization to preserve distinctions
  const stateSchoolMappings = {
    // ESPN shortDisplayName patterns
    'Jax State': 'jacksonvillestate',  // FIXED: Match Firestore normalization
    'SF Austin': 'stephenfaustin',
    'Delaware St': 'delawarestate',    // FIXED: Match Firestore normalization  
    'Oklahoma St': 'oklahomastate',    // FIXED: Match Firestore normalization
    'Kansas St': 'kansasstate',        // FIXED: Match Firestore normalization
    'Alabama St': 'alabama',
    'Arkansas St': 'arkansas', 
    'Mississippi St': 'mississippi',
    'Michigan St': 'michigan',
    'Illinois St': 'illinois',
    'Colorado St': 'colorado',
    'Oregon St': 'oregon',
    'Washington St': 'washington',
    'Arizona St': 'arizona',
    'Florida St': 'florida',
    'Georgia St': 'georgia',
    'NC State': 'nc',
    'Penn State': 'penn',
    'Fresno St': 'fresno',
    'San Diego St': 'sandiego',
    'San José St': 'sanjose',
    'Boise St': 'boise',
    'Utah State': 'utah',
    'Iowa State': 'iowa',           // Critical: Iowa State vs Iowa
    
    // ESPN displayName patterns  
    'Jacksonville State Gamecocks': 'jacksonvillestate',  // FIXED: Match Firestore normalization
    'Stephen F. Austin Lumberjacks': 'stephenfaustin', 
    'Delaware State Hornets': 'delawarestate',           // FIXED: Match Firestore normalization
    'Oklahoma State Cowboys': 'oklahomastate',           // FIXED: Match Firestore normalization
    'Kansas State Wildcats': 'kansasstate',             // FIXED: Match Firestore normalization
    'Alabama State Hornets': 'alabamastate',            // FIXED: Alabama State vs Alabama
    'Arkansas State Red Wolves': 'arkansasstate',       // FIXED: Match Firestore normalization
    'Mississippi State Bulldogs': 'mississippi',
    'Michigan State Spartans': 'michigan', 
    'Illinois State Redbirds': 'illinois',
    'Colorado State Rams': 'colorado',
    'Oregon State Beavers': 'oregon',
    'Washington State Cougars': 'washington',
    'Arizona State Sun Devils': 'arizona',
    'Florida State Seminoles': 'florida',
    'Georgia State Panthers': 'georgia',
    'Iowa State Cyclones': 'iowa',
    'Utah State Aggies': 'utah',
    
    // Handle the tricky ones
    'UCF Knights': 'centralflorida',
    'Houston Cougars': 'houston',
    'Sam Houston Bearkats': 'samhouston',
    'UT Martin Skyhawks': 'utmartin',
    'UAB Blazers': 'uab',                    // NEW: UAB should match directly
  };
  
  // Check for exact state school mapping first
  const exactMatch = stateSchoolMappings[s];
  if (exactMatch) return exactMatch;
  
  return normalized
    .replace(/\([^)]*\)/g, ' ')                         
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')   
    .replace(/&/g, ' and ')
    .replace(/\b(university|the|of|at)\b/gi, ' ')       // Remove institutional words but keep State
    
    // Strip mascot names
    .replace(/\b(wildcats|cyclones|rebels|bengals|jayhawks|bulldogs|hilltoppers|bearkats|warriors|cardinal|tigers|eagles|bears|wolves|panthers|lions|hawks|falcons|owls|rams|bulls|cougars|broncos|mustangs|stallions|colts|knights|spartans|trojans|fighting|irish|crimson|tide|volunteers|gators|seminoles|hurricanes|demon|deacons|blue|devils|tar|heels|cavaliers|hokies|orange|golden|yellow|jackets|rainbow|fightingirish|warriors|aztecs|bulldogs|badgers|redhawks|gamecocks|skyhawks|lumberjacks|hornets|cowboys|red|wolves|sun|devils|boilermakers|mountaineers|49ers|chanticleers|golden|eagles|mean|green|bobcats|buckeyes|sooners|monarchs|nittany|lions|scarlet|knights|red|flash|bearkats|aztecs|spartans|redhawks|redbirds|cornhuskers|wolf|pack|lobos|aggies|colonels|fighting|hawks|mocs|bearcats|buffaloes|rams|blue|hens|dukes|colonels|chippewas|bison|seawolves|texans|horned|frogs|rockets|green|wave|hurricane|blazers|great|danes|warhawks|minutemen|owls|colonial|crusaders|lumberjacks|leathernecks|seahawks|vandals)\b/gi, ' ')
    
    .replace(/[^a-z0-9]+/gi, '')
    .toLowerCase()
    .trim();
}

// Comprehensive ESPN team aliases based on actual data comparison
const ESPN_TEAM_ALIASES = new Map(Object.entries({
  // Existing working mappings
  'olemiss': 'mississippi',
  'miamifl': 'miami', 
  'miamioh': 'miamioh',
  'miamiohio': 'miamioh',
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
  'notredame': 'notredamefighting',
  'southernmiss': 'southernmississippi',
  'appalachianst': 'appalachianstate',
  
  // CRITICAL: ESPN shortDisplayName → Firestore normalized mappings
  // Based on debug output: ESPN calls them different than Firestore
  'jax': 'jacksonville',              // "Jax State" → "Jacksonville State"
  'sfaustin': 'stephenfaustin',        // "SF Austin" → "Stephen F. Austin"  
  'oklahoma': 'oklahoma',              // "Oklahoma St" → "Oklahoma State" (both normalize to oklahoma)
  'kansas': 'kansas',                  // "Kansas St" → "Kansas State" (both normalize to kansas)
  'delaware': 'delaware',              // Handle Delaware vs Delaware State conflict
  
  // ESPN displayName → Firestore normalized mappings  
  'jacksonville': 'jacksonville',      // "Jacksonville State Gamecocks" → "Jacksonville State"
  'stephenfaustin': 'stephenfaustin',  // "Stephen F. Austin Lumberjacks" → "Stephen F. Austin"
  'oklahoma': 'oklahoma',              // "Oklahoma State Cowboys" → "Oklahoma State"
  'utmartin': 'utmartin',              // "UT Martin Skyhawks" → "UT Martin"
  'centralflorida': 'centralflorida',  // "UCF Knights" → "UCF" 
  'houston': 'houston',                // "Houston Cougars" → "Houston"
  'samhouston': 'samhouston',          // "Sam Houston Bearkats" → "Sam Houston"
  
  // Handle other State school conflicts
  'alabamaaandm': 'alabamaaandm',      // Alabama A&M vs Alabama
  'alabamast': 'alabamast',            // Alabama St vs Alabama  
  'arkansasst': 'arkansasst',          // Arkansas St vs Arkansas
  'mississippist': 'mississippist',    // Mississippi St vs Mississippi
  'michiganst': 'michiganst',          // Michigan St vs Michigan
  'illinoisst': 'illinoisst',          // Illinois St vs Illinois
  'coloradost': 'coloradost',          // Colorado St vs Colorado
  'oregonst': 'oregonst',              // Oregon St vs Oregon
  'washingtonst': 'washingtonst',      // Washington St vs Washington
  
  // ESPN abbreviations → Firestore full names
  'carkansas': 'centralarkansas',      // "C Arkansas"
  'cconnecticut': 'centralconnecticut', // "C Connecticut" 
  'cmichigan': 'centralmichigan',      // "C Michigan"
  'narizona': 'northernarizona',       // "N Arizona"
  'nillinois': 'northernillinois',     // "N Illinois"
  'willinois': 'westernillinois',      // "W Illinois"
  'wmichigan': 'westernmichigan',      // "W Michigan"
  'westernky': 'westernkentucky',      // "Western KY"
  'mtsu': 'middletennessee',           // "MTSU"
}));

function normTeamNameESPN(s) {
  const n = baseNorm(s);
  return ESPN_TEAM_ALIASES.get(n) || n;
}

// Modified keyFor function to support different name field strategies
function keyFor(homeTeam, awayTeam, strategy = 'default') {
  if (!homeTeam || !awayTeam) return null;
  
  // Normalize both team names using ESPN normalization
  const normalizedHome = normTeamNameESPN(homeTeam);
  const normalizedAway = normTeamNameESPN(awayTeam);
  
  return `${normalizedHome}::${normalizedAway}::${strategy}`;
}

/** Build O(1) index of ESPN events by multiple team-name variants */
function buildESPNIndex(espnEvents) {
  const idx = new Map();
  for (const ev of espnEvents || []) {
    const comp = ev?.competitions?.[0];
    if (!comp) continue;
    const homeT = comp.competitors?.find(c => c.homeAway === 'home')?.team;
    const awayT = comp.competitors?.find(c => c.homeAway === 'away')?.team;
    if (!homeT || !awayT) continue;

    // Create keys for different name field strategies
    const shortKey = keyFor(homeT.shortDisplayName, awayT.shortDisplayName, 'short');
    const displayKey = keyFor(homeT.displayName, awayT.displayName, 'display');
    const nameKey = keyFor(homeT.name, awayT.name, 'name');
    
    // Also create reverse keys (away vs home)
    const shortKeyReverse = keyFor(awayT.shortDisplayName, homeT.shortDisplayName, 'short');
    const displayKeyReverse = keyFor(awayT.displayName, homeT.displayName, 'display');
    const nameKeyReverse = keyFor(awayT.name, homeT.name, 'name');
    
    [shortKey, displayKey, nameKey, shortKeyReverse, displayKeyReverse, nameKeyReverse].forEach(k => { 
      if (k) idx.set(k, ev); 
    });
  }
  return idx;
}

/** Enhanced matching with multiple strategies in sequence */
function findMatchingESPNEvent(index, espnEvents, homeTeam, awayTeam) {
  // Strategy 1: Try shortDisplayName (clean names like "Kansas St")
  let ev = index.get(keyFor(homeTeam, awayTeam, 'short'));
  if (ev) return ev;
  ev = index.get(keyFor(awayTeam, homeTeam, 'short')); 
  if (ev) return ev;

  // Strategy 2: Try displayName (full names with mascots like "Kansas State Wildcats")  
  ev = index.get(keyFor(homeTeam, awayTeam, 'display'));
  if (ev) return ev;
  ev = index.get(keyFor(awayTeam, homeTeam, 'display'));
  if (ev) return ev;

  // Strategy 3: Try name field (just mascots like "Wildcats")
  ev = index.get(keyFor(homeTeam, awayTeam, 'name'));
  if (ev) return ev;
  ev = index.get(keyFor(awayTeam, homeTeam, 'name'));
  if (ev) return ev;

  // Strategy 4: Fallback to set-based scan (existing logic as final resort)
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

/**
 * Process team locking for a position group (starters or bench)
 */
function processTeamLockingFixed(currentTeams, existingTeamData, gameStartTimes, now, positionType, userId) {
  const processed = [];
  
  for (let i = 0; i < currentTeams.length; i++) {
    const currentTeam = currentTeams[i];
    const existingTeamEntry = existingTeamData[i] || {};
    
    if (!currentTeam) {
      // Empty slot
      processed.push({ team: null, lockedAt: null });
      continue;
    }
    
    // Check if this team is already locked
    if (existingTeamEntry.lockedAt) {
      // Keep existing locked team (can't change once locked)
      processed.push(existingTeamEntry);
      console.log(`🔒 ${currentTeam} already locked at ${existingTeamEntry.lockedAt}`);
      continue;
    }
    
    // Check if this team's earliest game has started
    const earliestGameTime = gameStartTimes.get(currentTeam);
    
    if (earliestGameTime && now >= earliestGameTime) {
      // Lock this team - their earliest game has started
      const lockedAt = earliestGameTime.toISOString();
      processed.push({ team: currentTeam, lockedAt });
      console.log(`🔒 LOCKING ${currentTeam} for user ${userId} - earliest game started at ${lockedAt}`);
    } else if (earliestGameTime) {
      // Team is still unlocked - update to current roster choice
      processed.push({ team: currentTeam, lockedAt: null });
      console.log(`⏰ ${currentTeam} unlocked - earliest game at ${earliestGameTime.toISOString()} (future)`);
      
      // Log if this is a roster change for an unlocked team
      if (existingTeamEntry.team && existingTeamEntry.team !== currentTeam) {
        console.log(`🔄 ${positionType}[${i}]: ${existingTeamEntry.team} → ${currentTeam} (unlocked)`);
      }
    } else {
      // No game found for this team
      processed.push({ team: currentTeam, lockedAt: null });
      console.log(`❓ ${currentTeam} - no games found in schedule`);
    }
  }
  
  return processed;
}

/** Safer ESPN status parsing */
function parseESPNEvent(espnEvent) {
  const comp = espnEvent?.competitions?.[0];
  const competitors = comp?.competitors || [];
  const home = competitors.find(c => c.homeAway === 'home');
  const away = competitors.find(c => c.homeAway === 'away');

  const homeScore = Number(home?.score ?? 0);
  const awayScore = Number(away?.score ?? 0);

  const getTeamRecord = (competitor) => {
    const records = competitor?.records || [];
    
    const overallRecord = records.find(r => r.name === 'overall' || r.type === 'total');
    const conferenceRecord = records.find(r => r.name === 'conference' || r.type === 'conference' || r.name === 'vs. Conf.');    
    
    return {
      overall: overallRecord?.summary || overallRecord?.displayValue || null,
      conference: conferenceRecord?.summary || conferenceRecord?.displayValue || null
    };
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
    homeRecord,
    awayRecord,
  };
}

const CFBD_API_BASE = 'https://api.collegefootballdata.com';

/** Slug + aliases so Firestore team doc ids are consistent. */
const TEAM_ALIASES = {
  "hawai'i": 'hawaii',
  "hawaii": 'hawaii',
  "miami-oh": 'miami-oh',          // ← CHANGED: map to actual doc ID
  "miami (oh)": 'miami-oh',        // ← CHANGED: map to actual doc ID  
  "umass": 'massachusetts',

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
    
    if (!line) {
      // Still process for next opponent update, just with null spread data
      line = { spread: null, provider: 'no-line-available' };
    }
    
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

exports.debugFirestoreTeams = onRequest(async (req, res) => {
  try {
    const db = admin.firestore();
    const gamesSnap = await db
      .collection('schedule').doc('2025')
      .collection('weeks').doc('1')
      .collection('games')
      .get();
    
    const firestoreTeams = new Set();
    const games = [];
    
    gamesSnap.forEach(doc => {
      const data = doc.data();
      firestoreTeams.add(data.homeTeam);
      firestoreTeams.add(data.awayTeam);
      
      games.push({
        gameId: doc.id,
        homeTeam: data.homeTeam,
        awayTeam: data.awayTeam
      });
    });
    
    res.json({
      totalGames: games.length,
      uniqueTeams: Array.from(firestoreTeams).sort(),
      sampleGames: games.slice(0, 5)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

exports.debugShortDisplayNames = onRequest(async (req, res) => {
  try {
    const espnData = await fetchESPNScoreboard({});
    const events = espnData?.events || [];
    
    // Get all team names from current ESPN feed
    const teamNames = [];
    events.forEach(event => {
      const comp = event?.competitions?.[0];
      const competitors = comp?.competitors || [];
      competitors.forEach(c => {
        teamNames.push({
          displayName: c.team?.displayName,
          shortDisplayName: c.team?.shortDisplayName,
          name: c.team?.name,
          shortNormalized: normTeamNameESPN(c.team?.shortDisplayName || ''),
          displayNormalized: normTeamNameESPN(c.team?.displayName || '')
        });
      });
    });
    
    // Remove duplicates and sort
    const uniqueTeams = teamNames.reduce((acc, team) => {
      const key = team.shortDisplayName;
      if (!acc.find(t => t.shortDisplayName === key)) {
        acc.push(team);
      }
      return acc;
    }, []);
    
    res.json({
      totalTeams: uniqueTeams.length,
      teams: uniqueTeams.sort((a, b) => a.shortDisplayName?.localeCompare(b.shortDisplayName))
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

exports.debugSchedule = onRequest(async (req, res) => {
  try {
    const db = admin.firestore();
    const year = req.query.year || '2025';
    const teamName = req.query.team; // Remove default
    const week = req.query.week || null;
    
    const results = [];
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
          
          // If teamName specified, filter by team; otherwise show all games
          if (!teamName || game.homeTeam === teamName || game.awayTeam === teamName) {
            weekGames.push({
              docId: gameDoc.id,
              week: weekNum,
              homeTeam: game.homeTeam,
              awayTeam: game.awayTeam,
              date: game.date,
              venue: game.venue,
              cfbdGameId: game.cfbdGameId,
              gameComplete: game.gameComplete,
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
    const title = teamName ? `${teamName}` : `All Games`;
    let output = `Schedule Debug for ${title}\n\n`;
    
    results.forEach(weekData => {
      output += `Week ${weekData.week}:\n`;
      weekData.games.forEach((game, index) => {
        output += `  ${index + 1}. ${game.homeTeam} vs ${game.awayTeam}\n`;
        output += `     Date: ${game.date || 'TBD'}\n`;
        output += `     Complete: ${game.gameComplete ? 'Yes' : 'No'}\n`;
        output += `     Doc ID: ${game.docId}\n\n`;
      });
    });
    
    res.json({
      success: true,
      team: teamName || 'All Teams',
      year,
      results,
      formatted: output
    });
    
  } catch (error) {
    console.error('Debug failed:', error);
    res.status(500).json({ error: error.message });
  }
});

exports.debugLiveScoring = onRequest(async (req, res) => {
  try {
    const db = admin.firestore();
    const week = parseInt(req.query.week) || 1;
    
    // Get active games (same logic as triggerLiveScoresSafe)
    const activeGames = await getActiveGames(db, week);
    console.log(`Found ${activeGames.length} active games`);
    
    // Fetch ESPN data
    const espnData = await fetchESPNScoreboard({});
    const espnEvents = espnData?.events || [];
    console.log(`Retrieved ${espnEvents.length} ESPN events`);
    
    // Build ESPN index
    const index = buildESPNIndex(espnEvents);
    console.log(`Built ESPN index with ${index.size} entries`);
    
    // Test matching for each game with detailed strategy breakdown
    const matchResults = [];
    
    for (const game of activeGames) {
      const espnEvent = findMatchingESPNEvent(index, espnEvents, game.homeTeam, game.awayTeam);
      
      // Test each strategy individually for debugging
      const strategyResults = {};
      const strategies = ['short', 'display', 'name'];
      
      strategies.forEach(strategy => {
        const key = keyFor(game.homeTeam, game.awayTeam, strategy);
        const reverseKey = keyFor(game.awayTeam, game.homeTeam, strategy);
        strategyResults[strategy] = {
          key: key,
          reverseKey: reverseKey,
          found: !!(index.get(key) || index.get(reverseKey))
        };
      });
      
      matchResults.push({
        firestoreGame: `${game.homeTeam} vs ${game.awayTeam}`,
        homeTeamNormalized: normTeamNameESPN(game.homeTeam),
        awayTeamNormalized: normTeamNameESPN(game.awayTeam),
        foundESPNMatch: !!espnEvent,
        strategyResults: strategyResults,
        espnGame: espnEvent ? `${espnEvent.competitions[0].competitors.find(c => c.homeAway === 'home')?.team?.displayName} vs ${espnEvent.competitions[0].competitors.find(c => c.homeAway === 'away')?.team?.displayName}` : null,
        workingStrategy: espnEvent ? Object.keys(strategyResults).find(s => strategyResults[s].found) : null
      });
    }
    
    res.json({
      activeGamesFound: activeGames.length,
      espnEventsFound: espnEvents.length,
      indexSize: index.size,
      matchResults,
      totalMatches: matchResults.filter(r => r.foundESPNMatch).length,
      strategySummary: {
        short: matchResults.filter(r => r.strategyResults?.short?.found).length,
        display: matchResults.filter(r => r.strategyResults?.display?.found).length,
        name: matchResults.filter(r => r.strategyResults?.name?.found).length
      }
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

exports.debugESPNTeamNames = onRequest(async (req, res) => {
  try {
    const espnData = await fetchESPNScoreboard({});
    const events = espnData?.events || [];
    
    // Find Miami games
    const miamiGames = events.filter(event => {
      const comp = event?.competitions?.[0];
      const competitors = comp?.competitors || [];
      return competitors.some(c => 
        c?.team?.displayName?.toLowerCase().includes('miami') ||
        c?.team?.name?.toLowerCase().includes('miami')
      );
    });
    
    // Find Wisconsin games  
    const wisconsinGames = events.filter(event => {
      const comp = event?.competitions?.[0];
      const competitors = comp?.competitors || [];
      return competitors.some(c => 
        c?.team?.displayName?.toLowerCase().includes('wisconsin') ||
        c?.team?.name?.toLowerCase().includes('wisconsin')
      );
    });
    
    const results = [];
    
    [...miamiGames, ...wisconsinGames].forEach(event => {
      const comp = event?.competitions?.[0];
      const competitors = comp?.competitors || [];
      competitors.forEach(c => {
        if (c?.team?.displayName?.toLowerCase().includes('miami') || 
            c?.team?.displayName?.toLowerCase().includes('wisconsin')) {
          results.push({
            displayName: c.team.displayName,
            name: c.team.name,
            shortDisplayName: c.team.shortDisplayName,
            normalized: normTeamNameESPN(c.team.displayName)
          });
        }
      });
    });
    
    res.json({ results });
    
  } catch (error) {
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
exports.autoMigrateLineupsTeamLevelFixed = onSchedule(
  { schedule: '*/15 * * * *', timeZone: 'America/New_York' },
  async () => {
    try {
      console.log('🔄 Starting FIXED team-level auto-migration check...');
      
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
      const currentWeekString = String(currentWeek);
      const currentWeekMatch = currentWeekString.match(/\d+/);
      const currentWeekNum = currentWeekMatch ? parseInt(currentWeekMatch[0]) : 1;
      
      console.log(`📅 Current week: ${currentWeekNum}`);
      
      // Check current week and previous week
      const weeksToCheck = [];
      for (let week = Math.max(1, currentWeekNum - 1); week <= currentWeekNum; week++) {
        weeksToCheck.push(week);
      }
      
      for (const week of weeksToCheck) {
        console.log(`🔍 Checking week ${week} for team-level migration...`);
        
        // Get all games for this week with their start times
        const gamesSnap = await db
          .collection('schedule').doc('2025')
          .collection('weeks').doc(week.toString())
          .collection('games')
          .get();
        
        // FIXED: Use earliest game time for teams with multiple games
        const gameStartTimes = new Map(); // team -> earliest game start time
        
        gamesSnap.forEach(gameDoc => {
          const game = gameDoc.data();
          if (game.date && game.homeTeam && game.awayTeam) {
            const gameStartTime = new Date(game.date);
            
            // Check home team
            const currentHomeTime = gameStartTimes.get(game.homeTeam);
            if (!currentHomeTime || gameStartTime < currentHomeTime) {
              gameStartTimes.set(game.homeTeam, gameStartTime);
              console.log(`🏠 ${game.homeTeam}: Updated earliest game to ${gameStartTime.toISOString()}`);
            }
            
            // Check away team  
            const currentAwayTime = gameStartTimes.get(game.awayTeam);
            if (!currentAwayTime || gameStartTime < currentAwayTime) {
              gameStartTimes.set(game.awayTeam, gameStartTime);
              console.log(`🛫 ${game.awayTeam}: Updated earliest game to ${gameStartTime.toISOString()}`);
            }
          }
        });
        
        if (gameStartTimes.size === 0) {
          console.log(`⏭️ Week ${week}: No games found, skipping`);
          continue;
        }
        
        console.log(`📊 Game start times for week ${week}:`);
        gameStartTimes.forEach((time, team) => {
          const isPast = now >= time;
          console.log(`  ${team}: ${time.toISOString()} ${isPast ? '(PAST - SHOULD LOCK)' : '(FUTURE - UNLOCKED)'}`);
        });
        
        // Get all leagues and process team-level locks
        const leaguesSnap = await db.collection('leagues').get();
        
        for (const leagueDoc of leaguesSnap.docs) {
          const leagueId = leagueDoc.id;
          await migrateLeagueWeekTeamLevelFixed(db, leagueId, week, gameStartTimes, now);
        }
      }
      
      console.log('✅ FIXED team-level auto-migration check completed');
      
    } catch (error) {
      console.error('❌ FIXED team-level auto-migration failed:', error);
    }
  }
);

/**
 * Manual trigger for team-level migration testing
 */
exports.triggerTeamLevelMigrationFixed = onRequest(async (req, res) => {
  try {
    const week = parseInt(req.query.week) || null;
    const leagueId = req.query.leagueId || null;
    
    if (!week) {
      return res.status(400).json({ error: 'Week parameter required' });
    }
    
    console.log(`🔧 Manual FIXED team-level migration trigger: Week ${week}, League: ${leagueId || 'all'}`);
    
    const db = admin.firestore();
    const now = new Date();
    
    // Get game start times for this week with FIXED logic
    const gamesSnap = await db
      .collection('schedule').doc('2025')
      .collection('weeks').doc(week.toString())
      .collection('games')
      .get();
    
    // FIXED: Use earliest game time for teams with multiple games
    const gameStartTimes = new Map();
    
    gamesSnap.forEach(gameDoc => {
      const game = gameDoc.data();
      if (game.date && game.homeTeam && game.awayTeam) {
        const gameStartTime = new Date(game.date);
        
        // Check home team - use earliest game
        const currentHomeTime = gameStartTimes.get(game.homeTeam);
        if (!currentHomeTime || gameStartTime < currentHomeTime) {
          gameStartTimes.set(game.homeTeam, gameStartTime);
        }
        
        // Check away team - use earliest game
        const currentAwayTime = gameStartTimes.get(game.awayTeam);
        if (!currentAwayTime || gameStartTime < currentAwayTime) {
          gameStartTimes.set(game.awayTeam, gameStartTime);
        }
      }
    });
    
    console.log(`📊 FIXED Game start times (earliest for each team):`);
    gameStartTimes.forEach((time, team) => {
      const isPast = now >= time;
      console.log(`  ${team}: ${time.toISOString()} ${isPast ? '(SHOULD LOCK)' : '(UNLOCKED)'}`);
    });
    
    if (gameStartTimes.size === 0) {
      return res.status(400).json({ error: `No games found for week ${week}` });
    }
    
    if (leagueId) {
      // Migrate specific league
      await migrateLeagueWeekTeamLevelFixed(db, leagueId, week, gameStartTimes, now);
      res.json({ success: true, message: `FIXED team-level migration completed for league ${leagueId}, week ${week}` });
    } else {
      // Migrate all leagues
      const leaguesSnap = await db.collection('leagues').get();
      
      for (const leagueDoc of leaguesSnap.docs) {
        await migrateLeagueWeekTeamLevelFixed(db, leagueDoc.id, week, gameStartTimes, now);
      }
      
      res.json({ success: true, message: `FIXED team-level migration completed for all leagues, week ${week}` });
    }
    
  } catch (error) {
    console.error('❌ Manual FIXED team-level migration failed:', error);
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
 * Team-level migration logic - locks individual teams when their games start
 */
async function migrateLeagueWeekTeamLevelFixed(db, leagueId, week, gameStartTimes, now) {
  try {
    console.log(`📋 FIXED team-level migration for league ${leagueId}, week ${week}`);
    
    // Get all members in this league
    const membersSnap = await db
      .collection('leagues').doc(leagueId)
      .collection('members')
      .get();
    
    const batch = db.batch();
    let updatedCount = 0;
    
    for (const memberDoc of membersSnap.docs) {
      const userId = memberDoc.id;
      const memberData = memberDoc.data();
      
      // Get current lineup
      const currentLineup = memberData.lineup || {
        starters: Array(5).fill(null),
        bench: Array(2).fill(null)
      };
      
      // Get existing weekly data
      const weeklyLineupsRef = db
        .collection('leagues').doc(leagueId)
        .collection('weeklyLineups').doc(userId);
      
      const weeklyLineupsSnap = await weeklyLineupsRef.get();
      const existingWeeklyData = weeklyLineupsSnap.exists ? weeklyLineupsSnap.data() : {};
      const weekKey = `week${week}`;
      const existingWeekData = existingWeeklyData[weekKey] || {};
      
      // Process starters with FIXED team-level locking
      const processedStarters = processTeamLockingFixed(
        currentLineup.starters || [], 
        existingWeekData.starters || [], 
        gameStartTimes, 
        now,
        'starters',
        userId
      );
      
      // Process bench with FIXED team-level locking  
      const processedBench = processTeamLockingFixed(
        currentLineup.bench || [], 
        existingWeekData.bench || [], 
        gameStartTimes, 
        now,
        'bench',
        userId
      );
      
      // Check if any updates were made
      const hasUpdates = JSON.stringify(processedStarters) !== JSON.stringify(existingWeekData.starters || []) ||
                        JSON.stringify(processedBench) !== JSON.stringify(existingWeekData.bench || []);
      
      if (hasUpdates) {
        // Prepare weekly lineup data with team-level locks
        const weeklyLineupData = {
          starters: processedStarters,
          bench: processedBench,
          lastUpdated: admin.firestore.FieldValue.serverTimestamp()
        };
        
        // Add migration timestamp if this is the first time we're creating this week
        if (!existingWeekData.migratedAt) {
          weeklyLineupData.migratedAt = admin.firestore.FieldValue.serverTimestamp();
        }
        
        // Update the weekly lineups document
        batch.set(weeklyLineupsRef, {
          ...existingWeeklyData,
          [weekKey]: weeklyLineupData
        });
        
        updatedCount++;
        console.log(`📦 Updated team locks for user ${userId}, week ${week}`);
      }
    }
    
    // Execute batch
    if (updatedCount > 0) {
      await batch.commit();
      console.log(`✅ Updated ${updatedCount} lineups with FIXED team-level locks for league ${leagueId}, week ${week}`);
    } else {
      console.log(`📋 No team-level updates needed for league ${leagueId}, week ${week}`);
    }
    
  } catch (error) {
    console.error(`❌ Error in FIXED team-level migration for league ${leagueId}, week ${week}:`, error);
  }
}

/**
 * Update team record when game completes
 * @param {BatchWriter} bw - Batch writer
 * @param {FirebaseFirestore} db - Firestore instance
 * @param {string} teamName - Team name
 * @param {Object} recordData - Record data with overall and conference
 */
async function updateTeamRecord(bw, db, teamName, recordData) {
  if (!recordData) return;

  try {
    const slug = slugTeam(teamName);
    const teamRef = db.collection('teams').doc(slug);
    
    const teamSnap = await teamRef.get();
    if (!teamSnap.exists) {
      console.warn(`⚠️ Team document not found: ${teamName}`);
      return;
    }

    const updateData = {
      'currentSeason.recordLastUpdated': admin.firestore.FieldValue.serverTimestamp(),
    };

    // Update overall record
    if (recordData.overall) {
      updateData['currentSeason.record'] = recordData.overall;
    }

    // Update conference record  
    if (recordData.conference) {
      updateData['currentSeason.confRecord'] = recordData.conference;
    }

    bw.update(teamRef, updateData);
    console.log(`📊 Updated ${teamName} - Overall: ${recordData.overall}, Conference: ${recordData.conference}`);

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
 * Live scoring processor using ESPN (hardened with duplicate prevention)
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

    const homeResult = calculateTeamFantasyPoints(
      homeScore > awayScore,
      homeMargin,
      homeSpread,
      game.homeTeam
    );

    const awayResult = calculateTeamFantasyPoints(
      awayScore > homeScore,
      awayMargin,
      -homeSpread,
      game.awayTeam
    );

    // FIXED: Check if this is a newly completed game to prevent duplicate ATS/scoring updates
    const isNewlyComplete = isComplete && !game.gameComplete;

    await updateTeamWeeklyPoints(bw, db, game.homeTeam, homeResult.points, week, isNewlyComplete, 
      homeResult.coverPoints, homeScore > awayScore, homeScore, awayScore);
    await updateTeamWeeklyPoints(bw, db, game.awayTeam, awayResult.points, week, isNewlyComplete, 
      awayResult.coverPoints, awayScore > homeScore, awayScore, homeScore);
    teamsUpdated += 2;

    if (isNewlyComplete) {
      completedTeams.add(game.homeTeam);
      completedTeams.add(game.awayTeam);
      gameUpdates.gameComplete = true;
      gameUpdates.finalScore = { home: homeScore, away: awayScore };
      gamesCompleted++;
    }

    // Update team records for any completed game (whether newly complete or already complete)
    if (isComplete) {
      if (homeRecord) {
        await updateTeamRecord(bw, db, game.homeTeam, homeRecord);
        console.log(`📊 ${game.homeTeam} records - Overall: ${homeRecord.overall}, Conference: ${homeRecord.conference}`);
      }
      if (awayRecord) {
        await updateTeamRecord(bw, db, game.awayTeam, awayRecord);
        console.log(`📊 ${game.awayTeam} records - Overall: ${awayRecord.overall}, Conference: ${awayRecord.conference}`);
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
 */
  function calculateTeamFantasyPoints(won, actualMargin, teamSpread, teamName) {
    // Base points: +5 for win, -3 for loss
    const basePoints = won ? 5 : -3;
    
    // Underdog bonus: +3 additional points if team was underdog AND won
    const wasUnderdog = teamSpread > 0;
    const underdogBonus = won && wasUnderdog ? 3 : 0;
    
    // Cover calculation
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
    } else if (coverPoints >= 0.5) {
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
    
    return {
      points: totalPoints,
      coverPoints: coverPoints
    };
  }

/**
 * Update team document with weekly fantasy points (FIXED: Duplicate prevention + proper data types)
 */
async function updateTeamWeeklyPoints(bw, db, teamName, points, week, isNewlyComplete, coverPoints, teamWon, teamScore, opponentScore) {
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
   
   // NEW: Add game completion status to team document
   if (isNewlyComplete) {
     updateData['currentSeason.gameComplete'] = true;
     updateData['currentSeason.gameStatus'] = 'final';
   }
   
   // FIXED: Update ATS record if it's missing (regardless of isNewlyComplete)
   const currentAtsWins = teamData.currentSeason?.atsWins || 0;
   const currentAtsLosses = teamData.currentSeason?.atsLosses || 0;
   const hasATSStats = currentAtsWins > 0 || currentAtsLosses > 0;
   
   if (!hasATSStats && typeof coverPoints === 'number') {
     // This team has no ATS stats yet - add them now
     const covered = coverPoints >= 1;
     
     if (covered) {
       updateData['currentSeason.atsWins'] = 1;
       updateData['currentSeason.atsLosses'] = 0;
       updateData['currentSeason.atsRecord'] = '1-0';
     } else {
       updateData['currentSeason.atsWins'] = 0;
       updateData['currentSeason.atsLosses'] = 1;
       updateData['currentSeason.atsRecord'] = '0-1';
     }
     
     console.log(`📊 ATS Stats Added for ${teamName}: ${covered ? 'COVERED' : 'FAILED'} (${covered ? '1-0' : '0-1'})`);
   }

   // FIXED: Update actual scoring if it's missing (regardless of isNewlyComplete)
   const currentPointsFor = Number(teamData.currentSeason?.totalPointsFor || 0);
   const currentPointsAgainst = Number(teamData.currentSeason?.totalPointsAgainst || 0);
   const hasScoringStats = currentPointsFor > 0 || currentPointsAgainst > 0;
   
   if (!hasScoringStats && typeof teamScore === 'number' && typeof opponentScore === 'number') {
     // This team has no scoring stats yet - add them now
     updateData['currentSeason.totalPointsFor'] = teamScore;
     updateData['currentSeason.totalPointsAgainst'] = opponentScore;
     
     console.log(`📊 Scoring Stats Added for ${teamName}: ${teamScore} pts scored, ${opponentScore} pts allowed`);
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
        
        // Only get STARTERS, not bench players
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
        
        // ADD BONUS POINTS TO SEASON TOTAL
        const bonusPoints = memberData.bonusPoints || 0;
        if (bonusPoints !== 0) {
          memberSeasonTotal += bonusPoints;
          console.log(`  ${bonusPoints > 0 ? '🎁 Added' : '⚠️ Deducted'} ${Math.abs(bonusPoints)} ${bonusPoints > 0 ? 'bonus' : 'penalty'} points to member ${memberDoc.id}`);
        }
        
        // Queue member update
        memberUpdates.push({
          ref: memberDoc.ref,
          points: memberSeasonTotal,
          weeklyPoints: memberCurrentWeekPoints
        });
        
        console.log(`📊 Member ${memberDoc.id} FINAL: ${memberSeasonTotal} season pts (${starterTeams.length} starters${bonusPoints > 0 ? ` + ${bonusPoints} bonus` : ''}), ${memberCurrentWeekPoints} week pts`);
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

/**
 * FIXED: Enhanced reset function to clear ALL stats properly
 */
exports.resetAllTeamStats = onRequest(async (req, res) => {
  try {
    const db = admin.firestore();
    const week = parseInt(req.query.week) || 1;
    
    console.log(`🔄 Resetting ALL team stats for week ${week}...`);
    
    const teamsSnap = await db.collection('teams').get();
    const bw = new BatchWriter(db);
    let resetCount = 0;
    
    teamsSnap.forEach(teamDoc => {
      const weekKey = `week${week}`;
      bw.update(teamDoc.ref, {
        // Reset fantasy points
        [`currentSeason.weeklyPoints.${weekKey}`]: 0,
        'currentSeason.gamePoints': 0,
        
        // Reset ATS tracking
        'currentSeason.atsWins': 0,
        'currentSeason.atsLosses': 0,
        'currentSeason.atsRecord': '0-0',
        
        // Reset actual scoring
        'currentSeason.totalPointsFor': 0,
        'currentSeason.totalPointsAgainst': 0,
        
        // Reset averages (will be calculated on frontend)
        'currentSeason.avgPointsFor': '0',
        'currentSeason.avgPointsAgainst': '0',
        
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
      message: `Reset ${resetCount} teams (all stats) and ${membersUpdated} members for week ${week}`
    });
    
  } catch (error) {
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
    const dates = req.query.dates || '20250828'; // Default to today
    const teamFilter = req.query.team; // Optional team filter
    
    const espnData = await fetchESPNScoreboard({ dates });
    const events = espnData?.events || [];
    
    if (teamFilter) {
      // Find specific team if requested
      const teamGame = events.find(event => {
        const comp = event?.competitions?.[0];
        const competitors = comp?.competitors || [];
        return competitors.some(c => 
          c?.team?.displayName?.toLowerCase().includes(teamFilter.toLowerCase()) || 
          c?.team?.name?.toLowerCase().includes(teamFilter.toLowerCase())
        );
      });
      
      if (teamGame) {
        const comp = teamGame?.competitions?.[0];
        const competitors = comp?.competitors || [];
        
        res.json({
          found: true,
          team: teamFilter,
          fullCompetitors: competitors,
          competitorStructure: competitors.map(c => ({
            team: c.team?.displayName,
            homeAway: c.homeAway,
            score: c.score,
            records: c.records,
            allFields: Object.keys(c)
          }))
        });
      } else {
        res.json({
          found: false,
          message: `${teamFilter} game not found`,
          availableGames: events.map(e => {
            const comp = e?.competitions?.[0];
            const competitors = comp?.competitors || [];
            return {
              homeTeam: competitors.find(c => c.homeAway === 'home')?.team?.displayName,
              awayTeam: competitors.find(c => c.homeAway === 'away')?.team?.displayName,
            };
          })
        });
      }
    } else {
      // Show all games
      res.json({
        totalEvents: events.length,
        dateFilter: dates,
        allGames: events.map(e => {
          const comp = e?.competitions?.[0];
          const competitors = comp?.competitors || [];
          const status = comp?.status?.type;
          return {
            homeTeam: competitors.find(c => c.homeAway === 'home')?.team?.displayName,
            awayTeam: competitors.find(c => c.homeAway === 'away')?.team?.displayName,
            homeScore: competitors.find(c => c.homeAway === 'home')?.score,
            awayScore: competitors.find(c => c.homeAway === 'away')?.score,
            status: status?.name,
            completed: status?.completed,
            date: comp?.date
          };
        })
      });
    }
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

exports.debugActiveGames = onRequest(async (req, res) => {
  try {
    const db = admin.firestore();
    const week = parseInt(req.query.week) || 1;
    const now = new Date();
    
    console.log(`Current time: ${now.toISOString()}`);
    
    const gamesSnap = await db
      .collection('schedule').doc('2025')
      .collection('weeks').doc(week.toString())
      .collection('games')
      .get();
    
    const analysis = [];
    let activeCount = 0;
    
    gamesSnap.forEach(doc => {
      const game = doc.data();
      const gameDate = new Date(game.date);
      const hasStarted = gameDate <= now;
      const isComplete = !!game.gameComplete;
      const isActive = hasStarted && !isComplete;
      
      if (isActive) activeCount++;
      
      analysis.push({
        id: doc.id,
        homeTeam: game.homeTeam,
        awayTeam: game.awayTeam,
        date: game.date,
        gameDate: gameDate.toISOString(),
        gameComplete: game.gameComplete,
        hasStarted,
        isComplete,
        isActive,
        timeDiff: now.getTime() - gameDate.getTime()
      });
    });
    
    const activeGames = analysis.filter(g => g.isActive);
    const shouldBeActive = analysis.filter(g => g.hasStarted && !g.isComplete);
    
    res.json({
      currentTime: now.toISOString(),
      totalGames: analysis.length,
      activeGames: activeCount,
      shouldBeActiveCount: shouldBeActive.length,
      activeGamesList: activeGames,
      shouldBeActiveList: shouldBeActive,
      allGames: analysis.sort((a, b) => new Date(a.date) - new Date(b.date))
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

exports.updateAllTeamNextOpponents = onRequest(async (req, res) => {
  try {
    const db = admin.firestore();
    const bw = new BatchWriter(db);
    const now = new Date();
    let teamsUpdated = 0;

    // Get all teams
    const teamsSnap = await db.collection('teams').get();
    
    for (const teamDoc of teamsSnap.docs) {
      const teamName = teamDoc.data().school; // or however you get the display name
      if (!teamName) continue;

      // Find this team's next game from schedule
      const weeksSnap = await db.collection('schedule').doc('2025').collection('weeks').get();
      
      let nextGame = null;
      let earliestDate = null;

      for (const weekDoc of weeksSnap.docs) {
        const gamesSnap = await weekDoc.ref.collection('games').get();
        
        gamesSnap.forEach(gameDoc => {
          const game = gameDoc.data();
          if ((game.homeTeam === teamName || game.awayTeam === teamName) && !game.gameComplete) {
            const gameDate = new Date(game.date);
            if (gameDate > now && (!earliestDate || gameDate < earliestDate)) {
              earliestDate = gameDate;
              const isHome = game.homeTeam === teamName;
              nextGame = {
                opponent: isHome ? game.awayTeam : game.homeTeam,
                date: game.date,
                isHome: isHome,
                spread: game.homeSpread ? (isHome ? game.homeSpread : -game.homeSpread) : null
              };
            }
          }
        });
      }

      if (nextGame) {
        bw.update(teamDoc.ref, {
          'currentSeason.nextOpponent': nextGame.opponent,
          'currentSeason.nextGameDate': nextGame.date,
          'currentSeason.nextGameIsHome': nextGame.isHome,
          'currentSeason.nextOpponentSpread': nextGame.spread,
          'currentSeason.nextOpponentSpreadDisplay': nextGame.spread ? (nextGame.spread > 0 ? `+${nextGame.spread}` : String(nextGame.spread)) : null,
          'currentSeason.updatedAt': admin.firestore.FieldValue.serverTimestamp(),
        });
        teamsUpdated++;
        console.log(`Updated ${teamName}: next vs ${nextGame.opponent}`);
      }
    }

    await bw.commit();
    res.json({ success: true, teamsUpdated });

  } catch (error) {
    console.error('Error updating team next opponents:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add this debug function to your functions/index.js

exports.debugMissingGames = onRequest(async (req, res) => {
  try {
    const espnData = await fetchESPNScoreboard({});
    const events = espnData?.events || [];
    
    // Search for the missing teams
    const missingTeams = ['Jacksonville State', 'Stephen F. Austin', 'Delaware State', 'UT Martin', 'UCF', 'Oklahoma State', 'Houston'];
    const found = [];
    
    events.forEach(event => {
      const comp = event?.competitions?.[0];
      const competitors = comp?.competitors || [];
      competitors.forEach(c => {
        const displayName = c.team?.displayName || '';
        const shortName = c.team?.shortDisplayName || '';
        
        missingTeams.forEach(teamToFind => {
          if (displayName.includes(teamToFind) || shortName.includes(teamToFind) || 
              displayName.toLowerCase().includes(teamToFind.toLowerCase())) {
            found.push({
              searchedFor: teamToFind,
              espnDisplayName: displayName,
              espnShortDisplayName: shortName,
              espnName: c.team?.name,
              normalized: normTeamNameESPN(displayName)
            });
          }
        });
      });
    });
    
    res.json({
      searchedFor: missingTeams,
      foundInESPN: found,
      totalESPNEvents: events.length
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

exports.debugAllTeamsATS = onRequest(async (req, res) => {
  try {
    const db = admin.firestore();
    const week = parseInt(req.query.week) || 1;
    
    console.log(`🔍 Debugging ALL teams ATS issue for week ${week}...`);
    
    // 1. Get all completed games from yesterday
    const gamesSnap = await db
      .collection('schedule').doc('2025')
      .collection('weeks').doc(week.toString())
      .collection('games')
      .where('gameComplete', '==', true)
      .get();
    
    const completedGames = [];
    gamesSnap.forEach(doc => {
      const game = doc.data();
      if (typeof game.homeScore === 'number' && typeof game.awayScore === 'number') {
        completedGames.push({
          id: doc.id,
          ...game
        });
      }
    });
    
    console.log(`🏈 Found ${completedGames.length} completed games with scores`);
    
    // 2. Check team stats for all teams that played
    const teamStats = {};
    const allTeams = new Set();
    
    completedGames.forEach(game => {
      allTeams.add(game.homeTeam);
      allTeams.add(game.awayTeam);
    });
    
    console.log(`👥 Teams that played: ${Array.from(allTeams).join(', ')}`);
    
    // 3. Get current stats for all teams
    for (const teamName of allTeams) {
      try {
        const slug = slugTeam(teamName);
        const teamRef = db.collection('teams').doc(slug);
        const teamSnap = await teamRef.get();
        
        if (teamSnap.exists) {
          const data = teamSnap.data();
          teamStats[teamName] = {
            slug,
            gamePoints: data.currentSeason?.gamePoints || 0,
            atsWins: data.currentSeason?.atsWins || 0,
            atsLosses: data.currentSeason?.atsLosses || 0,
            atsRecord: data.currentSeason?.atsRecord || '0-0',
            totalPointsFor: data.currentSeason?.totalPointsFor || 0,
            totalPointsAgainst: data.currentSeason?.totalPointsAgainst || 0,
            weeklyPoints: data.currentSeason?.weeklyPoints || {},
            confRecord: data.currentSeason?.confRecord || '0-0',
            record: data.currentSeason?.record || '0-0'
          };
        } else {
          teamStats[teamName] = { error: 'Team document not found', slug };
        }
      } catch (error) {
        teamStats[teamName] = { error: error.message };
      }
    }
    
    // 4. Analyze the pattern
    const workingTeams = [];
    const brokenTeams = [];
    
    for (const [teamName, stats] of Object.entries(teamStats)) {
      if (stats.error) {
        brokenTeams.push({ team: teamName, issue: stats.error });
      } else {
        const hasFantasyPoints = stats.gamePoints > 0;
        const hasATSStats = stats.atsWins > 0 || stats.atsLosses > 0;
        const hasActualScoring = stats.totalPointsFor > 0 || stats.totalPointsAgainst > 0;
        
        if (hasFantasyPoints && !hasATSStats && !hasActualScoring) {
          brokenTeams.push({ 
            team: teamName, 
            issue: 'Fantasy points work, but ATS and scoring broken',
            stats 
          });
        } else if (hasFantasyPoints && hasATSStats && hasActualScoring) {
          workingTeams.push({ team: teamName, stats });
        } else {
          brokenTeams.push({ 
            team: teamName, 
            issue: 'Mixed results', 
            hasFantasyPoints,
            hasATSStats,
            hasActualScoring,
            stats 
          });
        }
      }
    }
    
    // 5. Sample one game and trace through the logic
    if (completedGames.length > 0) {
      const sampleGame = completedGames[0];
      console.log(`🔬 Sample game analysis: ${sampleGame.homeTeam} vs ${sampleGame.awayTeam}`);
      
      // Manual calculation for home team
      const homeTeamWon = sampleGame.homeScore > sampleGame.awayScore;
      const homeMargin = sampleGame.homeScore - sampleGame.awayScore;
      const homeSpread = sampleGame.homeSpread || 0;
      
      try {
        const homeResult = calculateTeamFantasyPoints(
          homeTeamWon,
          homeMargin,
          homeSpread,
          sampleGame.homeTeam
        );
        
        console.log(`🧮 Home team (${sampleGame.homeTeam}) calculation:`, {
          won: homeTeamWon,
          margin: homeMargin,
          spread: homeSpread,
          result: homeResult
        });
        
        // Check what type coverPoints is
        console.log(`🔍 Cover points type check:`, {
          coverPoints: homeResult.coverPoints,
          type: typeof homeResult.coverPoints,
          isNumber: typeof homeResult.coverPoints === 'number',
          homeScore: sampleGame.homeScore,
          homeScoreType: typeof sampleGame.homeScore
        });
        
      } catch (calcError) {
        console.log(`❌ Calculation error:`, calcError.message);
      }
    }
    
    console.log(`✅ Working teams: ${workingTeams.length}`);
    console.log(`❌ Broken teams: ${brokenTeams.length}`);
    
    res.json({
      success: true,
      summary: {
        totalGames: completedGames.length,
        totalTeams: allTeams.size,
        workingTeams: workingTeams.length,
        brokenTeams: brokenTeams.length
      },
      games: completedGames,
      teamStats,
      workingTeams,
      brokenTeams,
      message: 'Check console logs for detailed analysis'
    });
    
  } catch (error) {
    console.error('❌ Debug failed:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Manual cleanup function to fix team documents that missed live scoring updates
 * Recalculates all stats based on completed games in the schedule
 */
exports.fixTeamCompletionStatus = onRequest(async (req, res) => {
  try {
    const db = admin.firestore();
    const week = parseInt(req.query.week) || 1;
    
    console.log(`🔧 Fixing team completion status for week ${week}...`);
    
    // Get all completed games for the specified week
    const gamesSnap = await db
      .collection('schedule').doc('2025')
      .collection('weeks').doc(week.toString())
      .collection('games')
      .where('gameComplete', '==', true)
      .get();
    
    if (gamesSnap.empty) {
      return res.json({
        success: true,
        week,
        message: 'No completed games found for this week',
        gamesProcessed: 0
      });
    }
    
    const bw = new BatchWriter(db);
    let teamsUpdated = 0;
    let teamsFixed = 0;
    const processedGames = [];
    
    for (const gameDoc of gamesSnap.docs) {
      const game = gameDoc.data();
      
      // Skip if missing required data
      if (!game.homeTeam || !game.awayTeam || 
          typeof game.homeScore !== 'number' || 
          typeof game.awayScore !== 'number') {
        console.log(`⏭️ Skipping incomplete game data: ${game.homeTeam} vs ${game.awayTeam}`);
        continue;
      }
      
      const homeSpread = game.homeSpread || 0;
      const homeScore = game.homeScore;
      const awayScore = game.awayScore;
      const homeWon = homeScore > awayScore;
      const awayWon = awayScore > homeScore;
      const homeMargin = homeScore - awayScore;
      const awayMargin = awayScore - homeScore;
      
      console.log(`🏈 Processing: ${game.homeTeam} ${homeScore} - ${awayScore} ${game.awayTeam} (Spread: ${homeSpread})`);
      
      // Calculate fantasy points for both teams
      const homeResult = calculateTeamFantasyPoints(homeWon, homeMargin, homeSpread, game.homeTeam);
      const awayResult = calculateTeamFantasyPoints(awayWon, awayMargin, -homeSpread, game.awayTeam);
      
      // Process home team
      const homeTeamFixed = await fixTeamDocument(
        bw, db, game.homeTeam, homeResult.points, homeResult.coverPoints, 
        homeWon, homeScore, awayScore, week
      );
      if (homeTeamFixed) teamsFixed++;
      teamsUpdated++;
      
      // Process away team  
      const awayTeamFixed = await fixTeamDocument(
        bw, db, game.awayTeam, awayResult.points, awayResult.coverPoints,
        awayWon, awayScore, homeScore, week
      );
      if (awayTeamFixed) teamsFixed++;
      teamsUpdated++;
      
      processedGames.push({
        game: `${game.homeTeam} vs ${game.awayTeam}`,
        score: `${homeScore}-${awayScore}`,
        homePoints: homeResult.points,
        awayPoints: awayResult.points
      });
    }
    
    await bw.commit();
    
    console.log(`✅ Fixed ${teamsFixed} teams out of ${teamsUpdated} total teams processed`);
    
    res.json({
      success: true,
      week,
      message: `Fixed completion status for week ${week}`,
      gamesProcessed: processedGames.length,
      teamsProcessed: teamsUpdated,
      teamsFixed: teamsFixed,
      games: processedGames
    });
    
  } catch (error) {
    console.error('❌ Fix team completion status failed:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Fix individual team document with complete recalculation
 */
async function fixTeamDocument(bw, db, teamName, fantasyPoints, coverPoints, teamWon, teamScore, opponentScore, week) {
  try {
    const slug = slugTeam(teamName);
    const teamRef = db.collection('teams').doc(slug);
    
    // Get current team data
    const teamSnap = await teamRef.get();
    if (!teamSnap.exists) {
      console.warn(`Team document not found: ${teamName} (${slug})`);
      return false;
    }
    
    const teamData = teamSnap.data();
    const currentSeason = teamData.currentSeason || {};
    
    // Calculate what the weekly points should be for comparison
    const weekKey = `week${week}`;
    const currentWeeklyPoints = currentSeason.weeklyPoints?.[weekKey] || 0;
    
    // Calculate what gamePoints should be by summing all weekly points
    const allWeeklyPoints = currentSeason.weeklyPoints || {};
    const updatedWeeklyPoints = { ...allWeeklyPoints, [weekKey]: fantasyPoints };
    const expectedGamePoints = Object.values(updatedWeeklyPoints).reduce((sum, pts) => sum + (pts || 0), 0);
    const currentGamePoints = currentSeason.gamePoints || 0;

    // Check if team needs fixing (missing completion flag or incorrect data)
    const needsFixing = 
      !currentSeason.gameComplete || 
      currentSeason.gameStatus !== 'final' ||
      currentSeason.totalPointsFor !== teamScore ||
      currentSeason.totalPointsAgainst !== opponentScore ||
      currentWeeklyPoints !== fantasyPoints ||
      currentGamePoints !== expectedGamePoints;
    
    if (!needsFixing) {
      console.log(`${teamName} already correct, skipping`);
      return false;
    }
    
    console.log(`Fixing ${teamName}:`, {
      was: {
        complete: currentSeason.gameComplete,
        status: currentSeason.gameStatus,
        pointsFor: currentSeason.totalPointsFor,
        pointsAgainst: currentSeason.totalPointsAgainst,
        weeklyPoints: currentWeeklyPoints,
        gamePoints: currentGamePoints
      },
      fixing: {
        complete: true,
        status: 'final', 
        pointsFor: teamScore,
        pointsAgainst: opponentScore,
        weeklyPoints: fantasyPoints,
        gamePoints: expectedGamePoints
      }
    });
    
    // Calculate season total by summing ALL weekly points (safer than incremental math)
    const newGamePoints = expectedGamePoints;
    
    // Prepare update data
    const updateData = {
      // Game completion status
      'currentSeason.gameComplete': true,
      'currentSeason.gameStatus': 'final',
      
      // Fantasy points
      [`currentSeason.weeklyPoints.${weekKey}`]: fantasyPoints,
      'currentSeason.gamePoints': newGamePoints,
      
      // Actual scoring
      'currentSeason.totalPointsFor': teamScore,
      'currentSeason.totalPointsAgainst': opponentScore,
      
      // Update timestamps
      'currentSeason.lastPointsUpdate': admin.firestore.FieldValue.serverTimestamp(),
      'currentSeason.recordLastUpdated': admin.firestore.FieldValue.serverTimestamp()
    };
    
    // Add ATS record if missing or incorrect
    const currentAtsWins = currentSeason.atsWins || 0;
    const currentAtsLosses = currentSeason.atsLosses || 0;
    const covered = coverPoints >= 1;
    
    // Always set ATS record based on this game (assumes single game per week)
    if (covered) {
      updateData['currentSeason.atsWins'] = 1;
      updateData['currentSeason.atsLosses'] = 0;
      updateData['currentSeason.atsRecord'] = '1-0';
    } else {
      updateData['currentSeason.atsWins'] = 0;
      updateData['currentSeason.atsLosses'] = 1;
      updateData['currentSeason.atsRecord'] = '0-1';
    }
    
    bw.update(teamRef, updateData);
    
    console.log(`${teamName} fixed: ${fantasyPoints} fantasy pts, ${covered ? 'COVERED' : 'FAILED'} spread`);
    return true;
    
  } catch (error) {
    console.error(`Error fixing team ${teamName}:`, error);
    return false;
  }
}

exports.debugMissouriCalculation = onRequest(async (req, res) => {
  try {
    // Missouri's game data
    const homeScore = 61;
    const awayScore = 6; 
    const homeSpread = -38.5;  // Missouri favored by 38.5
    const teamName = "Missouri";
    
    const homeWon = homeScore > awayScore;
    const homeMargin = homeScore - awayScore;
    
    console.log(`Debugging ${teamName} calculation:`);
    console.log(`Score: ${homeScore}-${awayScore}`);
    console.log(`Spread: ${homeSpread}`);
    console.log(`Won: ${homeWon}`);
    console.log(`Margin: ${homeMargin}`);
    
    const result = calculateTeamFantasyPoints(homeWon, homeMargin, homeSpread, teamName);
    
    res.json({
      teamName,
      gameData: { homeScore, awayScore, homeSpread },
      calculation: result,
      expectedPoints: 8,
      actualPointsInFirestore: 6
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

exports.debugTeamCalculation = onRequest(async (req, res) => {
  try {
    const homeTeam = req.query.homeTeam || 'Wisconsin';
    const awayTeam = req.query.awayTeam || 'Miami (OH)';
    const homeScore = parseInt(req.query.homeScore) || 17;
    const awayScore = parseInt(req.query.awayScore) || 0;
    const homeSpread = parseFloat(req.query.homeSpread) || -17.5;
    const debugTeam = req.query.debugTeam || awayTeam;
    
    const homeWon = homeScore > awayScore;
    const awayWon = awayScore > homeScore;
    const homeMargin = homeScore - awayScore;
    const awayMargin = awayScore - homeScore;
    
    console.log(`Debugging ${debugTeam} calculation:`);
    console.log(`Game: ${homeTeam} ${homeScore}-${awayScore} ${awayTeam}`);
    console.log(`Home spread: ${homeSpread}`);
    
    let result;
    if (debugTeam === homeTeam) {
      result = calculateTeamFantasyPoints(homeWon, homeMargin, homeSpread, debugTeam);
    } else {
      result = calculateTeamFantasyPoints(awayWon, awayMargin, -homeSpread, debugTeam);
    }
    
    res.json({
      debugTeam,
      gameData: { homeTeam, awayTeam, homeScore, awayScore, homeSpread },
      calculation: result
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

exports.updateArmySpread = onRequest(async (req, res) => {
  try {
    const db = admin.firestore();
    
    console.log('🎖️ Updating Army team spread specifically...');
    
    // Get current week from global config
    const configSnap = await db.collection('config').doc('season').get();
    if (!configSnap.exists) {
      return res.status(404).json({ error: 'Season config not found' });
    }
    
    const configData = configSnap.data();
    const currentWeek = configData.currentWeek || 1;
    
    console.log(`📅 Current week from config: ${currentWeek}`);
    
    // Find Army's team document
    const armySlug = slugTeam('Army'); // This should be 'army'
    const armyRef = db.collection('teams').doc(armySlug);
    
    const armySnap = await armyRef.get();
    if (!armySnap.exists) {
      return res.status(404).json({ error: `Army team document not found with slug: ${armySlug}` });
    }
    
    const armyData = armySnap.data();
    const teamName = armyData.school || 'Army';
    
    console.log(`📋 Found Army team: ${teamName}`);
    
    // Look for Army's game in the current week specifically
    const gamesSnap = await db
      .collection('schedule').doc('2025')
      .collection('weeks').doc(currentWeek.toString())
      .collection('games')
      .get();
    
    let currentWeekGame = null;
    
    gamesSnap.forEach(gameDoc => {
      const game = gameDoc.data();
      
      // Check if Army is playing in this game
      if (game.homeTeam === teamName || game.awayTeam === teamName) {
        const isHome = game.homeTeam === teamName;
        
        // Calculate spread from Army's perspective
        let armySpread = null;
        let spreadDisplay = null;
        
        if (typeof game.homeSpread === 'number') {
          armySpread = isHome ? game.homeSpread : -game.homeSpread;
          
          // Format display string
          if (armySpread === 0) {
            spreadDisplay = 'PICK';
          } else if (armySpread > 0) {
            spreadDisplay = `+${armySpread}`;
          } else {
            spreadDisplay = String(armySpread);
          }
        }
        
        currentWeekGame = {
          opponent: isHome ? game.awayTeam : game.homeTeam,
          date: game.date,
          isHome: isHome,
          spread: armySpread,
          spreadDisplay: spreadDisplay,
          venue: game.venue,
          week: currentWeek,
          gameComplete: game.gameComplete
        };
        
        console.log(`🏈 Found Army's Week ${currentWeek} game: vs ${currentWeekGame.opponent} on ${currentWeekGame.date}`);
        console.log(`📊 Army spread: ${armySpread} (display: ${spreadDisplay})`);
        console.log(`🏁 Game complete: ${game.gameComplete}`);
      }
    });

    if (!currentWeekGame) {
      return res.status(404).json({ 
        error: `No game found for Army in week ${currentWeek}`,
        teamName: teamName,
        currentWeek: currentWeek
      });
    }

    // Update Army's team document with the current week game info
    const updateData = {
      'currentSeason.nextOpponent': currentWeekGame.opponent,
      'currentSeason.nextGameDate': currentWeekGame.date,
      'currentSeason.nextGameIsHome': currentWeekGame.isHome,
      'currentSeason.nextOpponentSpread': currentWeekGame.spread,
      'currentSeason.nextOpponentSpreadDisplay': currentWeekGame.spreadDisplay,
      'currentSeason.updatedAt': admin.firestore.FieldValue.serverTimestamp(),
    };

    await armyRef.update(updateData);
    
    console.log(`✅ Updated Army spread successfully for week ${currentWeek}`);

    res.json({
      success: true,
      team: teamName,
      currentWeek: currentWeek,
      currentWeekGame: {
        opponent: currentWeekGame.opponent,
        date: currentWeekGame.date,
        isHome: currentWeekGame.isHome,
        spread: currentWeekGame.spread,
        spreadDisplay: currentWeekGame.spreadDisplay,
        venue: currentWeekGame.venue,
        week: currentWeekGame.week,
        gameComplete: currentWeekGame.gameComplete
      },
      message: `Army spread updated successfully for current week ${currentWeek}`
    });

  } catch (error) {
    console.error('❌ Error updating Army spread:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Calculate team records from schedule data and update team documents
 * Works purely from Firestore schedule data without relying on external APIs
 */
exports.updateTeamRecordsFromSchedule = onRequest(async (req, res) => {
  try {
    const db = admin.firestore();
    const week = parseInt(req.query.week);
    const year = req.query.year || '2025';
    
    if (!week) {
      return res.status(400).json({ error: 'Week parameter is required' });
    }
    
    console.log(`Updating team records from schedule data for week ${week}...`);
    
    // Get all completed games for the specified week
    const gamesSnap = await db
      .collection('schedule').doc(year)
      .collection('weeks').doc(week.toString())
      .collection('games')
      .where('gameComplete', '==', true)
      .get();
    
    if (gamesSnap.empty) {
      return res.json({
        success: true,
        message: `No completed games found for week ${week}`,
        week,
        teamsUpdated: 0
      });
    }
    
    // Collect team results
    const teamResults = new Map();
    const processedGames = [];
    
    gamesSnap.forEach(gameDoc => {
      const game = gameDoc.data();
      
      // Validate required fields
      if (!game.homeTeam || !game.awayTeam || 
          typeof game.homeScore !== 'number' || 
          typeof game.awayScore !== 'number') {
        console.log(`Skipping incomplete game: ${game.homeTeam} vs ${game.awayTeam}`);
        return;
      }
      
      const homeWon = game.homeScore > game.awayScore;
      const awayWon = game.awayScore > game.homeScore;
      const isTie = game.homeScore === game.awayScore;
      
      // Initialize team records if not exists
      if (!teamResults.has(game.homeTeam)) {
        teamResults.set(game.homeTeam, {
          wins: 0,
          losses: 0,
          ties: 0,
          confWins: 0,
          confLosses: 0,
          confTies: 0,
          gamesPlayed: 0,
          totalPointsFor: 0,
          totalPointsAgainst: 0,
          conferenceGames: 0
        });
      }
      
      if (!teamResults.has(game.awayTeam)) {
        teamResults.set(game.awayTeam, {
          wins: 0,
          losses: 0,
          ties: 0,
          confWins: 0,
          confLosses: 0,
          confTies: 0,
          gamesPlayed: 0,
          totalPointsFor: 0,
          totalPointsAgainst: 0,
          conferenceGames: 0
        });
      }
      
      const homeStats = teamResults.get(game.homeTeam);
      const awayStats = teamResults.get(game.awayTeam);
      
      // Update game counts and points
      homeStats.gamesPlayed++;
      awayStats.gamesPlayed++;
      homeStats.totalPointsFor += game.homeScore;
      homeStats.totalPointsAgainst += game.awayScore;
      awayStats.totalPointsFor += game.awayScore;
      awayStats.totalPointsAgainst += game.homeScore;
      
      // Check if it's a conference game
      const isConferenceGame = game.conferenceGame === true;
      
      if (isConferenceGame) {
        homeStats.conferenceGames++;
        awayStats.conferenceGames++;
      }
      
      // Update win/loss records
      if (isTie) {
        homeStats.ties++;
        awayStats.ties++;
        if (isConferenceGame) {
          homeStats.confTies++;
          awayStats.confTies++;
        }
      } else if (homeWon) {
        homeStats.wins++;
        awayStats.losses++;
        if (isConferenceGame) {
          homeStats.confWins++;
          awayStats.confLosses++;
        }
      } else {
        homeStats.losses++;
        awayStats.wins++;
        if (isConferenceGame) {
          homeStats.confLosses++;
          awayStats.confWins++;
        }
      }
      
      processedGames.push({
        homeTeam: game.homeTeam,
        awayTeam: game.awayTeam,
        score: `${game.homeScore}-${game.awayScore}`,
        winner: isTie ? 'TIE' : (homeWon ? game.homeTeam : game.awayTeam),
        conferenceGame: isConferenceGame
      });
    });
    
    console.log(`Processed ${processedGames.length} completed games`);
    console.log(`Updating ${teamResults.size} teams`);
    
    // Update team documents
    const bw = new BatchWriter(db);
    let teamsUpdated = 0;
    
    for (const [teamName, stats] of teamResults) {
      try {
        const slug = slugTeam(teamName);
        const teamRef = db.collection('teams').doc(slug);
        
        // Check if team document exists
        const teamSnap = await teamRef.get();
        if (!teamSnap.exists) {
          console.warn(`Team document not found: ${teamName} (${slug})`);
          continue;
        }
        
        // Format records
        const overallRecord = stats.ties > 0 
          ? `${stats.wins}-${stats.losses}-${stats.ties}`
          : `${stats.wins}-${stats.losses}`;
          
        const confRecord = stats.conferenceGames > 0
          ? (stats.confTies > 0 
             ? `${stats.confWins}-${stats.confLosses}-${stats.confTies}`
             : `${stats.confWins}-${stats.confLosses}`)
          : '0-0';
        
        // Calculate averages
        const avgPointsFor = stats.gamesPlayed > 0 
          ? (stats.totalPointsFor / stats.gamesPlayed).toFixed(1)
          : '0.0';
          
        const avgPointsAgainst = stats.gamesPlayed > 0 
          ? (stats.totalPointsAgainst / stats.gamesPlayed).toFixed(1)
          : '0.0';
        
        // Update team document
        const updateData = {
          // Win-loss records
          'currentSeason.record': overallRecord,
          'currentSeason.confRecord': confRecord,
          'currentSeason.wins': stats.wins,
          'currentSeason.losses': stats.losses,
          'currentSeason.ties': stats.ties,
          
          // Conference records
          'currentSeason.confWins': stats.confWins,
          'currentSeason.confLosses': stats.confLosses,
          'currentSeason.confTies': stats.confTies,
          
          // Game statistics
          'currentSeason.gamesPlayed': stats.gamesPlayed,
          'currentSeason.totalPointsFor': stats.totalPointsFor,
          'currentSeason.totalPointsAgainst': stats.totalPointsAgainst,
          
          // Averages
          'currentSeason.avgPointsFor': avgPointsFor,
          'currentSeason.avgPointsAgainst': avgPointsAgainst,
          
          // Update timestamp
          'currentSeason.recordLastUpdated': admin.firestore.FieldValue.serverTimestamp()
        };
        
        bw.update(teamRef, updateData);
        teamsUpdated++;
        
        console.log(`${teamName}: ${overallRecord} overall, ${confRecord} conf, ${avgPointsFor} PPG`);
        
      } catch (error) {
        console.error(`Error updating team ${teamName}:`, error);
      }
    }
    
    await bw.commit();
    
    console.log(`Successfully updated ${teamsUpdated} team records`);
    
    res.json({
      success: true,
      message: `Updated records for ${teamsUpdated} teams from ${processedGames.length} completed games`,
      week,
      year,
      teamsUpdated,
      gamesProcessed: processedGames.length,
      teamResults: Object.fromEntries(
        Array.from(teamResults.entries()).map(([team, stats]) => [
          team,
          {
            record: stats.ties > 0 ? `${stats.wins}-${stats.losses}-${stats.ties}` : `${stats.wins}-${stats.losses}`,
            confRecord: stats.conferenceGames > 0 
              ? (stats.confTies > 0 ? `${stats.confWins}-${stats.confLosses}-${stats.confTies}` : `${stats.confWins}-${stats.confLosses}`)
              : '0-0',
            avgPointsFor: stats.gamesPlayed > 0 ? (stats.totalPointsFor / stats.gamesPlayed).toFixed(1) : '0.0'
          }
        ])
      )
    });
    
  } catch (error) {
    console.error('Error updating team records from schedule:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Scheduled function to update team records from completed games
 * Runs daily at 8 AM ET to catch any games that completed overnight
 */
exports.updateTeamRecordsScheduled = onSchedule(
  { 
    schedule: '0 8 * * *',           // 8 AM daily
    timeZone: 'America/New_York' 
  },
  async () => {
    try {
      console.log('Starting scheduled team records update...');
      
      const db = admin.firestore();
      
      // Get current week from season config
      const seasonSnap = await db.collection('config').doc('season').get();
      if (!seasonSnap.exists) {
        console.log('No season config found');
        return;
      }
      
      const seasonData = seasonSnap.data();
      const currentWeek = seasonData.currentWeek || 1;
      
      // Parse week number if it's a string like "Week 1"
      const getCurrentWeekNumber = () => {
        if (typeof currentWeek === 'number') return currentWeek;
        if (!currentWeek || typeof currentWeek !== 'string') return 1;
        const weekMatch = currentWeek.match(/\d+/);
        return weekMatch ? parseInt(weekMatch[0]) : 1;
      };
      
      const weekNum = getCurrentWeekNumber();
      console.log(`Updating records for week ${weekNum}`);
      
      // Run the same logic as the HTTP function
      const year = '2025';
      
      // Get all completed games for the current week
      const gamesSnap = await db
        .collection('schedule').doc(year)
        .collection('weeks').doc(weekNum.toString())
        .collection('games')
        .where('gameComplete', '==', true)
        .get();
      
      if (gamesSnap.empty) {
        console.log(`No completed games found for week ${weekNum}`);
        return;
      }
      
      // Use the same team results calculation logic
      const teamResults = new Map();
      const processedGames = [];
      
      gamesSnap.forEach(gameDoc => {
        const game = gameDoc.data();
        
        if (!game.homeTeam || !game.awayTeam || 
            typeof game.homeScore !== 'number' || 
            typeof game.awayScore !== 'number') {
          return;
        }
        
        const homeWon = game.homeScore > game.awayScore;
        const awayWon = game.awayScore > game.homeScore;
        const isTie = game.homeScore === game.awayScore;
        
        // Initialize team records
        [game.homeTeam, game.awayTeam].forEach(teamName => {
          if (!teamResults.has(teamName)) {
            teamResults.set(teamName, {
              wins: 0, losses: 0, ties: 0,
              confWins: 0, confLosses: 0, confTies: 0,
              gamesPlayed: 0, totalPointsFor: 0, totalPointsAgainst: 0,
              conferenceGames: 0
            });
          }
        });
        
        const homeStats = teamResults.get(game.homeTeam);
        const awayStats = teamResults.get(game.awayTeam);
        
        // Update stats
        homeStats.gamesPlayed++;
        awayStats.gamesPlayed++;
        homeStats.totalPointsFor += game.homeScore;
        homeStats.totalPointsAgainst += game.awayScore;
        awayStats.totalPointsFor += game.awayScore;
        awayStats.totalPointsAgainst += game.homeScore;
        
        const isConferenceGame = game.conferenceGame === true;
        if (isConferenceGame) {
          homeStats.conferenceGames++;
          awayStats.conferenceGames++;
        }
        
        // Update records
        if (isTie) {
          homeStats.ties++;
          awayStats.ties++;
          if (isConferenceGame) {
            homeStats.confTies++;
            awayStats.confTies++;
          }
        } else if (homeWon) {
          homeStats.wins++;
          awayStats.losses++;
          if (isConferenceGame) {
            homeStats.confWins++;
            awayStats.confLosses++;
          }
        } else {
          homeStats.losses++;
          awayStats.wins++;
          if (isConferenceGame) {
            homeStats.confLosses++;
            awayStats.confWins++;
          }
        }
        
        processedGames.push({
          homeTeam: game.homeTeam,
          awayTeam: game.awayTeam,
          score: `${game.homeScore}-${game.awayScore}`
        });
      });
      
      // Update team documents
      const bw = new BatchWriter(db);
      let teamsUpdated = 0;
      
      for (const [teamName, stats] of teamResults) {
        try {
          const slug = slugTeam(teamName);
          const teamRef = db.collection('teams').doc(slug);
          
          const teamSnap = await teamRef.get();
          if (!teamSnap.exists) continue;
          
          const overallRecord = stats.ties > 0 
            ? `${stats.wins}-${stats.losses}-${stats.ties}`
            : `${stats.wins}-${stats.losses}`;
            
          const confRecord = stats.conferenceGames > 0
            ? (stats.confTies > 0 
               ? `${stats.confWins}-${stats.confLosses}-${stats.confTies}`
               : `${stats.confWins}-${stats.confLosses}`)
            : '0-0';
          
          const avgPointsFor = stats.gamesPlayed > 0 
            ? (stats.totalPointsFor / stats.gamesPlayed).toFixed(1)
            : '0.0';
            
          const avgPointsAgainst = stats.gamesPlayed > 0 
            ? (stats.totalPointsAgainst / stats.gamesPlayed).toFixed(1)
            : '0.0';
          
          const updateData = {
            'currentSeason.record': overallRecord,
            'currentSeason.confRecord': confRecord,
            'currentSeason.wins': stats.wins,
            'currentSeason.losses': stats.losses,
            'currentSeason.ties': stats.ties,
            'currentSeason.confWins': stats.confWins,
            'currentSeason.confLosses': stats.confLosses,
            'currentSeason.confTies': stats.confTies,
            'currentSeason.gamesPlayed': stats.gamesPlayed,
            'currentSeason.totalPointsFor': stats.totalPointsFor,
            'currentSeason.totalPointsAgainst': stats.totalPointsAgainst,
            'currentSeason.avgPointsFor': avgPointsFor,
            'currentSeason.avgPointsAgainst': avgPointsAgainst,
            'currentSeason.recordLastUpdated': admin.firestore.FieldValue.serverTimestamp()
          };
          
          bw.update(teamRef, updateData);
          teamsUpdated++;
          
          console.log(`Updated ${teamName}: ${overallRecord}`);
          
        } catch (error) {
          console.error(`Error updating team ${teamName}:`, error);
        }
      }
      
      await bw.commit();
      
      console.log(`Scheduled team records update complete: ${teamsUpdated} teams updated from ${processedGames.length} games`);
      
      // Log to system collection for monitoring
      try {
        await db.collection('system').doc('team-records-log').collection('daily').add({
          week: weekNum,
          teamsUpdated,
          gamesProcessed: processedGames.length,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          status: 'success'
        });
      } catch (logError) {
        console.warn('Failed to log team records update:', logError);
      }
      
    } catch (error) {
      console.error('Scheduled team records update failed:', error);
      
      // Log failure
      try {
        const db = admin.firestore();
        await db.collection('system').doc('team-records-log').collection('daily').add({
          error: error.message,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          status: 'failed'
        });
      } catch (logError) {
        console.warn('Failed to log team records error:', logError);
      }
    }
  }
);