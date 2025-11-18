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

      // CRITICAL: Handle Michigan State specifically to avoid collision with Michigan
    if (s === 'Michigan State Spartans' || s === 'Michigan St' || s === 'Michigan State') {
      return 'michiganstate';
    }
    
    // CRITICAL: Handle State schools before general normalization to preserve distinctions
    const stateSchoolMappings = {
      // ESPN shortDisplayName patterns
      'Jax State': 'jacksonvillestate',
      'SF Austin': 'stephenfaustin',
      'Delaware St': 'delawarestate',
      'Oklahoma St': 'oklahomastate',
      'Kansas St': 'kansasstate',
      'Alabama St': 'alabama',
      'Arkansas St': 'arkansas', 
      'Mississippi St': 'mississippistate',
      'Michigan St': 'michiganstate',        // FIXED: was 'michigan'
      'Illinois St': 'illinois',
      'Colorado St': 'coloradostate',
      'Oregon St': 'oregonstate',
      'Washington St': 'washingtonstate',
      'Arizona St': 'arizonastate',
      'Florida St': 'floridastate',
      'Georgia St': 'georgiastate',
      'NC State': 'nc',
      'Penn State': 'penn',
      'Fresno St': 'fresno',
      'San Diego St': 'sandiego',
      'San José St': 'sanjose',
      'Boise St': 'boise',
      'Utah State': 'utah',
      'Iowa State': 'iowa',
      'Missouri State': 'missouristate',        // Full name
      'Missouri St': 'missouristate',           // Short name
      'Missouri State Bears': 'missouristate',  // With mascot
      'New Mexico St': 'newmexicostate',
      'New Mexico State': 'newmexicostate', 
      'New Mexico State Aggies': 'newmexicostate',
        
      // ESPN displayName patterns  
      'Jacksonville State Gamecocks': 'jacksonvillestate',
      'Stephen F. Austin Lumberjacks': 'stephenfaustin', 
      'Delaware State Hornets': 'delawarestate',
      'Oklahoma State Cowboys': 'oklahomastate',
      'Kansas State Wildcats': 'kansasstate',
      'Alabama State Hornets': 'alabamastate',
      'Arkansas State Red Wolves': 'arkansasstate',
      'Mississippi State Bulldogs': 'mississippistate',
      'Michigan State Spartans': 'michiganstate', 
      'Illinois State Redbirds': 'illinois',
      'Colorado State Rams': 'coloradostate',
      'Oregon State Beavers': 'oregonstate',
      'Washington State Cougars': 'washingtonstate', 
      'Arizona State Sun Devils': 'arizonastate',
      'Florida State Seminoles': 'floridastate',
      'Georgia State Panthers': 'georgiastate',
      'Iowa State Cyclones': 'iowa',
      'Utah State Aggies': 'utah',
      
      
      // Handle the tricky ones
      'UCF Knights': 'centralflorida',
      'Houston Cougars': 'houston',
      'Sam Houston Bearkats': 'samhouston',
      'UT Martin Skyhawks': 'utmartin',
      'UAB Blazers': 'uab',
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
    'utsa': 'utsa',    
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
    'sanjosest': 'sanjosestate',
    'pennstate': 'penn',
    'indianahoosiers': 'indiana',
    'indianast': 'indianastate',
    'nebraskacornhuskers': 'nebraska',
    'houstonchristianhuskies': 'houstonchristian',
    'coastalcarolinachanticleers': 'coastalcarolina',
    'eastcarolinapirates': 'eastcarolina',
    'mississippistatebulldogs': 'mississippistate',
    'alcornstatebraves': 'alcornstate',
    'cincinnatibearcats': 'cincinnati',
    'northwesternstatedemons': 'northwesternstate',
    'fresnostatebulldogs': 'fresnostate',
    'southernjaguars': 'southern',
    'hawaiirainbowwarriors': 'hawaii',
    'portlandstatevikings': 'portlandstate',
    'georgiastatepanthers': 'georgiastate',
    'murraystateracers': 'murraystate',
    'marshallthunderingherd': 'marshall',
    'easternkentuckycolonels': 'easternkentucky',
    'michiganstatespartans': 'michiganstate',
    'youngstownstatepenguins': 'youngstownstate',
    'woffordterriers': 'wofford',
    'southcarolinastatebulldogs': 'southcarolinastate',
    'gardnerwebbrunnin': 'gardnerwebb',
    'kentstategoldenflashes': 'kentstate',
    'kentstate': 'kentstate',  // In case it sometimes appears without the mascot
    'emichigan': 'easternmichigan',
    'easternmichiganeagles': 'easternmichigan',
    'louisianaragincajuns': 'louisiana',
    'gasouthern': 'georgiasouthern',  // For shortDisplayName "GA Southern"
    'georgiasoutherneagles': 'georgiasouthern',  // For displayName "Georgia Southern Eagles"
    'maineblackbears': 'maine',  // For displayName "Maine Black Bears"
    'southalabamajaguars': 'southalabama',  // For displayName "South Alabama Jaguars"
    'coastal': 'coastalcarolina',  // For shortDisplayName "Coastal" 
    'coastalcarolinachanticleers': 'coastalcarolina',  // For displayName "Coastal Carolina Chanticleers"
    'floridainternational': 'florida-international',  // Note the hyphen
    'fiu': 'florida-international',
    'fiupanthers': 'florida-international',
    'uconnhuskies': 'uconn',  // This one matches
    'utsaroadrunners': 'utsa',  // ESPN normalized → Firestore normalized
    'jax': 'jacksonville',              // "Jax State" → "Jacksonville State"
    'sfaustin': 'stephenfaustin',        // "SF Austin" → "Stephen F. Austin"  
    'oklahoma': 'oklahoma',              // "Oklahoma St" → "Oklahoma State" (both normalize to oklahoma)
    'kansas': 'kansas',                  // "Kansas St" → "Kansas State" (both normalize to kansas)
    'delaware': 'delaware',              // Handle Delaware vs Delaware State conflict
    'arkansasrazorbacks': 'arkansas',
    'pitt': 'pittsburgh',                    // "Pitt" → normalized
    'louisvillecardinals': 'louisville',     // "Louisville Cardinals" → normalized
      // New Mexico State aliases
    'nmstate': 'newmexicostate',
    'newmexicostatefull': 'newmexicostate',
    'newmexicostateaggies': 'newmexicostate',
    // Navy aliases
    'navymidshipmen': 'navy',
    'midshipmen': 'navy',

    // Florida Atlantic aliases
    'floridaatlanticowls': 'floridaatlantic',
    'fau': 'floridaatlantic',
  
    // Make sure regular New Mexico doesn't collide
    'newmexicolobos': 'newmexico',

    // Add these lines to your ESPN_TEAM_ALIASES map:
    'sandiegostate': 'sandiego',                    // "San Diego State Aztecs" → normalized
    'northernillinoishuskies': 'northernillinois',  // "Northern Illinois Huskies" → normalized
    'sandiegost': 'sandiego',                       // "San Diego St" → normalized (shortDisplayName)
    // Add these lines:
    'middletennesseeraiders': 'middletennessee',  // "Middle Tennessee Blue Raiders" → normalized
    'kennesawst': 'kennesawstate',                // "Kennesaw St" → normalized  
    'kennesawstate': 'kennesawstate',             // "Kennesaw State Owls" → normalized
    
    // ESPN displayName → Firestore normalized mappings  
    'jacksonville': 'jacksonville',      // "Jacksonville State Gamecocks" → "Jacksonville State"
    'stephenfaustin': 'stephenfaustin',  // "Stephen F. Austin Lumberjacks" → "Stephen F. Austin"
    'oklahoma': 'oklahoma',              // "Oklahoma State Cowboys" → "Oklahoma State"
    'utmartin': 'utmartin',              // "UT Martin Skyhawks" → "UT Martin"
    'centralflorida': 'centralflorida',  // "UCF Knights" → "UCF" 
    'houston': 'houston',                // "Houston Cougars" → "Houston"
    'samhouston': 'samhouston',          // "Sam Houston Bearkats" → "Sam Houston"
    'michiganwolverines': 'michigan',      // ESPN Michigan → Firestore michigan
    'michiganstatespartans': 'michiganstate',
    
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
      
      let line = game.linesByProvider?.['consensus'] || 
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
    
    // NEW: Get all teams and check for bye weeks
    const allTeamsSnap = await db.collection('teams').get();
    const now = new Date();
    
    for (const teamDoc of allTeamsSnap.docs) {
      const teamData = teamDoc.data();
      const teamName = teamData.school;
      
      if (!teamName) continue;
      
      const teamGamesList = teamGames.get(teamName) || [];
      
      if (teamGamesList.length === 0) {
        // This team has no games - they're on bye
        console.log(`Clearing bye week data for ${teamName}`);
        
        bw.set(teamDoc.ref, {
          currentSeason: {
            nextOpponent: null,
            nextGameDate: null,
            nextGameIsHome: null,
            nextOpponentSpread: null,
            nextOpponentSpreadDisplay: null,
            nextOverUnder: null,
            nextOpponentProvider: null,
            isOnBye: true,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          }
        }, { merge: true });
        
        continue;
      }
      
      // Process teams with games (existing logic)
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
      
      bw.set(teamDoc.ref, {
        currentSeason: {
          nextOpponent: nextGame.opponent ?? null,
          nextGameDate: nextGame.startDate,
          nextGameIsHome: !!nextGame.isHome,
          nextOpponentSpread: spreadNum,
          nextOpponentSpreadDisplay: spreadDisplay,
          nextOverUnder: (typeof nextGame.line.overUnder === 'number') ? nextGame.line.overUnder : null,
          nextOpponentProvider: nextGame.line.provider ?? null,
          isOnBye: false,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }
      }, { merge: true });
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
  /*                        Scheduler: daily automatic ingest                    */
  /* -------------------------------------------------------------------------- */

    exports.cfbIngestLinesScheduled = onSchedule(
    { schedule: '*/20 * * * *', timeZone: 'America/New_York' }, // Every 20 minutes
    async () => {
      try {
        const key = CFB_KEY.value();
        const db = admin.firestore();
        
        // Get current week dynamically from Firestore config
        const seasonSnap = await db.collection('config').doc('season').get();
        if (!seasonSnap.exists) {
          console.error('❌ Season config not found - cannot determine current week');
          return null;
        }
        
        const seasonData = seasonSnap.data();
        let currentWeek = seasonData.currentWeek || 1;
        
        // Handle different week formats (number vs "Week 2" string)
        if (typeof currentWeek === 'string') {
          const weekMatch = currentWeek.match(/\d+/);
          currentWeek = weekMatch ? parseInt(weekMatch[0]) : 1;
        }
        
        console.log(`📅 Dynamic spread ingestion for Week ${currentWeek}`);

        const year = 2025;
        const week = currentWeek;  // Now uses actual current week from config
        const seasonType = 'regular';
        const book = 'consensus';

        const result = await ingestLines({ 
          year, 
          week, 
          seasonType, 
          book, 
          updateTeams: true, 
          updateSchedule: true,  // Enable authoritative schedule management with spreads
          key 
        });
        
        console.log(`✅ Scheduled spread ingestion complete for Week ${week}:`, result);
        return null;
      } catch (e) {
        console.error('❌ cfbIngestLinesScheduled error:', e);
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
    const searchTeam = req.query.team; // Get team from query parameter
    const espnData = await fetchESPNScoreboard({});
    const events = espnData?.events || [];
    
    if (searchTeam) {
      // Search for specific team
      const teamGames = events.filter(event => {
        const comp = event?.competitions?.[0];
        const competitors = comp?.competitors || [];
        return competitors.some(c => 
          c?.team?.displayName?.toLowerCase().includes(searchTeam.toLowerCase()) ||
          c?.team?.name?.toLowerCase().includes(searchTeam.toLowerCase()) ||
          c?.team?.shortDisplayName?.toLowerCase().includes(searchTeam.toLowerCase())
        );
      });
      
      const results = [];
      
      teamGames.forEach(event => {
        const comp = event?.competitions?.[0];
        const competitors = comp?.competitors || [];
        competitors.forEach(c => {
          if (c?.team?.displayName?.toLowerCase().includes(searchTeam.toLowerCase()) ||
              c?.team?.name?.toLowerCase().includes(searchTeam.toLowerCase()) ||
              c?.team?.shortDisplayName?.toLowerCase().includes(searchTeam.toLowerCase())) {
            results.push({
              displayName: c.team.displayName,
              name: c.team.name,
              shortDisplayName: c.team.shortDisplayName,
              normalized: normTeamNameESPN(c.team.displayName)
            });
          }
        });
      });
      
      res.json({ 
        searchedFor: searchTeam,
        results,
        totalGamesFound: teamGames.length 
      });
      
    } else {
      // No specific team - show all unique teams
      const allTeams = [];
      const seenTeams = new Set();
      
      events.forEach(event => {
        const comp = event?.competitions?.[0];
        const competitors = comp?.competitors || [];
        competitors.forEach(c => {
          const teamKey = c.team?.displayName;
          if (teamKey && !seenTeams.has(teamKey)) {
            seenTeams.add(teamKey);
            allTeams.push({
              displayName: c.team.displayName,
              name: c.team.name,
              shortDisplayName: c.team.shortDisplayName,
              normalized: normTeamNameESPN(c.team.displayName)
            });
          }
        });
      });
      
      res.json({ 
        message: "All unique teams in ESPN feed",
        totalTeams: allTeams.length,
        results: allTeams.sort((a, b) => a.displayName.localeCompare(b.displayName))
      });
    }
    
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
  /*                     Auto-Migration Helper Functions                         */
  /* -------------------------------------------------------------------------- */

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

      await updateTeamWeeklyPointsBase(bw, db, game.homeTeam, homeResult.points, week, isNewlyComplete, 
        homeResult.coverPoints, homeScore > awayScore, homeScore, awayScore);
      await updateTeamWeeklyPointsBase(bw, db, game.awayTeam, awayResult.points, week, isNewlyComplete, 
        awayResult.coverPoints, awayScore > homeScore, awayScore, homeScore);

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

    // NEW: Recalculate ATS records if games were completed
    if (gamesCompleted > 0) {
      console.log(`🎯 Recalculating ATS records after ${gamesCompleted} games completed`);
      try {
        const { teamRecords } = await calculateATSRecordsFromGames(db, '2025');
        if (teamRecords.size > 0) {
          const atsBw = new BatchWriter(db);
          const { teamsUpdated: atsTeamsUpdated } = await updateTeamATSFromCalculation(atsBw, db, teamRecords);
          await atsBw.commit();
          console.log(`✅ Updated ATS records for ${atsTeamsUpdated} teams after game completions`);
        }
      } catch (atsError) {
        console.error('❌ ATS recalculation failed after game completion:', atsError);
        // Don't throw - let the rest of live scoring continue
      }
    }

    if (gamesUpdated > 0) {
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
      if (Math.abs(coverPoints) < 0.5) {
        // Push - within 0.5 points of the spread
        spreadPoints = 0;        // Neutral, no penalty or bonus
      } else if (coverPoints >= 20) {
        spreadPoints = 5;        // Covered by 20+ points
      } else if (coverPoints >= 14.5) {
        spreadPoints = 3;        // Covered by 14.5-19.5 points  
      } else if (coverPoints >= 7.5) {
        spreadPoints = 2;        // Covered by 7.5-14 points
      } else if (coverPoints >= 0.5) {
        spreadPoints = 1;        // Covered by 0.5-7 points
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
          spreadPoints = -1;     // Failed by 0.5-7 points
        }
      }
      
      const totalPoints = basePoints + underdogBonus + spreadPoints;
      
      console.log(`🧮 ${teamName}: Base ${basePoints} + Underdog ${underdogBonus} + Spread ${spreadPoints} = ${totalPoints} (cover: ${coverPoints}, spread: ${teamSpread})`);
      
      return {
        points: totalPoints,
        coverPoints: coverPoints
      };
  }

  async function updateTeamWeeklyPointsBase(bw, db, teamName, basePoints, week, isNewlyComplete, coverPoints, teamWon, teamScore, opponentScore) {
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
            points: basePoints,
            when: admin.firestore.FieldValue.serverTimestamp(),
          });
        } catch (e) {
          console.warn('[updateTeamWeeklyPointsBase] miss log failed', teamName, e);
        }
        return;
      }
      
      const teamData = teamSnap.data();
      const currentWeeklyPoints = teamData.currentSeason?.weeklyPoints || {};
      const currentGamePoints = teamData.currentSeason?.gamePoints || 0;
      
      // Update weekly points for this week (BASE POINTS ONLY)
      const weekKey = `week${week}`;
      const previousWeekPoints = currentWeeklyPoints[weekKey] || 0;
      
      // Calculate new season total (remove old week points, add new week points)
      const newGamePoints = currentGamePoints - previousWeekPoints + basePoints;
      
      // Prepare update object - NO MULTIPLIERS HERE
      const updateData = {
        [`currentSeason.weeklyPoints.${weekKey}`]: basePoints,  // STORE BASE POINTS ONLY
        'currentSeason.gamePoints': newGamePoints,
        'currentSeason.lastPointsUpdate': admin.firestore.FieldValue.serverTimestamp(),
      };
      
      // Add game completion status to team document
      if (isNewlyComplete) {
        updateData['currentSeason.gameComplete'] = true;
        updateData['currentSeason.gameStatus'] = 'final';
      }

      // Update actual scoring if it's missing
      const currentPointsFor = Number(teamData.currentSeason?.totalPointsFor || 0);
      const currentPointsAgainst = Number(teamData.currentSeason?.totalPointsAgainst || 0);
      const hasScoringStats = currentPointsFor > 0 || currentPointsAgainst > 0;
      
      if (!hasScoringStats && typeof teamScore === 'number' && typeof opponentScore === 'number') {
        updateData['currentSeason.totalPointsFor'] = teamScore;
        updateData['currentSeason.totalPointsAgainst'] = opponentScore;
        console.log(`📊 Scoring Stats Added for ${teamName}: ${teamScore} pts scored, ${opponentScore} pts allowed`);
      }
      
      bw.update(teamRef, updateData);
      
      console.log(`📝 Updated ${teamName}: Week ${week}: ${basePoints} BASE pts, Season total: ${newGamePoints} pts`);
      
    } catch (error) {
      console.error(`Error updating weekly points for ${teamName}:`, error);
    }
  }

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
          const userId = memberDoc.id;
          const lineup = memberData.lineup || {};
          
          // Only get STARTERS
          const starterTeams = (lineup.starters || [])
            .filter(teamName => teamName && teamName.trim() !== '');
          
          if (starterTeams.length === 0) {
            console.log(`⏭️ Member ${userId} has no starter teams, skipping`);
            continue;
          }
          
          // Get captain and trip play from member document
          const captainTeam = memberData.lineup?.captain || null;
          const tripPlayTeam = memberData.lineup?.tripPlayTeam || null;
          
          console.log(`📝 Member ${userId} has ${starterTeams.length} starters: [${starterTeams.join(', ')}]${captainTeam ? ` - Captain: ${captainTeam}` : ''}${tripPlayTeam ? ` - Trip Play: ${tripPlayTeam}` : ''}`);
          
          // FIXED: Get most recent complete week's total (single source of truth)
          let baselinePoints = 0;
          const mostRecentCompleteWeek = currentWeek - 1;
          
          if (mostRecentCompleteWeek >= 1) {
            try {
              const weeklyStandingsRef = db.collection('leagues').doc(leagueId).collection('weeklyStandings').doc(userId);
              const weeklyStandingsSnap = await weeklyStandingsRef.get();
              
              if (weeklyStandingsSnap.exists) {
                const standingsData = weeklyStandingsSnap.data();
                const recentWeekData = standingsData[`week${mostRecentCompleteWeek}`];
                
                if (recentWeekData && typeof recentWeekData.points === 'number') {
                  baselinePoints = recentWeekData.points;
                  console.log(`📋 Week ${mostRecentCompleteWeek} baseline from snapshot: ${baselinePoints} points`);
                } else {
                  console.warn(`No valid Week ${mostRecentCompleteWeek} snapshot for ${userId}, using 0 baseline`);
                }
              } else {
                console.warn(`No weeklyStandings document for ${userId}, using 0 baseline`);
              }
            } catch (error) {
              console.error(`Error getting Week ${mostRecentCompleteWeek} baseline for ${userId}:`, error);
            }
          } else {
            console.log(`Week ${currentWeek} is first week, starting from 0 baseline`);
          }
          
          // Calculate current week activity WITH MULTIPLIERS
          let currentWeekPoints = 0;
          for (const teamName of starterTeams) {
            try {
              const slug = slugTeam(teamName);
              const teamRef = db.collection('teams').doc(slug);
              const teamSnap = await teamRef.get();
              
              if (teamSnap.exists) {
                const teamData = teamSnap.data();
                const teamWeeklyPoints = teamData.currentSeason?.weeklyPoints || {};
                const teamBasePoints = teamWeeklyPoints[`week${currentWeek}`] || 0; // BASE POINTS from team doc
                
                // Apply captain and trip play bonuses
                const isCaptain = captainTeam === teamName;
                const isTripPlay = tripPlayTeam === teamName;

                let finalWeeklyPoints = teamBasePoints;
                let multiplierText = '';

                if (isCaptain && isTripPlay) {
                  finalWeeklyPoints = teamBasePoints * 5; // 5x combo
                  multiplierText = ' × 5 (CAPTAIN + TRIP PLAY)';
                } else if (isTripPlay) {
                  finalWeeklyPoints = teamBasePoints * 3; // Trip play 3x
                  multiplierText = ' × 3 (TRIP PLAY)';
                } else if (isCaptain) {
                  finalWeeklyPoints = teamBasePoints * 2; // Captain 2x
                  multiplierText = ' × 2 (CAPTAIN)';
                }

                currentWeekPoints += finalWeeklyPoints;

                console.log(`📊 ${teamName}: ${teamBasePoints} base pts${multiplierText} = ${finalWeeklyPoints}`);
              } else {
                console.warn(`⚠️ Team not found for member calculation: ${teamName} (${slug})`);
              }
            } catch (error) {
              console.error(`Error calculating points for team ${teamName}:`, error);
            }
          }
          
          // FIXED: New season total = baseline from most recent complete week + current week activity
          const newSeasonTotal = baselinePoints + currentWeekPoints;
          
          // Queue member update
          memberUpdates.push({
            ref: memberDoc.ref,
            points: newSeasonTotal,
            weeklyPoints: currentWeekPoints
          });
          
          console.log(`📊 Member ${userId} FINAL: ${newSeasonTotal} total pts (${baselinePoints} Week ${mostRecentCompleteWeek} baseline + ${currentWeekPoints} current week WITH MULTIPLIERS)`);
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
      
      // NEW: Update playoff bracket if we're in playoff weeks
      if (currentWeek >= 12 && currentWeek <= 14) {
        try {
          const bracketPointsUpdated = await updatePlayoffBracketPoints(db, leagueId, currentWeek);
          if (bracketPointsUpdated > 0) {
            console.log(`🏆 Updated ${bracketPointsUpdated} bracket points for league ${leagueId}`);
          }
        } catch (playoffError) {
          // Don't fail the entire member update if playoff bracket update fails
          console.warn(`⚠️ Could not update playoff bracket for league ${leagueId}:`, playoffError.message);
          // Continue processing other leagues
        }
      }
    }
  }
      
      console.log(`✅ Total members updated across all leagues: ${totalMembersUpdated}`);
      return totalMembersUpdated;
      
    } catch (error) {
      console.error('❌ Error recalculating member points:', error);
      return 0;
    }
  }

  async function updatePlayoffBracketPoints(db, leagueId, currentWeek) {
    try {
      // Only run during playoff weeks
      if (currentWeek < 12 || currentWeek > 14) {
        return 0; // Silent return during regular season
      }

      console.log(`🏆 Updating playoff bracket points for league ${leagueId}, week ${currentWeek}...`);
      
      // Get playoff bracket - check if it exists first
      const playoffRef = db
        .collection('leagues').doc(leagueId)
        .collection('playoffs').doc('2025');
      
      const playoffSnap = await playoffRef.get();
      
      if (!playoffSnap.exists) {
        // Playoff bracket doesn't exist yet - this is OK during weeks 12-14 before initialization
        console.log(`No playoff bracket found for league ${leagueId} - may not be initialized yet`);
        return 0;
      }

      const bracket = playoffSnap.data();
      
      // Additional safety: Check if playoffs have actually been initialized
      if (!bracket.championshipBracket || !bracket.loserBracket) {
        console.log(`Playoff bracket exists but not fully initialized for league ${leagueId}`);
        return 0;
      }

      // Get all current member points
      const membersSnap = await db
        .collection('leagues').doc(leagueId)
        .collection('members')
        .get();
      
      const memberPoints = {};
      membersSnap.forEach(doc => {
        memberPoints[doc.id] = doc.data().weeklyPoints || 0;
      });

      const updates = {};
      let pointsUpdated = 0;

      // Helper to update a matchup's team points
      const updateMatchupPoints = (path, matchup) => {
        if (!matchup) return;
        
        if (matchup.team1 && matchup.team1.userId) {
          const team1Points = memberPoints[matchup.team1.userId] || 0;
          updates[`${path}.team1.weeklyPoints`] = team1Points;
          pointsUpdated++;
          console.log(`  ${path}.team1: ${matchup.team1.teamName} = ${team1Points} pts`);
        }
        
        if (matchup.team2 && matchup.team2.userId) {
          const team2Points = memberPoints[matchup.team2.userId] || 0;
          updates[`${path}.team2.weeklyPoints`] = team2Points;
          pointsUpdated++;
          console.log(`  ${path}.team2: ${matchup.team2.teamName} = ${team2Points} pts`);
        }
      };

      // Update based on current week
      if (currentWeek === 12) {
        // Week 12: QF1, QF2, Mini League
        updateMatchupPoints('championshipBracket.week12.QF1', bracket.championshipBracket?.week12?.QF1);
        updateMatchupPoints('championshipBracket.week12.QF2', bracket.championshipBracket?.week12?.QF2);
        
        // Update mini league Week 12 points
        if (bracket.loserBracket?.miniLeague?.participants) {
          const week12MiniPoints = {};
          bracket.loserBracket.miniLeague.participants.forEach(participant => {
            week12MiniPoints[participant.userId] = memberPoints[participant.userId] || 0;
            console.log(`  Mini League: ${participant.teamName} = ${week12MiniPoints[participant.userId]} pts`);
          });
          updates['loserBracket.miniLeague.week12Points'] = week12MiniPoints;
          pointsUpdated += Object.keys(week12MiniPoints).length;
        }
        
      } else if (currentWeek === 13) {
        // Week 13: SF1, SF2, Consolation QF, Mini League Week 13
        updateMatchupPoints('championshipBracket.week13.SF1', bracket.championshipBracket?.week13?.SF1);
        updateMatchupPoints('championshipBracket.week13.SF2', bracket.championshipBracket?.week13?.SF2);
        updateMatchupPoints('championshipBracket.week13.consolationQF', bracket.championshipBracket?.week13?.consolationQF);
        
        // Update mini league Week 13 points AND totals
        if (bracket.loserBracket?.miniLeague?.participants) {
          const week13MiniPoints = {};
          const totalMiniPoints = {};
          const week12Points = bracket.loserBracket.miniLeague.week12Points || {};
          
          bracket.loserBracket.miniLeague.participants.forEach(participant => {
            const week13Pts = memberPoints[participant.userId] || 0;
            const week12Pts = week12Points[participant.userId] || 0;
            
            week13MiniPoints[participant.userId] = week13Pts;
            totalMiniPoints[participant.userId] = week12Pts + week13Pts;
            
            console.log(`  Mini League: ${participant.teamName} = Week 13: ${week13Pts}, Total: ${totalMiniPoints[participant.userId]} pts`);
          });
          
          updates['loserBracket.miniLeague.week13Points'] = week13MiniPoints;
          updates['loserBracket.miniLeague.totalPoints'] = totalMiniPoints;
          pointsUpdated += Object.keys(week13MiniPoints).length * 2;
        }
        
      } else if (currentWeek === 14) {
        // Week 14: All finals
        updateMatchupPoints('championshipBracket.week14.championship', bracket.championshipBracket?.week14?.championship);
        updateMatchupPoints('championshipBracket.week14.thirdPlace', bracket.championshipBracket?.week14?.thirdPlace);
        updateMatchupPoints('championshipBracket.week14.fifthPlace', bracket.championshipBracket?.week14?.fifthPlace);
        updateMatchupPoints('loserBracket.week14.firstPickGame', bracket.loserBracket?.week14?.firstPickGame);
        updateMatchupPoints('loserBracket.week14.seventhPlace', bracket.loserBracket?.week14?.seventhPlace);
        updateMatchupPoints('loserBracket.week14.toiletBowl', bracket.loserBracket?.week14?.toiletBowl);
      }

      // Apply updates if we have any
      if (Object.keys(updates).length > 0) {
        updates.lastPointsUpdate = admin.firestore.FieldValue.serverTimestamp();
        await playoffRef.update(updates);
        console.log(`✅ Updated ${pointsUpdated} playoff bracket points for league ${leagueId}`);
      } else {
        console.log(`No playoff bracket points to update for league ${leagueId}`);
      }

      return pointsUpdated;
      
    } catch (error) {
      console.error(`❌ Error updating playoff bracket points for league ${leagueId}:`, error);
      return 0;
    }
  }

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
      // Get today's date in YYYYMMDD format if no date provided
      const today = new Date();
      const todayStr = today.getFullYear() + 
                      String(today.getMonth() + 1).padStart(2, '0') + 
                      String(today.getDate()).padStart(2, '0');
      
      const dates = req.query.dates || todayStr;
      
      const espnData = await fetchESPNScoreboard({ dates });
      const events = espnData?.events || [];
      
      // Show raw structure of first event for debugging
      const firstEvent = events[0];
      
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
        games: gameDetails,
        // Add debugging info
        firstEventStructure: firstEvent ? {
          hasCompetitions: !!firstEvent.competitions,
          competitionsLength: firstEvent.competitions?.length,
          firstCompStructure: firstEvent.competitions?.[0] ? Object.keys(firstEvent.competitions[0]) : null,
          rawFirstEvent: JSON.stringify(firstEvent, null, 2).substring(0, 1000) // First 1000 chars
        } : null
      });
      
    } catch (error) {
      res.status(500).json({ error: error.message, stack: error.stack });
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
      // Get today's date in YYYYMMDD format if no date provided
      const today = new Date();
      const todayStr = today.getFullYear() + 
                      String(today.getMonth() + 1).padStart(2, '0') + 
                      String(today.getDate()).padStart(2, '0');
      
      const dates = req.query.dates || todayStr; // Use today's date as default
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
            c?.team?.name?.toLowerCase().includes(teamFilter.toLowerCase()) ||
            c?.team?.shortDisplayName?.toLowerCase().includes(teamFilter.toLowerCase())
          );
        });
        
        if (teamGame) {
          const comp = teamGame?.competitions?.[0];
          const competitors = comp?.competitors || [];
          
          res.json({
            found: true,
            team: teamFilter,
            dateUsed: dates,
            fullCompetitors: competitors,
            competitorStructure: competitors.map(c => ({
              team: c.team?.displayName,
              shortDisplayName: c.team?.shortDisplayName,
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
            dateUsed: dates,
            totalGamesInFeed: events.length,
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

  exports.updateTeamRecordsFromSchedule = onRequest(async (req, res) => {
  try {
    const db = admin.firestore();
    const year = req.query.year || '2025';
    
    console.log(`Updating team records from schedule data for ALL weeks in ${year}...`);
    
    // Get ALL completed games from ALL weeks
    const teamResults = new Map();
    const processedGames = [];
    
    // Get all weeks
    const weeksSnap = await db.collection('schedule').doc(year).collection('weeks').get();
    
    if (weeksSnap.empty) {
      return res.json({
        success: true,
        message: `No weeks found for year ${year}`,
        teamsUpdated: 0
      });
    }
    
    let totalGames = 0;
    
    for (const weekDoc of weeksSnap.docs) {
      const weekNumber = weekDoc.id;
      console.log(`Processing week ${weekNumber} games...`);
      
      const gamesSnap = await weekDoc.ref.collection('games')
        .where('gameComplete', '==', true)
        .get();
      
      let weekGameCount = 0;
      
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
          conferenceGame: isConferenceGame,
          week: weekNumber
        });
        
        weekGameCount++;
        totalGames++;
      });
      
      console.log(`Week ${weekNumber}: ${weekGameCount} completed games`);
    }
    
    console.log(`Processed ${totalGames} completed games across all weeks`);
    console.log(`Updating ${teamResults.size} teams`);
    
    if (totalGames === 0) {
      return res.json({
        success: true,
        message: `No completed games found across all weeks in ${year}`,
        teamsUpdated: 0
      });
    }
    
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
        
        console.log(`${teamName}: ${overallRecord} overall, ${confRecord} conf, ${avgPointsFor} PPG (${stats.gamesPlayed} games)`);
        
      } catch (error) {
        console.error(`Error updating team ${teamName}:`, error);
      }
    }
    
    await bw.commit();
    
    console.log(`Successfully updated ${teamsUpdated} team records from ${totalGames} games`);
    
    res.json({
      success: true,
      message: `Updated records for ${teamsUpdated} teams from ${totalGames} completed games across all weeks`,
      year,
      weeksProcessed: weeksSnap.size,
      teamsUpdated,
      gamesProcessed: totalGames,
      processedAllWeeks: true,
      teamResults: Object.fromEntries(
        Array.from(teamResults.entries()).map(([team, stats]) => [
          team,
          {
            record: stats.ties > 0 ? `${stats.wins}-${stats.losses}-${stats.ties}` : `${stats.wins}-${stats.losses}`,
            confRecord: stats.conferenceGames > 0 
              ? (stats.confTies > 0 ? `${stats.confWins}-${stats.confLosses}-${stats.confTies}` : `${stats.confWins}-${stats.confLosses}`)
              : '0-0',
            avgPointsFor: stats.gamesPlayed > 0 ? (stats.totalPointsFor / stats.gamesPlayed).toFixed(1) : '0.0',
            gamesPlayed: stats.gamesPlayed
          }
        ])
      )
    });
    
  } catch (error) {
    console.error('Error updating team records from schedule:', error);
    res.status(500).json({ error: error.message });
  }
  });

  exports.updateTeamRecordsScheduled = onSchedule(
    { 
      schedule: '0 8 * * *',           // 8 AM daily
      timeZone: 'America/New_York' 
    },
    async () => {
      try {
        console.log('Starting scheduled team records update...');
        
        const db = admin.firestore();
        
        // Get current week from season config (for logging purposes)
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
        console.log(`Updating records using ALL completed games (current week: ${weekNum})`);
        
        const year = '2025';
        
        // Get ALL completed games from ALL weeks
        const teamResults = new Map();
        const processedGames = [];
        
        // Get all weeks
        const weeksSnap = await db.collection('schedule').doc(year).collection('weeks').get();
        
        for (const weekDoc of weeksSnap.docs) {
          const weekNumber = weekDoc.id;
          console.log(`Processing week ${weekNumber} games...`);
          
          const gamesSnap = await weekDoc.ref.collection('games')
            .where('gameComplete', '==', true)
            .get();
          
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
              score: `${game.homeScore}-${game.awayScore}`,
              week: weekNumber
            });
          });
        }
        
        console.log(`Found ${processedGames.length} completed games across all weeks`);
        
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
            
            console.log(`Updated ${teamName}: ${overallRecord} (${stats.gamesPlayed} games)`);
            
          } catch (error) {
            console.error(`Error updating team ${teamName}:`, error);
          }
        }
        
        await bw.commit();
        
        console.log(`Scheduled team records update complete: ${teamsUpdated} teams updated from ${processedGames.length} games across all weeks`);
        
        // Log to system collection for monitoring
        try {
          await db.collection('system').doc('team-records-log').collection('daily').add({
            currentWeek: weekNum,
            teamsUpdated,
            gamesProcessed: processedGames.length,
            processedAllWeeks: true,
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

  /* -------------------------------------------------------------------------- */
/*                         Weekly Standings Management                         */
/* -------------------------------------------------------------------------- */

exports.advanceWeekAndSnapshot = onRequest(async (req, res) => {
  try {
    const db = admin.firestore();
    
    // Get current week from global config
    const seasonRef = db.collection('config').doc('season');
    const seasonSnap = await seasonRef.get();
    
    if (!seasonSnap.exists) {
      return res.status(404).json({ error: 'Season config not found' });
    }
    
    const seasonData = seasonSnap.data();
    const currentWeek = seasonData.currentWeek || 1;
    
    console.log(`Starting week advancement from week ${currentWeek}...`);
    
    // STEP 1: Snapshot current week standings BEFORE making any changes
    const leaguesSnap = await db.collection('leagues').get();
    let standingsSnapshotted = 0;
    
    for (const leagueDoc of leaguesSnap.docs) {
      const leagueId = leagueDoc.id;
      console.log(`Snapshotting Week ${currentWeek} standings for league: ${leagueId}`);
      
      const membersSnap = await db
        .collection('leagues').doc(leagueId)
        .collection('members')
        .get();
      
      for (const memberDoc of membersSnap.docs) {
        const memberData = memberDoc.data();
        const userId = memberDoc.id;
        
        // Create weekly standings snapshot
        const weeklyStandingsRef = db
          .collection('leagues').doc(leagueId)
          .collection('weeklyStandings').doc(userId);
        
        const snapshotData = {
          [`week${currentWeek}`]: {
            points: memberData.points || 0,
            weeklyPoints: memberData.weeklyPoints || 0,
            rank: null, // Will be calculated after sorting
            teamName: memberData.teamName || 'Unknown Team',
            email: memberData.email || 'Unknown',
            freeAgentMoves: memberData.freeAgentMoves || 0,
            bonusPoints: memberData.bonusPoints || 0,
            snapshotAt: admin.firestore.FieldValue.serverTimestamp(),
            // Snapshot the lineup for historical reference
            lineup: {
              starters: memberData.lineup?.starters || [],
              bench: memberData.lineup?.bench || [],
              captain: memberData.lineup?.captain || null
            }
          }
        };
        
        await weeklyStandingsRef.set(snapshotData, { merge: true });
        standingsSnapshotted++;
      }
    }
    
    console.log(`Snapshotted ${standingsSnapshotted} member standings for Week ${currentWeek}`);
    
    // STEP 2: Calculate and update ranks in the snapshots
    for (const leagueDoc of leaguesSnap.docs) {
      const leagueId = leagueDoc.id;
      
      // Get all members for ranking
      const membersSnap = await db
        .collection('leagues').doc(leagueId)
        .collection('members')
        .get();
      
      const memberRankings = [];
      membersSnap.forEach(memberDoc => {
        const memberData = memberDoc.data();
        memberRankings.push({
          userId: memberDoc.id,
          points: memberData.points || 0,
          weeklyPoints: memberData.weeklyPoints || 0
        });
      });
      
      // Sort by points (descending), then by weekly points (descending)
      memberRankings.sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        return b.weeklyPoints - a.weeklyPoints;
      });
      
      // Update ranks in snapshots
      const batch = db.batch();
      memberRankings.forEach((member, index) => {
        const weeklyStandingsRef = db
          .collection('leagues').doc(leagueId)
          .collection('weeklyStandings').doc(member.userId);
        
        batch.update(weeklyStandingsRef, {
          [`week${currentWeek}.rank`]: index + 1
        });
      });
      
      await batch.commit();
      console.log(`Updated ranks for ${memberRankings.length} members in league ${leagueId}`);
    }
    
    // STEP 3: Reset all leagues for new week (preserve points, reset weeklyPoints)
    let leaguesProcessed = 0;
    let membersReset = 0;
    
    for (const leagueDoc of leaguesSnap.docs) {
      const leagueId = leagueDoc.id;
      console.log(`Resetting league for new week: ${leagueId}`);
      
      const result = await resetLeagueForNewWeek(db, leagueId);
      membersReset += result.membersReset;
      leaguesProcessed++;
    }
    
    // STEP 4: Reset team weekly points for all teams
    const teamsReset = await resetAllTeamWeeklyPoints(db, currentWeek);
    
    // STEP 5: Advance the global week
    await seasonRef.update({
      currentWeek: currentWeek + 1,
      lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      weekAdvancedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    console.log(`Week advancement complete: ${currentWeek} → ${currentWeek + 1}`);
    
    res.json({
      success: true,
      previousWeek: currentWeek,
      newWeek: currentWeek + 1,
      standingsSnapshotted,
      leaguesProcessed,
      membersReset,
      teamsReset,
      message: `Successfully advanced from Week ${currentWeek} to Week ${currentWeek + 1}. Snapshotted ${standingsSnapshotted} standings, reset ${membersReset} members and ${teamsReset} teams.`
    });
    
  } catch (error) {
    console.error('Week advancement failed:', error);
    res.status(500).json({ 
      success: false,
      error: error.message,
      message: 'Week advancement failed. Check logs for details.'
    });
  }
});

// Helper function needs update too
async function resetLeagueForNewWeek(db, leagueId) {
  try {
    console.log(`Resetting league ${leagueId} for new week`);
    
    const membersSnap = await db
      .collection('leagues').doc(leagueId)
      .collection('members')
      .get();
    
    if (membersSnap.empty) {
      return { membersReset: 0 };
    }
    
    const batch = db.batch();
    let membersReset = 0;
    
    // Reset each member's weekly points ONLY (preserve total points)
    for (const memberDoc of membersSnap.docs) {
      batch.update(memberDoc.ref, {
        weeklyPoints: 0,  // Reset for new week
        // DO NOT RESET points - those are preserved season totals
        lastWeeklyReset: admin.firestore.FieldValue.serverTimestamp()
      });
      membersReset++;
    }
    
    await batch.commit();
    console.log(`Reset ${membersReset} members in league ${leagueId}`);
    
    return { membersReset };
    
  } catch (error) {
    console.error(`Error resetting league ${leagueId}:`, error);
    throw error;
  }
}

// Helper function needs update too
async function resetLeagueForNewWeek(db, leagueId) {
  try {
    console.log(`Resetting league ${leagueId} for new week`);
    
    const membersSnap = await db
      .collection('leagues').doc(leagueId)
      .collection('members')
      .get();
    
    if (membersSnap.empty) {
      return { membersReset: 0 };
    }
    
    const batch = db.batch();
    let membersReset = 0;
    
    // Reset each member's weekly points ONLY (preserve total points)
    for (const memberDoc of membersSnap.docs) {
      batch.update(memberDoc.ref, {
        weeklyPoints: 0,  // Reset for new week
        // DO NOT RESET points - those are preserved season totals
        lastWeeklyReset: admin.firestore.FieldValue.serverTimestamp()
      });
      membersReset++;
    }
    
    await batch.commit();
    console.log(`Reset ${membersReset} members in league ${leagueId}`);
    
    return { membersReset };
    
  } catch (error) {
    console.error(`Error resetting league ${leagueId}:`, error);
    throw error;
  }
}

async function resetLeagueForNewWeek(db, leagueId) {
  try {
    console.log(`Resetting league ${leagueId} for new week`);
    
    // Get all members in this league
    const membersSnap = await db
      .collection('leagues').doc(leagueId)
      .collection('members')
      .get();
    
    if (membersSnap.empty) {
      return { membersReset: 0 };
    }
    
    const batch = db.batch();
    let membersReset = 0;
    
    // Reset each member's weekly points
    for (const memberDoc of membersSnap.docs) {
      batch.update(memberDoc.ref, {
        weeklyPoints: 0,  // Reset for new week
        lastWeeklyReset: admin.firestore.FieldValue.serverTimestamp()
      });
      membersReset++;
    }
    
    await batch.commit();
    console.log(`Reset ${membersReset} members in league ${leagueId}`);
    
    return { membersReset };
    
  } catch (error) {
    console.error(`Error resetting league ${leagueId}:`, error);
    throw error;
  }
}

/**
 * Reset all team weekly points for the new week
 */
async function resetAllTeamWeeklyPoints(db, completedWeek) {
  try {
    const newWeek = completedWeek + 1;
    console.log(`Resetting all team weekly points for new week ${newWeek}`);
    
    const teamsSnap = await db.collection('teams').get();
    const bw = new BatchWriter(db);
    let teamsReset = 0;
    
    teamsSnap.forEach(teamDoc => {
      // Reset weekly points for the new week
      bw.update(teamDoc.ref, {
        [`currentSeason.weeklyPoints.week${newWeek}`]: 0,
        'currentSeason.gameComplete': false,
        'currentSeason.gameStatus': 'scheduled',
        'currentSeason.lastWeeklyReset': admin.firestore.FieldValue.serverTimestamp()
      });
      teamsReset++;
    });
    
    await bw.commit();
    console.log(`Reset weekly points for ${teamsReset} teams`);
    
    return teamsReset;
    
  } catch (error) {
    console.error('Error resetting team weekly points:', error);
    return 0;
  }
}

/**
 * Fix current week state after incomplete advancement
 */
exports.fixCurrentWeekState = onRequest(async (req, res) => {
  try {
    const db = admin.firestore();
    
    // Get current week
    const seasonSnap = await db.collection('config').doc('season').get();
    const currentWeek = seasonSnap.data()?.currentWeek || 2;
    
    console.log(`Fixing Week ${currentWeek} state...`);
    
    // Reset all member weekly points to 0
    const leaguesSnap = await db.collection('leagues').get();
    let membersFixed = 0;
    
    for (const leagueDoc of leaguesSnap.docs) {
      const membersSnap = await db.collection('leagues').doc(leagueDoc.id).collection('members').get();
      
      const batch = db.batch();
      membersSnap.forEach(memberDoc => {
        batch.update(memberDoc.ref, {
          weeklyPoints: 0  // Reset to 0 for current week
        });
        membersFixed++;
      });
      await batch.commit();
    }
    
    // Reset all team weekly points for current week
    const teamsSnap = await db.collection('teams').get();
    const teamBatch = db.batch();
    let teamsFixed = 0;
    
    teamsSnap.forEach(teamDoc => {
      teamBatch.update(teamDoc.ref, {
        [`currentSeason.weeklyPoints.week${currentWeek}`]: 0,
        'currentSeason.gameComplete': false,
        'currentSeason.gameStatus': 'scheduled'
      });
      teamsFixed++;
    });
    await teamBatch.commit();
    
    res.json({
      success: true,
      weekFixed: currentWeek,
      membersFixed,
      teamsFixed,
      message: `Fixed Week ${currentWeek} state - reset weekly points for fresh start`
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

exports.testCFBDAPI = onRequest(async (req, res) => {
  try {
    const key = CFB_KEY.value();
    const week = req.query.week || 2;
    
    console.log(`Testing CFBD API for Week ${week}...`);
    
    const url = `https://api.collegefootballdata.com/lines?year=2025&week=${week}&seasonType=regular&book=consensus`;
    
    const response = await fetch(url, { 
      headers: { Authorization: `Bearer ${key}` } 
    });
    
    const responseText = await response.text();
    
    res.json({
      success: response.ok,
      status: response.status,
      url: url,
      dataLength: responseText.length,
      hasData: responseText.length > 2, // More than just "[]"
      rawResponse: responseText.substring(0, 500) // First 500 chars
    });
    
  } catch (error) {
    res.status(500).json({ 
      error: error.message,
      success: false 
    });
  }
});

exports.testWeek2Ingestion = onRequest(async (req, res) => {
  try {
    const key = CFB_KEY.value();
    
    console.log('Testing Week 2 ingestion...');
    
    const result = await ingestLines({ 
      year: 2025, 
      week: 2, 
      seasonType: 'regular', 
      book: 'consensus', 
      updateTeams: true, 
      updateSchedule: true,
      key 
    });
    
    res.json({
      success: true,
      message: 'Week 2 ingestion test complete',
      result
    });
    
  } catch (error) {
    console.error('Week 2 ingestion failed:', error);
    res.status(500).json({ 
      error: error.message,
      stack: error.stack
    });
  }
});

exports.fixCurrentMemberPoints = onRequest(async (req, res) => {
  try {
    const db = admin.firestore();
    let membersFixed = 0;
    let totalErrors = 0;
    const fixDetails = [];
    
    console.log('Starting fix for current member points using Week 1 snapshots...');
    
    // Get all leagues
    const leaguesSnap = await db.collection('leagues').get();
    
    for (const leagueDoc of leaguesSnap.docs) {
      const leagueId = leagueDoc.id;
      console.log(`Fixing league: ${leagueId}`);
      
      // Get all members in this league
      const membersSnap = await db
        .collection('leagues').doc(leagueId)
        .collection('members')
        .get();
      
      const batch = db.batch();
      
      for (const memberDoc of membersSnap.docs) {
        const userId = memberDoc.id;
        const memberData = memberDoc.data();
        
        try {
          // Get their Week 1 snapshot
          const weeklyStandingsRef = db
            .collection('leagues').doc(leagueId)
            .collection('weeklyStandings').doc(userId);
          
          const weeklyStandingsSnap = await weeklyStandingsRef.get();
          
            console.log(`🔧 DEBUG: weeklyStandings document exists: ${weeklyStandingsSnap.exists}`);
            if (weeklyStandingsSnap.exists) {
            const standingsData = weeklyStandingsSnap.data();
            const week1Data = standingsData.week1;
            
            // More flexible check for week1 data
            if (week1Data && week1Data.points !== undefined && week1Data.points !== null) {
              const correctPoints = Number(week1Data.points);
              const currentPoints = memberData.points || 0;
              
              console.log(`Checking ${memberData.teamName || userId}: Current=${currentPoints}, Should be=${correctPoints}`);
              
              if (currentPoints !== correctPoints) {
                console.log(`FIXING ${memberData.teamName || userId}: ${currentPoints} → ${correctPoints}`);
                
                // Update member points to match Week 1 snapshot
                batch.update(memberDoc.ref, {
                  points: correctPoints,
                  weeklyPoints: 0, // Reset for Week 2
                  lastPointsUpdate: admin.firestore.FieldValue.serverTimestamp(),
                  fixedAt: admin.firestore.FieldValue.serverTimestamp()
                });
                
                fixDetails.push({
                  userId,
                  teamName: memberData.teamName,
                  from: currentPoints,
                  to: correctPoints
                });
                
                membersFixed++;
              } else {
                console.log(`${memberData.teamName || userId}: Already correct (${correctPoints})`);
              }
            } else {
              console.warn(`No valid Week 1 points data for ${userId}`);
              totalErrors++;
            }
          } else {
            console.warn(`No weeklyStandings document for ${userId}`);
            totalErrors++;
          }
          
        } catch (error) {
          console.error(`Error processing member ${userId}:`, error);
          totalErrors++;
        }
      }
      
      // Commit all changes for this league
      if (membersFixed > 0) {
        await batch.commit();
        console.log(`Committed fixes for league ${leagueId}`);
      }
    }
    
    console.log(`Fix complete: ${membersFixed} members fixed, ${totalErrors} errors`);
    
    res.json({
      success: true,
      membersFixed,
      totalErrors,
      fixDetails,
      message: `Fixed ${membersFixed} member points using Week 1 snapshots`
    });
    
  } catch (error) {
    console.error('Fix script failed:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

exports.debugWeeklyStandings = onRequest(async (req, res) => {
  try {
    const db = admin.firestore();
    const leagueId = req.query.leagueId || 'cGOwzgjI9PDRzBmJKRhu';
    
    console.log(`Debugging weeklyStandings for league: ${leagueId}`);
    
    const weeklyStandingsSnap = await db
      .collection('leagues').doc(leagueId)
      .collection('weeklyStandings')
      .get();
    
    const results = [];
    
    weeklyStandingsSnap.forEach(doc => {
      const data = doc.data();
      results.push({
        userId: doc.id,
        data: data,
        hasWeek1: !!data.week1,
        week1Points: data.week1?.points
      });
    });
    
    res.json({
      leagueId,
      totalDocs: results.length,
      results
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

exports.fixCurrentMemberPointsDebug = onRequest(async (req, res) => {
  try {
    const db = admin.firestore();
    let membersFixed = 0;
    let totalErrors = 0;
    const debugInfo = [];
    
    console.log('Starting detailed debug fix...');
    
    const leagueId = 'cGOwzgjI9PDRzBmJKRhu'; // Your specific league
    console.log(`Fixing league: ${leagueId}`);
    
    // Get all members in this league
    const membersSnap = await db
      .collection('leagues').doc(leagueId)
      .collection('members')
      .get();
    
    console.log(`Found ${membersSnap.docs.length} members`);
    
    for (const memberDoc of membersSnap.docs) {
      const userId = memberDoc.id;
      const memberData = memberDoc.data();
      
      try {
        console.log(`\n--- Processing ${userId} (${memberData.teamName}) ---`);
        console.log(`Current member points: ${memberData.points}`);
        
        // Get their Week 1 snapshot
        const weeklyStandingsRef = db
          .collection('leagues').doc(leagueId)
          .collection('weeklyStandings').doc(userId);
        
        console.log(`Looking for weeklyStandings doc: ${weeklyStandingsRef.path}`);
        
        const weeklyStandingsSnap = await weeklyStandingsRef.get();
        console.log(`WeeklyStandings exists: ${weeklyStandingsSnap.exists}`);
        
        if (weeklyStandingsSnap.exists) {
          const standingsData = weeklyStandingsSnap.data();
          console.log(`Standings data keys: ${Object.keys(standingsData)}`);
          
          const week1Data = standingsData.week1;
          console.log(`Week1 data exists: ${!!week1Data}`);
          
          if (week1Data) {
            console.log(`Week1 data keys: ${Object.keys(week1Data)}`);
            console.log(`Week1 points: ${week1Data.points} (type: ${typeof week1Data.points})`);
            
            if (week1Data.points !== undefined && week1Data.points !== null) {
              const correctPoints = Number(week1Data.points);
              const currentPoints = memberData.points || 0;
              
              debugInfo.push({
                userId,
                teamName: memberData.teamName,
                currentPoints,
                correctPoints,
                needsUpdate: currentPoints !== correctPoints
              });
              
              if (currentPoints !== correctPoints) {
                console.log(`WOULD FIX: ${currentPoints} → ${correctPoints}`);
                membersFixed++;
              } else {
                console.log(`Already correct: ${correctPoints}`);
              }
            } else {
              console.log(`Week1 points is undefined/null`);
              totalErrors++;
            }
          } else {
            console.log(`No week1 data found`);
            totalErrors++;
          }
        } else {
          console.log(`No weeklyStandings document found`);
          totalErrors++;
        }
        
      } catch (error) {
        console.error(`Error processing ${userId}:`, error);
        totalErrors++;
      }
    }
    
    res.json({
      success: true,
      membersFixed: 0, // Not actually fixing, just debugging
      totalErrors,
      debugInfo,
      message: `Debug complete: ${membersFixed} would be fixed, ${totalErrors} errors`
    });
    
  } catch (error) {
    console.error('Debug script failed:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

exports.fixCurrentMemberPointsActual = onRequest(async (req, res) => {
  try {
    const db = admin.firestore();
    let membersFixed = 0;
    const fixDetails = [];
    
    console.log('Starting ACTUAL fix for member points...');
    
    const leagueId = 'cGOwzgjI9PDRzBmJKRhu';
    
    // Get all members in this league
    const membersSnap = await db
      .collection('leagues').doc(leagueId)
      .collection('members')
      .get();
    
    const batch = db.batch();
    
    for (const memberDoc of membersSnap.docs) {
      const userId = memberDoc.id;
      const memberData = memberDoc.data();
      
      try {
        // Get their Week 1 snapshot
        const weeklyStandingsRef = db
          .collection('leagues').doc(leagueId)
          .collection('weeklyStandings').doc(userId);
        
        const weeklyStandingsSnap = await weeklyStandingsRef.get();
        
        // Use different syntax to check existence
        const docExists = weeklyStandingsSnap._fieldsProto !== undefined || weeklyStandingsSnap.data() !== undefined;
        
        if (docExists) {
          const standingsData = weeklyStandingsSnap.data();
          
          if (standingsData && standingsData.week1) {
            const week1Data = standingsData.week1;
            
            if (week1Data.points !== undefined) {
              const correctPoints = Number(week1Data.points);
              const currentPoints = memberData.points || 0;
              
              if (currentPoints !== correctPoints) {
                console.log(`FIXING ${memberData.teamName}: ${currentPoints} → ${correctPoints}`);
                
                batch.update(memberDoc.ref, {
                  points: correctPoints,
                  weeklyPoints: 0,
                  lastPointsUpdate: admin.firestore.FieldValue.serverTimestamp(),
                  fixedAt: admin.firestore.FieldValue.serverTimestamp()
                });
                
                fixDetails.push({
                  userId,
                  teamName: memberData.teamName,
                  from: currentPoints,
                  to: correctPoints
                });
                
                membersFixed++;
              }
            }
          }
        }
      } catch (innerError) {
        console.error(`Error processing ${userId}:`, innerError);
      }
    }
    
    // Apply all fixes
    if (membersFixed > 0) {
      await batch.commit();
    }
    
    console.log(`Fix complete: ${membersFixed} members fixed`);
    
    res.json({
      success: true,
      membersFixed,
      fixDetails,
      message: `Successfully fixed ${membersFixed} member points using Week 1 snapshots`
    });
    
  } catch (error) {
    console.error('Fix script failed:', error);
    res.status(500).json({ 
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
});

exports.debugMemberPointsCalculation = onRequest(async (req, res) => {
  try {
    const db = admin.firestore();
    const leagueId = 'cGOwzgjI9PDRzBmJKRhu';
    const userId = 'MaIBUeppBCYCht3mai5dwYjacbd2';
    const currentWeek = 2;
    
    console.log(`🔍 Debugging member ${userId} points calculation...`);
    
    // Get member data
    const memberRef = db.collection('leagues').doc(leagueId).collection('members').doc(userId);
    const memberSnap = await memberRef.get();
    const memberData = memberSnap.data();
    
    const lineup = memberData.lineup || {};
    const starterTeams = (lineup.starters || []).filter(teamName => teamName && teamName.trim() !== '');
    const captainTeam = memberData.lineup?.captain || null;
    
    console.log(`👥 Starters: [${starterTeams.join(', ')}]`);
    console.log(`👑 Captain: ${captainTeam}`);
    console.log(`📊 Current member weeklyPoints: ${memberData.weeklyPoints}`);
    console.log(`📊 Current member total points: ${memberData.points}`);
    
    // Check each team's current points
    let calculatedWeeklyTotal = 0;
    for (const teamName of starterTeams) {
      try {
        const slug = slugTeam(teamName);
        const teamRef = db.collection('teams').doc(slug);
        const teamSnap = await teamRef.get();
        
        if (teamSnap.exists) {
          const teamData = teamSnap.data();
          const teamWeeklyPoints = teamData.currentSeason?.weeklyPoints?.[`week${currentWeek}`] || 0;
          const isCaptain = captainTeam === teamName;
          const finalWeeklyPoints = isCaptain ? teamWeeklyPoints * 2 : teamWeeklyPoints;
          
          calculatedWeeklyTotal += finalWeeklyPoints;
          
          console.log(`🏈 ${teamName}: ${teamWeeklyPoints} pts${isCaptain ? ' × 2 (CAPTAIN)' : ''} = ${finalWeeklyPoints}`);
        } else {
          console.log(`❌ Team not found: ${teamName} (${slug})`);
        }
      } catch (error) {
        console.error(`Error checking team ${teamName}:`, error);
      }
    }
    
    console.log(`🧮 Calculated weekly total: ${calculatedWeeklyTotal}`);
    console.log(`📊 Stored weekly total: ${memberData.weeklyPoints}`);
    console.log(`🚨 MISMATCH: ${calculatedWeeklyTotal !== memberData.weeklyPoints}`);
    
    res.json({
      success: true,
      memberData: {
        weeklyPoints: memberData.weeklyPoints,
        totalPoints: memberData.points,
        captain: captainTeam,
        starters: starterTeams
      },
      calculatedWeeklyTotal,
      teamBreakdown: starterTeams.map(teamName => {
        // This would need actual team data - simplified for response
        return { teamName, isCaptain: captainTeam === teamName };
      }),
      mismatch: calculatedWeeklyTotal !== memberData.weeklyPoints
    });
    
  } catch (error) {
    console.error('❌ Debug failed:', error);
    res.status(500).json({ error: error.message });
  }
});

exports.testWeeklySnapshot = onRequest(async (req, res) => {
  try {
    const db = admin.firestore();
    
    // Get current week from season config
    const seasonRef = db.collection('config').doc('season');
    const seasonSnap = await seasonRef.get();
    
    if (!seasonSnap.exists) {
      return res.status(404).json({ error: 'Season config not found' });
    }
    
    const seasonData = seasonSnap.data();
    const currentWeek = seasonData.currentWeek || 2;
    
    console.log(`Testing snapshot for Week ${currentWeek}...`);
    
    // Get all leagues
    const leaguesSnap = await db.collection('leagues').get();
    const testResults = [];
    
    for (const leagueDoc of leaguesSnap.docs) {
      const leagueId = leagueDoc.id;
      console.log(`Testing snapshot for league: ${leagueId}`);
      
      // Get all members in this league
      const membersSnap = await db
        .collection('leagues').doc(leagueId)
        .collection('members')
        .get();
      
      const leagueTestData = {
        leagueId,
        members: []
      };
      
      for (const memberDoc of membersSnap.docs) {
        const memberData = memberDoc.data();
        const userId = memberDoc.id;
        
        // Create the snapshot data (but don't save it)
        const testSnapshotData = {
          [`week${currentWeek}`]: {
            points: memberData.points || 0,
            weeklyPoints: memberData.weeklyPoints || 0,
            rank: null, // Will be calculated
            teamName: memberData.teamName || 'Unknown Team',
            email: memberData.email || 'Unknown',  // Changed from firstName
            freeAgentMoves: memberData.freeAgentMoves || 0,
            bonusPoints: memberData.bonusPoints || 0,
            snapshotAt: new Date().toISOString(),
            lineup: {
              starters: memberData.lineup?.starters || [],
              bench: memberData.lineup?.bench || [],
              captain: memberData.lineup?.captain || null  // Fixed from memberData.captain
            }
          }
        };
        
        // Validate the data
        const validation = {
          hasLineup: !!(memberData.lineup),
          hasStarters: !!(memberData.lineup?.starters?.length > 0),
          hasBench: !!(memberData.lineup?.bench?.length > 0),
          hasCaptain: !!(memberData.lineup?.captain),
          captainInStarters: memberData.lineup?.captain && 
            memberData.lineup?.starters?.includes(memberData.lineup.captain),
          hasEmail: !!(memberData.email),
          hasPoints: typeof memberData.points === 'number',
          hasWeeklyPoints: typeof memberData.weeklyPoints === 'number'
        };
        
        leagueTestData.members.push({
          userId,
          teamName: memberData.teamName,
          email: memberData.email,
          currentData: {
            points: memberData.points,
            weeklyPoints: memberData.weeklyPoints,
            lineup: memberData.lineup
          },
          proposedSnapshot: testSnapshotData,
          validation,
          issues: [
            !validation.hasLineup && 'Missing lineup object',
            !validation.hasStarters && 'No starters found',
            !validation.hasBench && 'No bench found', 
            !validation.hasCaptain && 'No captain selected',
            !validation.captainInStarters && validation.hasCaptain && 'Captain not in starters',
            !validation.hasEmail && 'Missing email',
            !validation.hasPoints && 'Missing points',
            !validation.hasWeeklyPoints && 'Missing weeklyPoints'
          ].filter(Boolean)
        });
      }
      
      // Sort members by points for ranking test
      leagueTestData.members.sort((a, b) => {
        const aPoints = a.currentData.points || 0;
        const bPoints = b.currentData.points || 0;
        if (bPoints !== aPoints) return bPoints - aPoints;
        return (b.currentData.weeklyPoints || 0) - (a.currentData.weeklyPoints || 0);
      });
      
      // Add ranks
      leagueTestData.members.forEach((member, index) => {
        member.proposedSnapshot[`week${currentWeek}`].rank = index + 1;
      });
      
      testResults.push(leagueTestData);
    }
    
    // Summary stats
    const summary = {
      totalLeagues: testResults.length,
      totalMembers: testResults.reduce((sum, league) => sum + league.members.length, 0),
      membersWithIssues: testResults.reduce((sum, league) => 
        sum + league.members.filter(m => m.issues.length > 0).length, 0
      ),
      commonIssues: {}
    };
    
    // Count common issues
    testResults.forEach(league => {
      league.members.forEach(member => {
        member.issues.forEach(issue => {
          summary.commonIssues[issue] = (summary.commonIssues[issue] || 0) + 1;
        });
      });
    });
    
    console.log(`Test complete: ${summary.totalMembers} members across ${summary.totalLeagues} leagues`);
    console.log(`Issues found: ${summary.membersWithIssues} members have issues`);
    console.log('Common issues:', summary.commonIssues);
    
    res.json({
      success: true,
      currentWeek,
      summary,
      testResults,
      message: `Tested snapshot for Week ${currentWeek}. Check results for any issues before running actual advancement.`
    });
    
  } catch (error) {
    console.error('Test snapshot failed:', error);
    res.status(500).json({ 
      success: false,
      error: error.message,
      message: 'Test snapshot failed. Check logs for details.'
    });
  }
});

/**
 * Test function to check what data is available from CFBD records endpoint
 * Add this to your functions/index.js to test before implementing full solution
 */
exports.testCFBDRecordsAPI = onRequest(async (req, res) => {
  try {
    const key = CFB_KEY.value();
    const year = parseInt(req.query.year) || 2025;
    const team = req.query.team; // Optional team filter for focused testing
    
    console.log(`Testing CFBD Records API for ${year}${team ? ` (team: ${team})` : ''}...`);
    
    // Test the /records endpoint
    let url = `${CFBD_API_BASE}/records?year=${year}`;
    if (team) {
      url += `&team=${encodeURIComponent(team)}`;
    }
    
    console.log(`Fetching: ${url}`);
    
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${key}` }
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({
        success: false,
        error: `CFBD API error ${response.status}: ${errorText}`,
        url: url
      });
    }
    
    const data = await response.json();
    
    if (!data || data.length === 0) {
      return res.json({
        success: true,
        message: `No records data found for ${year}${team ? ` team: ${team}` : ''}`,
        totalTeams: 0,
        url: url
      });
    }
    
    // Analyze the structure of the first few teams
    const sampleSize = Math.min(3, data.length);
    const sample = data.slice(0, sampleSize);
    
    // Look for ATS data specifically
    const atsAnalysis = {
      teamsWithATS: 0,
      atsFieldNames: new Set(),
      sampleATSData: []
    };
    
    data.forEach(team => {
      // Check for any ATS-related fields
      const teamKeys = Object.keys(team);
      const atsFields = teamKeys.filter(key => 
        key.toLowerCase().includes('ats') || 
        key.toLowerCase().includes('spread') ||
        key.toLowerCase().includes('against')
      );
      
      if (atsFields.length > 0) {
        atsAnalysis.teamsWithATS++;
        atsFields.forEach(field => atsAnalysis.atsFieldNames.add(field));
        
        // Save sample for first few teams
        if (atsAnalysis.sampleATSData.length < 3) {
          atsAnalysis.sampleATSData.push({
            team: team.team,
            atsFields: atsFields.map(field => ({
              fieldName: field,
              fieldValue: team[field]
            }))
          });
        }
      }
    });
    
    // Check for any betting/gambling related fields
    const bettingAnalysis = {
      commonFields: new Set(),
      possibleRecordFields: new Set()
    };
    
    sample.forEach(team => {
      Object.keys(team).forEach(key => {
        bettingAnalysis.commonFields.add(key);
        
        // Look for fields that might contain record data
        if (typeof team[key] === 'string' && team[key].match(/^\d+-\d+/)) {
          bettingAnalysis.possibleRecordFields.add(key);
        } else if (Array.isArray(team[key])) {
          // Check if it's an array of record objects
          bettingAnalysis.possibleRecordFields.add(`${key} (array)`);
        }
      });
    });
    
    // If we found specific teams, show their full structure
    const detailedSample = team && data.length > 0 ? data[0] : null;
    
    res.json({
      success: true,
      year,
      teamFilter: team || 'none',
      url: url,
      totalTeams: data.length,
      
      // ATS Analysis
      atsAnalysis: {
        teamsWithATS: atsAnalysis.teamsWithATS,
        atsFieldNames: Array.from(atsAnalysis.atsFieldNames),
        sampleATSData: atsAnalysis.sampleATSData,
        hasATSData: atsAnalysis.teamsWithATS > 0
      },
      
      // General structure analysis
      structureAnalysis: {
        commonFields: Array.from(bettingAnalysis.commonFields),
        possibleRecordFields: Array.from(bettingAnalysis.possibleRecordFields)
      },
      
      // Sample data
      sampleTeams: sample.map(team => ({
        team: team.team,
        conference: team.conference,
        availableFields: Object.keys(team),
        // Show first 3 fields with their values
        sampleFieldValues: Object.keys(team).slice(0, 3).map(key => ({
          field: key,
          value: team[key],
          type: typeof team[key]
        }))
      })),
      
      // Full detail if specific team requested
      ...(detailedSample && {
        detailedTeamSample: {
          team: detailedSample.team,
          fullStructure: detailedSample
        }
      }),
      
      // Quick recommendations
      recommendations: [
        atsAnalysis.teamsWithATS > 0 
          ? "✅ ATS data found - can proceed with import implementation"
          : "❌ No ATS data found - may need different endpoint or approach",
        data.length > 0 
          ? `✅ Records endpoint working - returned ${data.length} teams`
          : "❌ No data returned from records endpoint",
        bettingAnalysis.possibleRecordFields.size > 0
          ? `✅ Found ${bettingAnalysis.possibleRecordFields.size} potential record fields`
          : "⚠️ No obvious record fields found"
      ]
    });
    
  } catch (error) {
    console.error('CFBD Records API test failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
});

/**
 * Simplified test for a specific team to see exact data structure
 */
exports.testCFBDRecordsSingleTeam = onRequest(async (req, res) => {
  try {
    const key = CFB_KEY.value();
    const year = parseInt(req.query.year) || 2025;
    const team = req.query.team || 'Missouri'; // Default to Missouri for testing
    
    const url = `${CFBD_API_BASE}/records?year=${year}&team=${encodeURIComponent(team)}`;
    
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${key}` }
    });
    
    if (!response.ok) {
      return res.status(response.status).json({
        error: `CFBD API error ${response.status}: ${await response.text()}`
      });
    }
    
    const data = await response.json();
    
    res.json({
      success: true,
      year,
      team,
      url,
      dataFound: data.length > 0,
      fullResponse: data,
      // If data exists, break down the structure
      ...(data.length > 0 && {
        firstTeam: data[0],
        fieldBreakdown: Object.keys(data[0]).map(key => ({
          field: key,
          value: data[0][key],
          type: typeof data[0][key],
          isArray: Array.isArray(data[0][key]),
          ...(Array.isArray(data[0][key]) && data[0][key].length > 0 && {
            arrayFirstElement: data[0][key][0],
            arrayElementType: typeof data[0][key][0]
          })
        }))
      })
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Calculate ATS records from completed games in your schedule collection
 * This uses your existing game results + spread data instead of importing from CFBD
 */
async function calculateATSRecordsFromGames(db, year = '2025') {
  console.log(`Calculating ATS records from completed games for ${year}...`);
  
  const teamATSRecords = new Map();
  let totalGamesProcessed = 0;
  let gamesWithSpreads = 0;
  
  // Get all weeks
  const weeksSnap = await db.collection('schedule').doc(year).collection('weeks').get();
  
  for (const weekDoc of weeksSnap.docs) {
    const weekNumber = weekDoc.id;
    console.log(`Processing week ${weekNumber}...`);
    
    // Get all completed games with scores and spreads
    const gamesSnap = await weekDoc.ref.collection('games')
      .where('gameComplete', '==', true)
      .get();
    
    gamesSnap.forEach(gameDoc => {
      const game = gameDoc.data();
      
      // Validate required data
      if (!game.homeTeam || !game.awayTeam || 
          typeof game.homeScore !== 'number' || 
          typeof game.awayScore !== 'number') {
        return;
      }
      
      totalGamesProcessed++;
      
      // Check if we have spread data
      if (typeof game.homeSpread === 'number') {
        gamesWithSpreads++;
        
        const homeScore = game.homeScore;
        const awayScore = game.awayScore;
        const homeSpread = game.homeSpread; // From home team's perspective
        
        // Calculate actual margin (home team perspective)
        const actualMargin = homeScore - awayScore;
        
        // Calculate cover amounts for each team
        const homeCoverAmount = actualMargin - homeSpread; // How much home team covered by
        const awayCoverAmount = -actualMargin - (-homeSpread); // How much away team covered by
        
        // Determine if each team covered (>= 0.5 to handle pushes)
        const homeCovered = homeCoverAmount >= 0.5;
        const awayCovered = awayCoverAmount >= 0.5;
        const isPush = Math.abs(homeCoverAmount) < 0.5; // Within 0.5 points is a push
        
        // Initialize team records if not exists
        [game.homeTeam, game.awayTeam].forEach(teamName => {
          if (!teamATSRecords.has(teamName)) {
            teamATSRecords.set(teamName, {
              wins: 0,
              losses: 0,
              pushes: 0,
              gamesWithSpreads: 0,
              totalCoverAmount: 0, // For average calculation
              games: [] // Store individual game results for debugging
            });
          }
        });
        
        const homeRecord = teamATSRecords.get(game.homeTeam);
        const awayRecord = teamATSRecords.get(game.awayTeam);
        
        // Update records
        homeRecord.gamesWithSpreads++;
        awayRecord.gamesWithSpreads++;
        homeRecord.totalCoverAmount += homeCoverAmount;
        awayRecord.totalCoverAmount += awayCoverAmount;
        
        if (isPush) {
          homeRecord.pushes++;
          awayRecord.pushes++;
        } else if (homeCovered) {
          homeRecord.wins++;
          awayRecord.losses++;
        } else {
          homeRecord.losses++;
          awayRecord.wins++;
        }
        
        // Store game details for debugging
        homeRecord.games.push({
          week: weekNumber,
          opponent: game.awayTeam,
          isHome: true,
          score: `${homeScore}-${awayScore}`,
          spread: homeSpread,
          coverAmount: homeCoverAmount,
          result: isPush ? 'PUSH' : (homeCovered ? 'WIN' : 'LOSS')
        });
        
        awayRecord.games.push({
          week: weekNumber,
          opponent: game.homeTeam,
          isHome: false,
          score: `${awayScore}-${homeScore}`,
          spread: -homeSpread,
          coverAmount: awayCoverAmount,
          result: isPush ? 'PUSH' : (awayCovered ? 'WIN' : 'LOSS')
        });
        
        console.log(`${game.homeTeam} vs ${game.awayTeam}: ${homeScore}-${awayScore} (spread: ${homeSpread}) -> Home ${homeCovered ? 'COVERED' : 'FAILED'}, Away ${awayCovered ? 'COVERED' : 'FAILED'}${isPush ? ' (PUSH)' : ''}`);
      }
    });
  }
  
  // Convert to final format with percentages
  const finalRecords = new Map();
  
  for (const [teamName, record] of teamATSRecords) {
    const totalGames = record.wins + record.losses + record.pushes;
    const gamesForPercentage = record.wins + record.losses; // Exclude pushes from percentage
    
    finalRecords.set(teamName, {
      wins: record.wins,
      losses: record.losses,
      pushes: record.pushes,
      record: record.pushes > 0 
        ? `${record.wins}-${record.losses}-${record.pushes}`
        : `${record.wins}-${record.losses}`,
      coverPercentage: gamesForPercentage > 0 
        ? ((record.wins / gamesForPercentage) * 100).toFixed(1)
        : '0.0',
      avgCoverAmount: record.gamesWithSpreads > 0 
        ? (record.totalCoverAmount / record.gamesWithSpreads).toFixed(1)
        : '0.0',
      gamesWithSpreads: record.gamesWithSpreads,
      games: record.games // Keep for debugging
    });
  }
  
  console.log(`ATS calculation complete: ${finalRecords.size} teams, ${totalGamesProcessed} total games, ${gamesWithSpreads} games with spreads`);
  
  return {
    teamRecords: finalRecords,
    summary: {
      totalTeams: finalRecords.size,
      totalGamesProcessed,
      gamesWithSpreads,
      gamesWithoutSpreads: totalGamesProcessed - gamesWithSpreads
    }
  };
}

/**
 * Update team documents with calculated ATS records
 */
async function updateTeamATSFromCalculation(bw, db, teamATSRecords) {
  let teamsUpdated = 0;
  let teamsNotFound = 0;
  
  for (const [teamName, atsData] of teamATSRecords) {
    try {
      const slug = slugTeam(teamName);
      const teamRef = db.collection('teams').doc(slug);
      
      // Check if team exists
      const teamSnap = await teamRef.get();
      if (!teamSnap.exists) {
        console.warn(`Team document not found: ${teamName} (${slug})`);
        teamsNotFound++;
        continue;
      }
      
      // Update team document with calculated ATS data
      const updateData = {
        'currentSeason.atsWins': atsData.wins,
        'currentSeason.atsLosses': atsData.losses,
        'currentSeason.atsPushes': atsData.pushes,
        'currentSeason.atsRecord': atsData.record,
        'currentSeason.atsCoverPercentage': atsData.coverPercentage,
        'currentSeason.atsAvgCoverAmount': atsData.avgCoverAmount,
        'currentSeason.atsGamesWithSpreads': atsData.gamesWithSpreads,
        'currentSeason.atsCalculated': true,
        'currentSeason.atsLastCalculated': admin.firestore.FieldValue.serverTimestamp(),
      };
      
      bw.update(teamRef, updateData);
      teamsUpdated++;
      
      console.log(`Updated ${teamName} ATS: ${atsData.record} (${atsData.coverPercentage}%)`);
      
    } catch (error) {
      console.error(`Error updating ATS for ${teamName}:`, error);
      teamsNotFound++;
    }
  }
  
  return { teamsUpdated, teamsNotFound };
}

/**
 * Main function to calculate and update all ATS records
 */
exports.calculateATSRecords = onRequest(async (req, res) => {
  try {
    const db = admin.firestore();
    const year = req.query.year || '2025';
    
    console.log(`Starting ATS calculation for ${year}...`);
    
    // Calculate ATS records from completed games
    const { teamRecords, summary } = await calculateATSRecordsFromGames(db, year);
    
    if (teamRecords.size === 0) {
      return res.json({
        success: true,
        message: `No teams with ATS data found for ${year}`,
        summary
      });
    }
    
    // Update team documents
    const bw = new BatchWriter(db);
    const updateResult = await updateTeamATSFromCalculation(bw, db, teamRecords);
    await bw.commit();
    
    // Format top performers for response
    const topPerformers = Array.from(teamRecords.entries())
      .filter(([_, record]) => record.gamesWithSpreads >= 3) // At least 3 games
      .sort(([_, a], [__, b]) => parseFloat(b.coverPercentage) - parseFloat(a.coverPercentage))
      .slice(0, 10)
      .map(([team, record]) => ({
        team,
        record: record.record,
        coverPercentage: record.coverPercentage,
        avgCoverAmount: record.avgCoverAmount,
        gamesWithSpreads: record.gamesWithSpreads
      }));
    
    res.json({
      success: true,
      year,
      message: `Calculated ATS records for ${updateResult.teamsUpdated} teams from ${summary.gamesWithSpreads} games with spreads`,
      summary: {
        ...summary,
        teamsUpdated: updateResult.teamsUpdated,
        teamsNotFound: updateResult.teamsNotFound
      },
      topPerformers,
      // Include sample of all records (first 20)
      sampleRecords: Array.from(teamRecords.entries()).slice(0, 20).map(([team, record]) => ({
        team,
        record: record.record,
        coverPercentage: record.coverPercentage,
        avgCoverAmount: record.avgCoverAmount
      }))
    });
    
  } catch (error) {
    console.error('ATS calculation failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Debug function to show detailed ATS calculation for a specific team
 */
exports.debugTeamATS = onRequest(async (req, res) => {
  try {
    const db = admin.firestore();
    const year = req.query.year || '2025';
    const teamName = req.query.team || 'Missouri';
    
    console.log(`Debug ATS calculation for ${teamName} in ${year}...`);
    
    const { teamRecords } = await calculateATSRecordsFromGames(db, year);
    const teamRecord = teamRecords.get(teamName);
    
    if (!teamRecord) {
      return res.json({
        success: false,
        message: `No ATS data found for ${teamName} in ${year}`,
        availableTeams: Array.from(teamRecords.keys()).slice(0, 20)
      });
    }
    
    res.json({
      success: true,
      team: teamName,
      year,
      atsRecord: {
        record: teamRecord.record,
        wins: teamRecord.wins,
        losses: teamRecord.losses,
        pushes: teamRecord.pushes,
        coverPercentage: teamRecord.coverPercentage,
        avgCoverAmount: teamRecord.avgCoverAmount,
        gamesWithSpreads: teamRecord.gamesWithSpreads
      },
      gameDetails: teamRecord.games,
      message: `${teamName} is ${teamRecord.record} ATS (${teamRecord.coverPercentage}% cover rate)`
    });
    
  } catch (error) {
    console.error('Debug ATS failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});


/**
 * 
 * PLAYOFF FUNCTIONS
 * Initialize playoff bracket after Week 11 completes
 * Run this AFTER advancing from Week 11 → 12
 * 
 * Usage: /initializePlayoffs?leagueId=YOUR_LEAGUE_ID
 */
exports.initializePlayoffs = onRequest(async (req, res) => {
  try {
    const db = admin.firestore();
    const leagueId = req.query.leagueId;
    
    if (!leagueId) {
      return res.status(400).json({ error: 'leagueId required' });
    }

    console.log(`🏆 Initializing playoffs for league ${leagueId}...`);

    // Get Week 11 final standings from weeklyStandings snapshots
    const weeklyStandingsSnap = await db
      .collection('leagues').doc(leagueId)
      .collection('weeklyStandings')
      .get();

    const finalStandings = [];
    
    weeklyStandingsSnap.forEach(doc => {
      const data = doc.data();
      const week11Data = data.week11;
      
      if (week11Data) {
        finalStandings.push({
          userId: doc.id,
          teamName: week11Data.teamName || 'Unnamed Team',
          email: week11Data.email || 'Unknown',
          points: week11Data.points || 0,
          weeklyPoints: week11Data.weeklyPoints || 0,
          rank: week11Data.rank || 999
        });
      }
    });

    // Sort by rank (should already be ranked, but double-check)
    finalStandings.sort((a, b) => a.rank - b.rank);

    if (finalStandings.length < 12) {
      return res.status(400).json({ 
        error: `Need 12 teams for playoffs. Found ${finalStandings.length}` 
      });
    }

    // Assign seeds 1-12
    const seededTeams = finalStandings.slice(0, 12).map((team, index) => ({
      ...team,
      seed: index + 1
    }));

    console.log('📊 Final Seeding:');
    seededTeams.forEach(t => console.log(`  #${t.seed}: ${t.teamName} (${t.points} pts)`));

    // Create playoff bracket structure
    const playoffBracket = {
      year: 2025,
      leagueId: leagueId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      currentWeek: 12, // Playoff Week 1
      
      // Championship Bracket (Seeds 1-6)
      championshipBracket: {
        // Week 12 - Quarterfinals
        week12: {
          QF1: {
            matchupId: 'QF1',
            matchupName: 'Quarterfinal 1',
            week: 12,
            playoffWeek: 1,
            team1: { // Seed 3
              ...seededTeams[2],
              role: 'seed3',
              weeklyPoints: 0
            },
            team2: { // Seed 6
              ...seededTeams[5],
              role: 'seed6',
              weeklyPoints: 0
            },
            winner: null, // Will be 'team1' or 'team2'
            loserLabel: 'QFL1', // Loser becomes QFL1
            completed: false
          },
          QF2: {
            matchupId: 'QF2',
            matchupName: 'Quarterfinal 2',
            week: 12,
            playoffWeek: 1,
            team1: { // Seed 4
              ...seededTeams[3],
              role: 'seed4',
              weeklyPoints: 0
            },
            team2: { // Seed 5
              ...seededTeams[4],
              role: 'seed5',
              weeklyPoints: 0
            },
            winner: null, // Will be 'team1' or 'team2'
            loserLabel: 'QFL2', // Loser becomes QFL2
            completed: false
          },
          // Seeds 1 and 2 get byes
          byes: [
            { ...seededTeams[0], byeWeek: 12 }, // Seed 1
            { ...seededTeams[1], byeWeek: 12 }  // Seed 2
          ]
        },
        
        // Week 13 - Semifinals + Consolation QF
        week13: {
          SF1: {
            matchupId: 'SF1',
            matchupName: 'Semifinal 1',
            week: 13,
            playoffWeek: 2,
            team1: { // Seed 2
              ...seededTeams[1],
              role: 'seed2',
              weeklyPoints: 0
            },
            team2: null, // Winner of QF1 (populated after Week 12)
            team1WeeklyPoints: 0,
            team2WeeklyPoints: 0,
            winner: null,
            loserLabel: 'SFL1', // Loser becomes SFL1
            completed: false
          },
          SF2: {
            matchupId: 'SF2',
            matchupName: 'Semifinal 2',
            week: 13,
            playoffWeek: 2,
            team1: { // Seed 1
              ...seededTeams[0],
              role: 'seed1',
              weeklyPoints: 0
            },
            team2: null, // Winner of QF2 (populated after Week 12)
            team1WeeklyPoints: 0,
            team2WeeklyPoints: 0,
            winner: null,
            loserLabel: 'SFL2', // Loser becomes SFL2
            completed: false
          },
          consolationQF: {
            matchupId: 'consolationQF',
            matchupName: 'Consolation Quarterfinal',
            week: 13,
            playoffWeek: 2,
            team1: null, // QFL1 (loser of QF1)
            team2: null, // QFL2 (loser of QF2)
            team1WeeklyPoints: 0,
            team2WeeklyPoints: 0,
            winner: null, // Becomes QFLTS
            loser: null,  // Becomes QFLBS
            winnerLabel: 'QFLTS', // Third Seed
            loserLabel: 'QFLBS',  // Bottom Seed
            completed: false
          }
        },
        
        // Week 14 - Finals + Placement Games
        week14: {
          championship: {
            matchupId: 'championship',
            matchupName: 'CHAMPIONSHIP GAME',
            week: 14,
            playoffWeek: 3,
            team1: null, // Winner of SF1
            team2: null, // Winner of SF2
            team1WeeklyPoints: 0,
            team2WeeklyPoints: 0,
            winner: null,
            loser: null,
            completed: false,
            prizes: {
              winner: { money: 175, draftPick: 12, title: 'CHAMPION' },
              loser: { money: 100, draftPick: 11 }
            }
          },
          thirdPlace: {
            matchupId: 'thirdPlace',
            matchupName: '3rd Place Game',
            week: 14,
            playoffWeek: 3,
            team1: null, // QFLTS (winner of consolation QF)
            team2: null, // Higher scorer of SFL1/SFL2 (determined after Week 13)
            team1WeeklyPoints: 0,
            team2WeeklyPoints: 0,
            winner: null,
            loser: null,
            completed: false,
            prizes: {
              winner: { draftPick: 2 },
              loser: { draftPick: 4 }
            }
          },
          fifthPlace: {
            matchupId: 'fifthPlace',
            matchupName: '5th Place Game',
            week: 14,
            playoffWeek: 3,
            team1: null, // QFLBS (loser of consolation QF)
            team2: null, // Lower scorer of SFL1/SFL2 (determined after Week 13)
            team1WeeklyPoints: 0,
            team2WeeklyPoints: 0,
            winner: null,
            loser: null,
            completed: false,
            prizes: {
              winner: { draftPick: 3 },
              loser: { draftPick: 5 }
            }
          }
        }
      },
      
      // Loser Bracket (Seeds 7-12)
      loserBracket: {
        // Mini League (Seeds 7-11) - Weeks 12 & 13
        miniLeague: {
          description: 'Seeds 7-11 compete for cumulative points over Weeks 12-13',
          participants: [
            { ...seededTeams[6], miniLeagueRank: null },  // Seed 7
            { ...seededTeams[7], miniLeagueRank: null },  // Seed 8
            { ...seededTeams[8], miniLeagueRank: null },  // Seed 9
            { ...seededTeams[9], miniLeagueRank: null },  // Seed 10
            { ...seededTeams[10], miniLeagueRank: null }  // Seed 11
          ],
          week12Points: {}, // { userId: points }
          week13Points: {}, // { userId: points }
          totalPoints: {},  // { userId: total }
          finalRankings: [], // Populated after Week 13 [{userId, totalPoints, rank: 1-5}]
          completed: false
        },
        
        // Seed 12 sits out Weeks 12-13
        toiletBowlParticipant: {
          ...seededTeams[11],
          status: 'Awaits Toilet Bowl in Week 14'
        },
        
        // Week 14 - Placement Games
        week14: {
          firstPickGame: {
            matchupId: 'firstPickGame',
            matchupName: '1st Pick Game',
            week: 14,
            playoffWeek: 3,
            team1: null, // Rank 1 from mini league
            team2: null, // Rank 2 from mini league
            team1WeeklyPoints: 0,
            team2WeeklyPoints: 0,
            winner: null,
            loser: null,
            completed: false,
            prizes: {
              winner: { draftPick: 1, title: '1st Overall Pick' },
              loser: { draftPick: 6 }
            }
          },
          seventhPlace: {
            matchupId: 'seventhPlace',
            matchupName: '7th/8th Place Game',
            week: 14,
            playoffWeek: 3,
            team1: null, // Rank 3 from mini league
            team2: null, // Rank 4 from mini league
            team1WeeklyPoints: 0,
            team2WeeklyPoints: 0,
            winner: null,
            loser: null,
            completed: false,
            prizes: {
              winner: { draftPick: 7 },
              loser: { draftPick: 8 }
            }
          },
          toiletBowl: {
            matchupId: 'toiletBowl',
            matchupName: 'TOILET BOWL 🚽',
            week: 14,
            playoffWeek: 3,
            team1: null, // Rank 5 from mini league
            team2: { // Seed 12
              ...seededTeams[11],
              role: 'seed12',
              weeklyPoints: 0
            },
            team1WeeklyPoints: 0,
            team2WeeklyPoints: 0,
            winner: null,
            loser: null,
            completed: false,
            prizes: {
              winner: { draftPick: 9 },
              loser: { draftPick: 10, title: 'ULTIMATE LOSER 🚽' }
            }
          }
        }
      }
    };

    // Save playoff bracket to Firestore
    await db
      .collection('leagues').doc(leagueId)
      .collection('playoffs').doc('2025')
      .set(playoffBracket);

    console.log('✅ Playoff bracket created and saved to Firestore');

    // Create a summary for response
    const summary = {
      championshipBracket: {
        week12: [
          `QF1: #3 ${seededTeams[2].teamName} vs #6 ${seededTeams[5].teamName}`,
          `QF2: #4 ${seededTeams[3].teamName} vs #5 ${seededTeams[4].teamName}`,
          `Byes: #1 ${seededTeams[0].teamName}, #2 ${seededTeams[1].teamName}`
        ],
        week13: [
          `SF1: #2 ${seededTeams[1].teamName} vs Winner(QF1)`,
          `SF2: #1 ${seededTeams[0].teamName} vs Winner(QF2)`,
          `Consolation: Loser(QF1) vs Loser(QF2)`
        ],
        week14: [
          `Championship: Winner(SF1) vs Winner(SF2)`,
          `3rd Place: QFLTS vs Higher SFL`,
          `5th Place: QFLBS vs Lower SFL`
        ]
      },
      loserBracket: {
        miniLeague: [
          `#7 ${seededTeams[6].teamName}`,
          `#8 ${seededTeams[7].teamName}`,
          `#9 ${seededTeams[8].teamName}`,
          `#10 ${seededTeams[9].teamName}`,
          `#11 ${seededTeams[10].teamName}`,
          `(Compete for cumulative points over Weeks 12-13)`
        ],
        toiletBowlParticipant: `#12 ${seededTeams[11].teamName} (sits out until Week 14)`,
        week14: [
          `1st Pick Game: Mini League Rank 1 vs Rank 2`,
          `7th/8th Place: Mini League Rank 3 vs Rank 4`,
          `Toilet Bowl: Mini League Rank 5 vs #12 Seed`
        ]
      }
    };

    res.json({
      success: true,
      message: '🏆 Playoffs initialized for Week 12',
      seeding: seededTeams.map(t => ({ 
        seed: t.seed, 
        teamName: t.teamName, 
        points: t.points 
      })),
      summary,
      bracketId: '2025'
    });

  } catch (error) {
    console.error('❌ Error initializing playoffs:', error);
    res.status(500).json({ 
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
});

/**
 * Advance playoff week and determine matchups/winners
 * Handles Week 12→13, Week 13→14, and Week 14→Complete
 * 
 * Usage: /advancePlayoffWeek?leagueId=YOUR_LEAGUE_ID
 */
exports.advancePlayoffWeek = onRequest(async (req, res) => {
  try {
    const db = admin.firestore();
    const leagueId = req.query.leagueId;
    
    if (!leagueId) {
      return res.status(400).json({ error: 'leagueId required' });
    }

    // Get current week from config
    const seasonRef = db.collection('config').doc('season');
    const seasonSnap = await seasonRef.get();
    const currentWeek = seasonSnap.data()?.currentWeek || 12;

    if (currentWeek < 12 || currentWeek > 14) {
      return res.status(400).json({ 
        error: `Invalid week for playoff advancement: ${currentWeek}. Must be 12, 13, or 14.` 
      });
    }

    console.log(`🏆 Advancing playoff week ${currentWeek} → ${currentWeek + 1}...`);

    // Get playoff bracket
    const playoffRef = db
      .collection('leagues').doc(leagueId)
      .collection('playoffs').doc('2025');
    
    const playoffSnap = await playoffRef.get();
    
    if (!playoffSnap.exists) {
      return res.status(404).json({ 
        error: 'Playoff bracket not found. Run initializePlayoffs first.' 
      });
    }

    const bracket = playoffSnap.data();

    // Route to appropriate handler based on current week
    let result;
    
    if (currentWeek === 12) {
      result = await advanceFromWeek12(db, leagueId, bracket, playoffRef);
    } else if (currentWeek === 13) {
      result = await advanceFromWeek13(db, leagueId, bracket, playoffRef);
    } else if (currentWeek === 14) {
      result = await finalizePlayoffs(db, leagueId, bracket, playoffRef);
    }

    // Advance global week
    await seasonRef.update({
      currentWeek: currentWeek + 1,
      lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      playoffWeekAdvanced: admin.firestore.FieldValue.serverTimestamp()
    });

    // Snapshot current week standings (like regular season)
    await snapshotPlayoffWeek(db, leagueId, currentWeek, bracket);

    res.json({
      success: true,
      previousWeek: currentWeek,
      newWeek: currentWeek + 1,
      ...result
    });

  } catch (error) {
    console.error('❌ Error advancing playoff week:', error);
    res.status(500).json({ 
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
});

/**
 * Helper: Advance from Week 12 to Week 13
 * Determines QF winners, populates SF matchups
 */
async function advanceFromWeek12(db, leagueId, bracket, playoffRef) {
  console.log('📊 Processing Week 12 results...');

  const week12 = bracket.championshipBracket.week12;
  
  // Get member data for current week 12 points
  const membersSnap = await db
    .collection('leagues').doc(leagueId)
    .collection('members')
    .get();
  
  const memberPoints = {};
  membersSnap.forEach(doc => {
    memberPoints[doc.id] = {
      weeklyPoints: doc.data().weeklyPoints || 0,
      seasonPoints: doc.data().points || 0
    };
  });

  // --- Determine QF1 Winner ---
  const QF1 = week12.QF1;
  const qf1Team1Points = memberPoints[QF1.team1.userId]?.weeklyPoints || 0;
  const qf1Team2Points = memberPoints[QF1.team2.userId]?.weeklyPoints || 0;
  
  const qf1Winner = determineWinner(
    QF1.team1, qf1Team1Points,
    QF1.team2, qf1Team2Points,
    memberPoints
  );
  
  const qf1Loser = qf1Winner.userId === QF1.team1.userId ? QF1.team2 : QF1.team1;
  
  console.log(`QF1 Result: ${qf1Winner.teamName} defeats ${qf1Loser.teamName} (${qf1Winner.weeklyPoints} - ${qf1Loser.weeklyPoints})`);

  // --- Determine QF2 Winner ---
  const QF2 = week12.QF2;
  const qf2Team1Points = memberPoints[QF2.team1.userId]?.weeklyPoints || 0;
  const qf2Team2Points = memberPoints[QF2.team2.userId]?.weeklyPoints || 0;
  
  const qf2Winner = determineWinner(
    QF2.team1, qf2Team1Points,
    QF2.team2, qf2Team2Points,
    memberPoints
  );
  
  const qf2Loser = qf2Winner.userId === QF2.team1.userId ? QF2.team2 : QF2.team1;
  
  console.log(`QF2 Result: ${qf2Winner.teamName} defeats ${qf2Loser.teamName} (${qf2Winner.weeklyPoints} - ${qf2Loser.weeklyPoints})`);

  // --- Update Mini League Week 12 Points ---
  const miniLeague = bracket.loserBracket.miniLeague;
  const week12MiniPoints = {};
  
  miniLeague.participants.forEach(participant => {
    const points = memberPoints[participant.userId]?.weeklyPoints || 0;
    week12MiniPoints[participant.userId] = points;
    console.log(`Mini League - ${participant.teamName}: ${points} pts (Week 12)`);
  });

  // --- Update Bracket for Week 13 ---
  await playoffRef.update({
    // Mark QF games as complete
    'championshipBracket.week12.QF1.completed': true,
    'championshipBracket.week12.QF1.winner': qf1Winner.userId === QF1.team1.userId ? 'team1' : 'team2',
    'championshipBracket.week12.QF1.team1.weeklyPoints': qf1Team1Points,
    'championshipBracket.week12.QF1.team2.weeklyPoints': qf1Team2Points,
    
    'championshipBracket.week12.QF2.completed': true,
    'championshipBracket.week12.QF2.winner': qf2Winner.userId === QF2.team1.userId ? 'team1' : 'team2',
    'championshipBracket.week12.QF2.team1.weeklyPoints': qf2Team1Points,
    'championshipBracket.week12.QF2.team2.weeklyPoints': qf2Team2Points,
    
    // Populate Week 13 matchups
    'championshipBracket.week13.SF1.team2': qf1Winner,
    'championshipBracket.week13.SF2.team2': qf2Winner,
    'championshipBracket.week13.consolationQF.team1': qf1Loser,
    'championshipBracket.week13.consolationQF.team2': qf2Loser,
    
    // Update mini league Week 12 points
    'loserBracket.miniLeague.week12Points': week12MiniPoints,
    
    'currentWeek': 13,
    'lastUpdated': admin.firestore.FieldValue.serverTimestamp()
  });

  return {
    week12Results: {
      QF1: { winner: qf1Winner.teamName, loser: qf1Loser.teamName, score: `${qf1Team1Points}-${qf1Team2Points}` },
      QF2: { winner: qf2Winner.teamName, loser: qf2Loser.teamName, score: `${qf2Team1Points}-${qf2Team2Points}` }
    },
    week13Matchups: {
      SF1: `${bracket.championshipBracket.week13.SF1.team1.teamName} vs ${qf1Winner.teamName}`,
      SF2: `${bracket.championshipBracket.week13.SF2.team1.teamName} vs ${qf2Winner.teamName}`,
      consolationQF: `${qf1Loser.teamName} vs ${qf2Loser.teamName}`
    },
    miniLeagueWeek12: week12MiniPoints
  };
}

/**
 * Helper: Advance from Week 13 to Week 14
 * Determines SF winners, finalizes mini league, creates dynamic Week 14 matchups
 */
async function advanceFromWeek13(db, leagueId, bracket, playoffRef) {
  console.log('📊 Processing Week 13 results...');

  const week13 = bracket.championshipBracket.week13;
  
  // Get member data for current week 13 points
  const membersSnap = await db
    .collection('leagues').doc(leagueId)
    .collection('members')
    .get();
  
  const memberPoints = {};
  membersSnap.forEach(doc => {
    memberPoints[doc.id] = {
      weeklyPoints: doc.data().weeklyPoints || 0,
      seasonPoints: doc.data().points || 0
    };
  });

  // --- Determine SF1 Winner ---
  const SF1 = week13.SF1;
  const sf1Team1Points = memberPoints[SF1.team1.userId]?.weeklyPoints || 0;
  const sf1Team2Points = memberPoints[SF1.team2.userId]?.weeklyPoints || 0;
  
  const sf1Winner = determineWinner(
    SF1.team1, sf1Team1Points,
    SF1.team2, sf1Team2Points,
    memberPoints
  );
  
  const SF1Loser = sf1Winner.userId === SF1.team1.userId ? SF1.team2 : SF1.team1;
  SF1Loser.week13Points = sf1Winner.userId === SF1.team1.userId ? sf1Team2Points : sf1Team1Points;
  
  console.log(`SF1 Result: ${sf1Winner.teamName} defeats ${SF1Loser.teamName} (${sf1Winner.weeklyPoints} - ${SF1Loser.weeklyPoints})`);

  // --- Determine SF2 Winner ---
  const SF2 = week13.SF2;
  const sf2Team1Points = memberPoints[SF2.team1.userId]?.weeklyPoints || 0;
  const sf2Team2Points = memberPoints[SF2.team2.userId]?.weeklyPoints || 0;
  
  const sf2Winner = determineWinner(
    SF2.team1, sf2Team1Points,
    SF2.team2, sf2Team2Points,
    memberPoints
  );
  
  const SF2Loser = sf2Winner.userId === SF2.team1.userId ? SF2.team2 : SF2.team1;
  SF2Loser.week13Points = sf2Winner.userId === SF2.team1.userId ? sf2Team2Points : sf2Team1Points;
  
  console.log(`SF2 Result: ${sf2Winner.teamName} defeats ${SF2Loser.teamName} (${sf2Winner.weeklyPoints} - ${SF2Loser.weeklyPoints})`);

  // --- Determine Consolation QF Winner (QFLTS/QFLBS) ---
  const consolationQF = week13.consolationQF;
  const cqfTeam1Points = memberPoints[consolationQF.team1.userId]?.weeklyPoints || 0;
  const cqfTeam2Points = memberPoints[consolationQF.team2.userId]?.weeklyPoints || 0;
  
  const QFLTS = determineWinner(
    consolationQF.team1, cqfTeam1Points,
    consolationQF.team2, cqfTeam2Points,
    memberPoints
  );
  
  const QFLBS = QFLTS.userId === consolationQF.team1.userId ? consolationQF.team2 : consolationQF.team1;
  
  console.log(`Consolation QF: ${QFLTS.teamName} (QFLTS) defeats ${QFLBS.teamName} (QFLBS)`);

  // --- Dynamic SFL Matchup Assignment ---
  // "QFLTS v SFL1/SFL2 depending on who scored more in the previous week"
  let higherSFL, lowerSFL;
  
  if (SF1Loser.week13Points > SF2Loser.week13Points) {
    higherSFL = SF1Loser;
    lowerSFL = SF2Loser;
    higherSFL.label = 'SFL1';
    lowerSFL.label = 'SFL2';
  } else if (SF2Loser.week13Points > SF1Loser.week13Points) {
    higherSFL = SF2Loser;
    lowerSFL = SF1Loser;
    higherSFL.label = 'SFL2';
    lowerSFL.label = 'SFL1';
  } else {
    // Tie - use season points as tiebreaker
    const sf1SeasonPoints = memberPoints[SF1Loser.userId]?.seasonPoints || 0;
    const sf2SeasonPoints = memberPoints[SF2Loser.userId]?.seasonPoints || 0;
    
    if (sf1SeasonPoints > sf2SeasonPoints) {
      higherSFL = SF1Loser;
      lowerSFL = SF2Loser;
    } else {
      higherSFL = SF2Loser;
      lowerSFL = SF1Loser;
    }
    
    higherSFL.label = higherSFL.userId === SF1Loser.userId ? 'SFL1' : 'SFL2';
    lowerSFL.label = lowerSFL.userId === SF1Loser.userId ? 'SFL1' : 'SFL2';
  }
  
  console.log(`Dynamic matchups: Higher SFL (${higherSFL.label}: ${higherSFL.teamName}) vs QFLTS for 3rd place`);
  console.log(`Dynamic matchups: Lower SFL (${lowerSFL.label}: ${lowerSFL.teamName}) vs QFLBS for 5th place`);

  // --- Finalize Mini League Rankings ---
  const miniLeague = bracket.loserBracket.miniLeague;
  const week13MiniPoints = {};
  const totalMiniPoints = {};
  
  miniLeague.participants.forEach(participant => {
    const week12Pts = miniLeague.week12Points[participant.userId] || 0;
    const week13Pts = memberPoints[participant.userId]?.weeklyPoints || 0;
    const total = week12Pts + week13Pts;
    
    week13MiniPoints[participant.userId] = week13Pts;
    totalMiniPoints[participant.userId] = total;
    
    console.log(`Mini League - ${participant.teamName}: Week 12: ${week12Pts}, Week 13: ${week13Pts}, Total: ${total}`);
  });

  // Sort mini league by total points
  const miniLeagueRankings = miniLeague.participants
    .map(p => ({
      ...p,
      totalPoints: totalMiniPoints[p.userId],
      week12Points: miniLeague.week12Points[p.userId] || 0,
      week13Points: week13MiniPoints[p.userId]
    }))
    .sort((a, b) => {
      if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
      // Tiebreaker: season points
      const aSeasonPts = memberPoints[a.userId]?.seasonPoints || 0;
      const bSeasonPts = memberPoints[b.userId]?.seasonPoints || 0;
      return bSeasonPts - aSeasonPts;
    })
    .map((p, idx) => ({
      ...p,
      miniLeagueRank: idx + 1
    }));

  console.log('Mini League Final Rankings:');
  miniLeagueRankings.forEach(p => {
    console.log(`  #${p.miniLeagueRank}: ${p.teamName} (${p.totalPoints} pts)`);
  });

  // --- Update Bracket for Week 14 ---
  await playoffRef.update({
    // Mark Week 13 games as complete
    'championshipBracket.week13.SF1.completed': true,
    'championshipBracket.week13.SF1.winner': sf1Winner.userId === SF1.team1.userId ? 'team1' : 'team2',
    'championshipBracket.week13.SF1.team1.weeklyPoints': sf1Team1Points,
    'championshipBracket.week13.SF1.team2.weeklyPoints': sf1Team2Points,
    
    'championshipBracket.week13.SF2.completed': true,
    'championshipBracket.week13.SF2.winner': sf2Winner.userId === SF2.team1.userId ? 'team1' : 'team2',
    'championshipBracket.week13.SF2.team1.weeklyPoints': sf2Team1Points,
    'championshipBracket.week13.SF2.team2.weeklyPoints': sf2Team2Points,
    
    'championshipBracket.week13.consolationQF.completed': true,
    'championshipBracket.week13.consolationQF.winner': QFLTS.userId === consolationQF.team1.userId ? 'team1' : 'team2',
    'championshipBracket.week13.consolationQF.team1.weeklyPoints': cqfTeam1Points,
    'championshipBracket.week13.consolationQF.team2.weeklyPoints': cqfTeam2Points,
    
    // Populate Week 14 Championship bracket matchups
    'championshipBracket.week14.championship.team1': sf1Winner,
    'championshipBracket.week14.championship.team2': sf2Winner,
    'championshipBracket.week14.thirdPlace.team1': QFLTS,
    'championshipBracket.week14.thirdPlace.team2': higherSFL,
    'championshipBracket.week14.fifthPlace.team1': QFLBS,
    'championshipBracket.week14.fifthPlace.team2': lowerSFL,
    
    // Finalize mini league
    'loserBracket.miniLeague.week13Points': week13MiniPoints,
    'loserBracket.miniLeague.totalPoints': totalMiniPoints,
    'loserBracket.miniLeague.finalRankings': miniLeagueRankings,
    'loserBracket.miniLeague.completed': true,
    
    // Populate Week 14 Loser bracket matchups
    'loserBracket.week14.firstPickGame.team1': miniLeagueRankings[0],
    'loserBracket.week14.firstPickGame.team2': miniLeagueRankings[1],
    'loserBracket.week14.seventhPlace.team1': miniLeagueRankings[2],
    'loserBracket.week14.seventhPlace.team2': miniLeagueRankings[3],
    'loserBracket.week14.toiletBowl.team1': miniLeagueRankings[4],
    
    'currentWeek': 14,
    'lastUpdated': admin.firestore.FieldValue.serverTimestamp()
  });

  return {
    week13Results: {
      SF1: { winner: sf1Winner.teamName, loser: SF1Loser.teamName, score: `${sf1Team1Points}-${sf1Team2Points}` },
      SF2: { winner: sf2Winner.teamName, loser: SF2Loser.teamName, score: `${sf2Team1Points}-${sf2Team2Points}` },
      consolationQF: { QFLTS: QFLTS.teamName, QFLBS: QFLBS.teamName, score: `${cqfTeam1Points}-${cqfTeam2Points}` }
    },
    week14Matchups: {
      championship: `${sf1Winner.teamName} vs ${sf2Winner.teamName}`,
      thirdPlace: `${QFLTS.teamName} (QFLTS) vs ${higherSFL.teamName} (${higherSFL.label})`,
      fifthPlace: `${QFLBS.teamName} (QFLBS) vs ${lowerSFL.teamName} (${lowerSFL.label})`,
      firstPickGame: `${miniLeagueRankings[0].teamName} vs ${miniLeagueRankings[1].teamName}`,
      seventhPlace: `${miniLeagueRankings[2].teamName} vs ${miniLeagueRankings[3].teamName}`,
      toiletBowl: `${miniLeagueRankings[4].teamName} vs ${bracket.loserBracket.toiletBowlParticipant.teamName}`
    },
    miniLeagueFinalRankings: miniLeagueRankings.map(p => ({ 
      rank: p.miniLeagueRank, 
      teamName: p.teamName, 
      totalPoints: p.totalPoints 
    }))
  };
}

/**
 * Helper: Finalize playoffs after Week 14
 * Crown champion, assign all draft picks
 */
async function finalizePlayoffs(db, leagueId, bracket, playoffRef) {
  console.log('🏆 Finalizing playoffs after Week 14...');

  const week14Champ = bracket.championshipBracket.week14;
  const week14Loser = bracket.loserBracket.week14;
  
  // Get member data for week 14 points
  const membersSnap = await db
    .collection('leagues').doc(leagueId)
    .collection('members')
    .get();
  
  const memberPoints = {};
  membersSnap.forEach(doc => {
    memberPoints[doc.id] = {
      weeklyPoints: doc.data().weeklyPoints || 0,
      seasonPoints: doc.data().points || 0
    };
  });

  const results = {};
  const draftOrder = new Array(12).fill(null);

  // --- Championship Game ---
  const champ = week14Champ.championship;
  const champTeam1Points = memberPoints[champ.team1.userId]?.weeklyPoints || 0;
  const champTeam2Points = memberPoints[champ.team2.userId]?.weeklyPoints || 0;
  
  const champion = determineWinner(
    champ.team1, champTeam1Points,
    champ.team2, champTeam2Points,
    memberPoints
  );
  
  const runnerUp = champion.userId === champ.team1.userId ? champ.team2 : champ.team1;
  
  draftOrder[11] = { ...champion, pick: 12, prize: '$175', title: 'CHAMPION 🏆' };
  draftOrder[10] = { ...runnerUp, pick: 11, prize: '$100', title: 'Runner-Up' };
  
  results.championship = { 
    champion: champion.teamName, 
    runnerUp: runnerUp.teamName, 
    score: `${champTeam1Points}-${champTeam2Points}` 
  };

  // --- 3rd Place Game ---
  const third = week14Champ.thirdPlace;
  const thirdTeam1Points = memberPoints[third.team1.userId]?.weeklyPoints || 0;
  const thirdTeam2Points = memberPoints[third.team2.userId]?.weeklyPoints || 0;
  
  const thirdPlaceWinner = determineWinner(
    third.team1, thirdTeam1Points,
    third.team2, thirdTeam2Points,
    memberPoints
  );
  
  const fourthPlace = thirdPlaceWinner.userId === third.team1.userId ? third.team2 : third.team1;
  
  draftOrder[1] = { ...thirdPlaceWinner, pick: 2, title: '3rd Place' };
  draftOrder[3] = { ...fourthPlace, pick: 4, title: '4th Place' };
  
  results.thirdPlace = { 
    winner: thirdPlaceWinner.teamName, 
    loser: fourthPlace.teamName, 
    score: `${thirdTeam1Points}-${thirdTeam2Points}` 
  };

  // --- 5th Place Game ---
  const fifth = week14Champ.fifthPlace;
  const fifthTeam1Points = memberPoints[fifth.team1.userId]?.weeklyPoints || 0;
  const fifthTeam2Points = memberPoints[fifth.team2.userId]?.weeklyPoints || 0;
  
  const fifthPlaceWinner = determineWinner(
    fifth.team1, fifthTeam1Points,
    fifth.team2, fifthTeam2Points,
    memberPoints
  );
  
  const sixthPlace = fifthPlaceWinner.userId === fifth.team1.userId ? fifth.team2 : fifth.team1;
  
  draftOrder[2] = { ...fifthPlaceWinner, pick: 3, title: '5th Place' };
  draftOrder[4] = { ...sixthPlace, pick: 5, title: '6th Place' };
  
  results.fifthPlace = { 
    winner: fifthPlaceWinner.teamName, 
    loser: sixthPlace.teamName, 
    score: `${fifthTeam1Points}-${fifthTeam2Points}` 
  };

  // --- 1st Pick Game ---
  const firstPick = week14Loser.firstPickGame;
  const fpTeam1Points = memberPoints[firstPick.team1.userId]?.weeklyPoints || 0;
  const fpTeam2Points = memberPoints[firstPick.team2.userId]?.weeklyPoints || 0;
  
  const firstPickWinner = determineWinner(
    firstPick.team1, fpTeam1Points,
    firstPick.team2, fpTeam2Points,
    memberPoints
  );
  
  const sixthPickTeam = firstPickWinner.userId === firstPick.team1.userId ? firstPick.team2 : firstPick.team1;
  
  draftOrder[0] = { ...firstPickWinner, pick: 1, title: '1st Overall Pick' };
  draftOrder[5] = { ...sixthPickTeam, pick: 6, title: '6th Pick' };
  
  results.firstPickGame = { 
    winner: firstPickWinner.teamName, 
    loser: sixthPickTeam.teamName, 
    score: `${fpTeam1Points}-${fpTeam2Points}` 
  };

  // --- 7th/8th Place Game ---
  const seventh = week14Loser.seventhPlace;
  const sevTeam1Points = memberPoints[seventh.team1.userId]?.weeklyPoints || 0;
  const sevTeam2Points = memberPoints[seventh.team2.userId]?.weeklyPoints || 0;
  
  const seventhPlaceWinner = determineWinner(
    seventh.team1, sevTeam1Points,
    seventh.team2, sevTeam2Points,
    memberPoints
  );
  
  const eighthPlace = seventhPlaceWinner.userId === seventh.team1.userId ? seventh.team2 : seventh.team1;
  
  draftOrder[6] = { ...seventhPlaceWinner, pick: 7, title: '7th Place' };
  draftOrder[7] = { ...eighthPlace, pick: 8, title: '8th Place' };
  
  results.seventhPlace = { 
    winner: seventhPlaceWinner.teamName, 
    loser: eighthPlace.teamName, 
    score: `${sevTeam1Points}-${sevTeam2Points}` 
  };

  // --- Toilet Bowl ---
  const toilet = week14Loser.toiletBowl;
  const toiletTeam1Points = memberPoints[toilet.team1.userId]?.weeklyPoints || 0;
  const toiletTeam2Points = memberPoints[toilet.team2.userId]?.weeklyPoints || 0;
  
  const toiletWinner = determineWinner(
    toilet.team1, toiletTeam1Points,
    toilet.team2, toiletTeam2Points,
    memberPoints
  );
  
  const ultimateLoser = toiletWinner.userId === toilet.team1.userId ? toilet.team2 : toilet.team1;
  
  draftOrder[8] = { ...toiletWinner, pick: 9, title: '9th Place' };
  draftOrder[9] = { ...ultimateLoser, pick: 10, title: 'ULTIMATE LOSER 🚽' };
  
  results.toiletBowl = { 
    winner: toiletWinner.teamName, 
    loser: ultimateLoser.teamName, 
    score: `${toiletTeam1Points}-${toiletTeam2Points}` 
  };

  // --- Save Final Results ---
  await playoffRef.update({
    // Mark all Week 14 games complete
    'championshipBracket.week14.championship.completed': true,
    'championshipBracket.week14.championship.winner': champion.userId === champ.team1.userId ? 'team1' : 'team2',
    'championshipBracket.week14.championship.team1.weeklyPoints': champTeam1Points,
    'championshipBracket.week14.championship.team2.weeklyPoints': champTeam2Points,
    
    'championshipBracket.week14.thirdPlace.completed': true,
    'championshipBracket.week14.thirdPlace.winner': thirdPlaceWinner.userId === third.team1.userId ? 'team1' : 'team2',
    'championshipBracket.week14.thirdPlace.team1.weeklyPoints': thirdTeam1Points,
    'championshipBracket.week14.thirdPlace.team2.weeklyPoints': thirdTeam2Points,
    
    'championshipBracket.week14.fifthPlace.completed': true,
    'championshipBracket.week14.fifthPlace.winner': fifthPlaceWinner.userId === fifth.team1.userId ? 'team1' : 'team2',
    'championshipBracket.week14.fifthPlace.team1.weeklyPoints': fifthTeam1Points,
    'championshipBracket.week14.fifthPlace.team2.weeklyPoints': fifthTeam2Points,
    
    'loserBracket.week14.firstPickGame.completed': true,
    'loserBracket.week14.firstPickGame.winner': firstPickWinner.userId === firstPick.team1.userId ? 'team1' : 'team2',
    'loserBracket.week14.firstPickGame.team1.weeklyPoints': fpTeam1Points,
    'loserBracket.week14.firstPickGame.team2.weeklyPoints': fpTeam2Points,
    
    'loserBracket.week14.seventhPlace.completed': true,
    'loserBracket.week14.seventhPlace.winner': seventhPlaceWinner.userId === seventh.team1.userId ? 'team1' : 'team2',
    'loserBracket.week14.seventhPlace.team1.weeklyPoints': sevTeam1Points,
    'loserBracket.week14.seventhPlace.team2.weeklyPoints': sevTeam2Points,
    
    'loserBracket.week14.toiletBowl.completed': true,
    'loserBracket.week14.toiletBowl.winner': toiletWinner.userId === toilet.team1.userId ? 'team1' : 'team2',
    'loserBracket.week14.toiletBowl.team1.weeklyPoints': toiletTeam1Points,
    'loserBracket.week14.toiletBowl.team2.weeklyPoints': toiletTeam2Points,
    
    'finalDraftOrder': draftOrder,
    'playoffsComplete': true,
    'completedAt': admin.firestore.FieldValue.serverTimestamp()
  });

  console.log('🏆 PLAYOFFS COMPLETE!');
  console.log(`Champion: ${champion.teamName}`);
  console.log(`Ultimate Loser: ${ultimateLoser.teamName}`);

  return {
    results,
    finalDraftOrder: draftOrder.map(d => ({ 
      pick: d.pick, 
      teamName: d.teamName, 
      title: d.title,
      prize: d.prize 
    }))
  };
}

/**
 * Helper: Determine winner with tiebreaker logic
 */
function determineWinner(team1, team1WeeklyPoints, team2, team2WeeklyPoints, memberPoints) {
  // Add weekly points to team objects for logging
  team1 = { ...team1, weeklyPoints: team1WeeklyPoints };
  team2 = { ...team2, weeklyPoints: team2WeeklyPoints };
  
  if (team1WeeklyPoints > team2WeeklyPoints) {
    return team1;
  } else if (team2WeeklyPoints > team1WeeklyPoints) {
    return team2;
  } else {
    // Tiebreaker 1: Season points
    const team1SeasonPoints = memberPoints[team1.userId]?.seasonPoints || 0;
    const team2SeasonPoints = memberPoints[team2.userId]?.seasonPoints || 0;
    
    if (team1SeasonPoints > team2SeasonPoints) {
      console.log(`  Tiebreaker (season pts): ${team1.teamName} (${team1SeasonPoints}) > ${team2.teamName} (${team2SeasonPoints})`);
      return team1;
    } else if (team2SeasonPoints > team1SeasonPoints) {
      console.log(`  Tiebreaker (season pts): ${team2.teamName} (${team2SeasonPoints}) > ${team1.teamName} (${team1SeasonPoints})`);
      return team2;
    } else {
      // Tiebreaker 2: Coin flip
      const coinFlip = Math.random() > 0.5;
      console.log(`  Tiebreaker (coin flip): ${coinFlip ? team1.teamName : team2.teamName} wins`);
      return coinFlip ? team1 : team2;
    }
  }
}

/**
 * Helper: Snapshot playoff week like regular season
 */
async function snapshotPlayoffWeek(db, leagueId, week, bracket) {
  console.log(`📸 Snapshotting playoff week ${week}...`);
  
  const membersSnap = await db
    .collection('leagues').doc(leagueId)
    .collection('members')
    .get();
  
  for (const memberDoc of membersSnap.docs) {
    const memberData = memberDoc.data();
    const userId = memberDoc.id;
    
    const weeklyStandingsRef = db
      .collection('leagues').doc(leagueId)
      .collection('weeklyStandings').doc(userId);
    
    const snapshotData = {
      [`week${week}`]: {
        points: memberData.points || 0,
        weeklyPoints: memberData.weeklyPoints || 0,
        rank: null, // Not applicable in playoffs
        teamName: memberData.teamName || 'Unknown Team',
        email: memberData.email || 'Unknown',
        snapshotAt: admin.firestore.FieldValue.serverTimestamp(),
        playoffWeek: true,
        lineup: {
          starters: memberData.lineup?.starters || [],
          bench: memberData.lineup?.bench || [],
          captain: memberData.lineup?.captain || null,
          tripPlayTeam: memberData.lineup?.tripPlayTeam || null
        }
      }
    };
    
    await weeklyStandingsRef.set(snapshotData, { merge: true });
  }
  
  console.log(`✅ Week ${week} playoff snapshot complete`);
}