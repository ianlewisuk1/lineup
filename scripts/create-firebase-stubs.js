#!/usr/bin/env node
/**
 * create-firebase-stubs.js
 *
 * Creates stub files in node_modules/firebase/ so that files still importing
 * from 'firebase/firestore', 'firebase/auth', etc. compile during the
 * Supabase migration. Delete this script (and the postinstall hook) once all
 * files have been migrated to Supabase.
 */

const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'node_modules', 'firebase');
fs.mkdirSync(dir, { recursive: true });

fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
  name: 'firebase',
  version: '0.0.1-shim',
  description: 'Supabase migration shim',
  main: 'index.js',
  exports: {
    '.': './index.js',
    './firestore': './firestore.js',
    './auth': './auth.js',
    './storage': './storage.js',
    './app': './app.js',
  },
}, null, 2));

fs.writeFileSync(path.join(dir, 'index.js'), '// Supabase migration shim\nmodule.exports = {};\n');

fs.writeFileSync(path.join(dir, 'app.js'), `// Supabase migration shim — stubs for firebase/app
const noop = () => {};
module.exports = { initializeApp: noop, getApp: noop, getApps: () => [] };
`);

fs.writeFileSync(path.join(dir, 'auth.js'), `// Supabase migration shim — stubs for firebase/auth
const noop = () => {};
const noopAsync = async () => {};
module.exports = {
  getAuth: noop,
  signInWithEmailAndPassword: noopAsync,
  createUserWithEmailAndPassword: noopAsync,
  signOut: noopAsync,
  onAuthStateChanged: () => noop,
  sendPasswordResetEmail: noopAsync,
  updateProfile: noopAsync,
  updateEmail: noopAsync,
  updatePassword: noopAsync,
  setPersistence: noopAsync,
  browserLocalPersistence: 'LOCAL',
  browserSessionPersistence: 'SESSION',
  EmailAuthProvider: { credential: noop },
  reauthenticateWithCredential: noopAsync,
  GoogleAuthProvider: function() {},
  signInWithPopup: noopAsync,
};
`);

fs.writeFileSync(path.join(dir, 'firestore.js'), `// Supabase migration shim — stubs for firebase/firestore
const noop = () => {};
const noopAsync = async () => {};
module.exports = {
  collection: noop,
  doc: noop,
  getDoc: noopAsync,
  getDocs: noopAsync,
  setDoc: noopAsync,
  updateDoc: noopAsync,
  addDoc: noopAsync,
  deleteDoc: noopAsync,
  query: noop,
  where: noop,
  orderBy: noop,
  limit: noop,
  onSnapshot: () => noop,
  serverTimestamp: noop,
  increment: (n) => n,
  arrayUnion: (...args) => args,
  arrayRemove: (...args) => args,
  writeBatch: () => ({ set: noop, update: noop, delete: noop, commit: noopAsync }),
  runTransaction: noopAsync,
  getFirestore: noop,
  initializeFirestore: noop,
  Timestamp: { now: () => ({ toDate: () => new Date() }), fromDate: (d) => ({ toDate: () => d }) },
};
`);

fs.writeFileSync(path.join(dir, 'storage.js'), `// Supabase migration shim — stubs for firebase/storage
const noop = () => {};
const noopAsync = async () => {};
module.exports = {
  getStorage: noop,
  ref: noop,
  uploadBytes: noopAsync,
  uploadString: noopAsync,
  getDownloadURL: noopAsync,
  deleteObject: noopAsync,
  listAll: noopAsync,
};
`);

console.log('[postinstall] Firebase migration shims created in node_modules/firebase/');
