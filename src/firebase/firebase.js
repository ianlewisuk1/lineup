import { initializeApp } from "firebase/app";
import { getAuth, setPersistence, browserLocalPersistence } from "firebase/auth"; // Import setPersistence
import { getFirestore } from "firebase/firestore";

export const firebaseConfig = {
  apiKey: "AIzaSyC-twFTNmkXOPsVIelzPW6lwSKxzOno0Tw",
  authDomain: "lineupcfb.firebaseapp.com",
  projectId: "lineupcfb",
  storageBucket: "lineupcfb.firebasestorage.app",
  messagingSenderId: "505858001263",
  appId: "1:505858001263:web:615d70f0d31472e151409a",
  measurementId: "G-LVYMJ92C4P"
};

const app = initializeApp(firebaseConfig);

// Initialize auth and Firestore
export const auth = getAuth(app);
export const db = getFirestore(app);

// Set persistence to local to ensure session is maintained even after app is closed
setPersistence(auth, browserLocalPersistence)
  .catch((error) => {
    console.error("Error setting persistence:", error);
  });
