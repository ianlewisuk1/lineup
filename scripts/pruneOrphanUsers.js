// scripts/auditAndPruneUsers.js
const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

// --------- Config (env overrides) ----------
const KEY_PATH = process.env.SERVICE_ACCOUNT_PATH || path.join(__dirname, "serviceAccountKey.json");
const DRY_RUN = (process.env.DRY_RUN ?? "true").toLowerCase() === "true";
const CHECK_MEMBERS = (process.env.CHECK_MEMBERS ?? "true").toLowerCase() === "true";
const MEMBERS_FIELD = process.env.MEMBERS_FIELD || "userId";
// Optional age/inactivity guards (set to 0 to disable)
const DAYS_OLD = Number(process.env.DAYS_OLD ?? 0);
const LAST_SIGNIN_DAYS = Number(process.env.LAST_SIGNIN_DAYS ?? 0);

// Preserve lists (emails and UIDs)
const DEFAULT_PRESERVE_EMAILS = [
  // "you@example.com", // <-- hardcode here if you want
];
const envEmails = (process.env.PRESERVE_EMAILS || "")
  .split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
const PRESERVE_EMAILS = new Set([...DEFAULT_PRESERVE_EMAILS.map(e => e.toLowerCase()), ...envEmails]);

const envUids = (process.env.PRESERVE_UIDS || "")
  .split(",").map(s => s.trim()).filter(Boolean);
const PRESERVE_UIDS = new Set(envUids);
// -------------------------------------------

const serviceAccount = JSON.parse(fs.readFileSync(KEY_PATH, "utf8"));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: serviceAccount.project_id,
});
const auth = admin.auth();
const db = admin.firestore();

function daysAgo(dateStr) {
  if (!dateStr) return Infinity;
  return (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24);
}

function isPreservedAuthUser(u, userDocData) {
  if (PRESERVE_UIDS.has(u.uid)) return true;
  const e1 = (u.email || "").toLowerCase();
  const e2 = ((userDocData && userDocData.email) || "").toLowerCase();
  return (e1 && PRESERVE_EMAILS.has(e1)) || (e2 && PRESERVE_EMAILS.has(e2));
}

function isPreservedDocOnly(uid, data) {
  if (PRESERVE_UIDS.has(uid)) return true;
  const e = ((data && data.email) || "").toLowerCase();
  return e && PRESERVE_EMAILS.has(e);
}

// --- Cross-check guard: probe once, disable if index missing ---
let MEMBERS_CHECK_AVAILABLE = true;
async function probeMembersIndex() {
  if (!CHECK_MEMBERS) { MEMBERS_CHECK_AVAILABLE = false; return; }
  try {
    await db.collectionGroup("members")
      .where(MEMBERS_FIELD, "==", "__index_probe__")
      .limit(1)
      .get();
    MEMBERS_CHECK_AVAILABLE = true;
  } catch (err) {
    if (err && (err.code === 9 || String(err.message || "").includes("FAILED_PRECONDITION"))) {
      MEMBERS_CHECK_AVAILABLE = false;
      console.warn(
        `CollectionGroup check disabled (missing index on members.${MEMBERS_FIELD}). ` +
        `Run with CHECK_MEMBERS=false or enable single-field indexing for that field.`
      );
    } else {
      MEMBERS_CHECK_AVAILABLE = false;
      console.warn("CollectionGroup check disabled due to error:", err?.message || err);
    }
  }
}

async function isInAnyLeague(uid, leagueIdsFromUserDoc) {
  if (leagueIdsFromUserDoc && leagueIdsFromUserDoc.length > 0) return true;
  if (!CHECK_MEMBERS || !MEMBERS_CHECK_AVAILABLE) return false;

  try {
    const qs = await db.collectionGroup("members")
      .where(MEMBERS_FIELD, "==", uid)
      .limit(1)
      .get();
    return !qs.empty;
  } catch (err) {
    if (err && (err.code === 9 || String(err.message || "").includes("FAILED_PRECONDITION"))) {
      MEMBERS_CHECK_AVAILABLE = false;
      console.warn(
        `CollectionGroup check disabled mid-run (missing index on members.${MEMBERS_FIELD}). ` +
        `Continuing without it.`
      );
      return false;
    }
    console.warn("CollectionGroup check error:", err?.message || err);
    return false;
  }
}

async function main() {
  console.log("== Audit & Prune Users ==");
  console.log({
    projectId: serviceAccount.project_id,
    DRY_RUN,
    CHECK_MEMBERS,
    MEMBERS_FIELD,
    DAYS_OLD,
    LAST_SIGNIN_DAYS,
    preserveEmails: [...PRESERVE_EMAILS],
    preserveUids: [...PRESERVE_UIDS],
  });

  // Probe the members index once if enabled
  await probeMembersIndex();

  // --- Load AUTH users ---
  let authUsers = [];
  let nextPageToken;
  do {
    const res = await auth.listUsers(1000, nextPageToken);
    authUsers.push(...res.users);
    nextPageToken = res.pageToken;
  } while (nextPageToken);
  const authUids = new Set(authUsers.map(u => u.uid));

  // --- Load Firestore /users docs ---
  const usersSnap = await db.collection("users").get();
  const fsUsers = [];
  usersSnap.forEach(doc => fsUsers.push({ uid: doc.id, data: doc.data() || {} }));
  const fsUids = new Set(fsUsers.map(u => u.uid));
  // Fast lookup map
  const fsUsersMap = new Map(fsUsers.map(u => [u.uid, u.data]));

  console.log(`Auth users: ${authUsers.length}`);
  console.log(`/users docs: ${fsUsers.length}`);
  if (CHECK_MEMBERS) {
    console.log(`members.${MEMBERS_FIELD} cross-check: ${MEMBERS_CHECK_AVAILABLE ? "enabled" : "disabled"}`);
  }

  const candidatesAuthDelete = [];
  const candidatesDocDeleteOnly = [];
  const infoSkippedDueToGuards = [];

  // A) AUTH accounts
  for (const u of authUsers) {
    const uid = u.uid;
    const userDocData = fsUsersMap.get(uid);
    const leagueIds = Array.isArray(userDocData?.leagueIds) ? userDocData.leagueIds.filter(Boolean) : [];

    if (isPreservedAuthUser(u, userDocData)) {
      console.log(`Preserve AUTH: ${uid} (${u.email || userDocData?.email || "no email"})`);
      continue;
    }

    const inLeague = await isInAnyLeague(uid, leagueIds);
    if (!inLeague) {
      const ageOk = DAYS_OLD ? daysAgo(u.metadata?.creationTime) > DAYS_OLD : true;
      const inactiveOk = LAST_SIGNIN_DAYS ? daysAgo(u.metadata?.lastSignInTime) > LAST_SIGNIN_DAYS : true;

      if (ageOk && inactiveOk) {
        candidatesAuthDelete.push({ uid, email: u.email || null, hasDoc: !!userDocData });
      } else {
        infoSkippedDueToGuards.push({ uid, email: u.email || null, reason: { ageOk, inactiveOk } });
      }
    }
  }

  // B) Firestore-only docs
  for (const { uid, data } of fsUsers) {
    if (authUids.has(uid)) continue;
    if (isPreservedDocOnly(uid, data)) {
      console.log(`Preserve DOC-only: ${uid} (${data.email || "no email"})`);
      continue;
    }
    const leagueIds = Array.isArray(data.leagueIds) ? data.leagueIds.filter(Boolean) : [];
    const inLeague = await isInAnyLeague(uid, leagueIds);
    if (!inLeague) {
      candidatesDocDeleteOnly.push({ uid });
    }
  }

  // Report
  console.log("\n=== AUDIT REPORT ===");
  console.log(`Auth users with NO leagues (eligible by guards): ${candidatesAuthDelete.length}`);
  console.log(`Firestore-only user docs with NO leagues:      ${candidatesDocDeleteOnly.length}`);
  if (infoSkippedDueToGuards.length) {
    console.log(`Skipped by age/inactivity guards:               ${infoSkippedDueToGuards.length}`);
  }

  const sample = (arr) => arr.slice(0, 20).map(x => x.uid);
  console.log("\nSample Auth deletes:", sample(candidatesAuthDelete));
  console.log("Sample Doc-only deletes:", sample(candidatesDocDeleteOnly));

  if (DRY_RUN) {
    console.log("\nDRY_RUN is ON — no deletions performed.");
    return;
  }

  // --- Perform deletions ---
  console.log("\n=== DELETING ===");

  let delAuth = 0;
  for (const { uid, hasDoc } of candidatesAuthDelete) {
    try {
      await auth.deleteUser(uid).catch((e) => {
        if (e?.code !== "auth/user-not-found") throw e;
      });
      if (hasDoc) {
        await db.collection("users").doc(uid).delete().catch(() => {});
      }
      console.log(`Deleted AUTH+DOC: ${uid}`);
      delAuth++;
    } catch (err) {
      console.error(`Failed AUTH delete ${uid}:`, err?.message || err);
    }
  }

  let delDocOnly = 0;
  for (const { uid } of candidatesDocDeleteOnly) {
    try {
      await db.collection("users").doc(uid).delete().catch(() => {});
      console.log(`Deleted DOC-only: ${uid}`);
      delDocOnly++;
    } catch (err) {
      console.error(`Failed DOC delete ${uid}:`, err?.message || err);
    }
  }

  console.log(`\nDone. Deleted AUTH users: ${delAuth}. Deleted DOC-only: ${delDocOnly}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
