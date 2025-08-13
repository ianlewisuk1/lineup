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

  const dateOnly = (game.startDate || '').slice(0, 10) || null;

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
        nextGameDate: dateOnly,
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

    // NEW: Update schedule collection with proper kickoff times
    if (updateSchedule && g.startDate) {
      const scheduleRef = db
        .collection('schedule').doc(String(year))
        .collection('weeks').doc(String(week))
        .collection('games').doc(gameId);

      bw.set(scheduleRef, {
        gameId,
        homeTeam: g.homeTeam ?? null,
        awayTeam: g.awayTeam ?? null,
        date: g.startDate,  // ← Full timestamp with actual kickoff time!
        week: week,
        season: year,
        venue: g.venue ?? null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        // Keep existing fields like homePoints, awayPoints, gameComplete
      }, { merge: true });

      scheduleUpdated++;
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