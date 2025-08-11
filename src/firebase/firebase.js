import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, setPersistence, browserLocalPersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyC-twFTNmkXOPsVIelzPW6lwSKxzOno0Tw",
  authDomain: "lineupcfb.firebaseapp.com",
  projectId: "lineupcfb",
  storageBucket: "lineupcfb.firebasestorage.app", // ✅ match Console
  messagingSenderId: "505858001263",
  appId: "1:505858001263:web:615d70f0d31472e151409a",
  measurementId: "G-LVYMJ92C4P",
};

export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app); // no override

setPersistence(auth, browserLocalPersistence).catch(err =>
  console.error("Auth persistence error:", err)
);

// Optional debug
console.log("[firebase]", {
  projectId: app.options.projectId,
  storageBucket: app.options.storageBucket,
});
