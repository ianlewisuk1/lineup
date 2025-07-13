import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { initializeApp } from "firebase/app";
import { getFirestore, setDoc, doc } from "firebase/firestore";

// Resolve __dirname in ES module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load team data from JSON manually
const filePath = path.join(__dirname, "../src/data/teamData.json");
const teamData = JSON.parse(fs.readFileSync(filePath, "utf8"));

// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyC-twFTNmkXOPsVIelzPW6lwSKxzOno0Tw",
  authDomain: "lineupcfb.firebaseapp.com",
  projectId: "lineupcfb",
  storageBucket: "lineupcfb.firebasestorage.app",
  messagingSenderId: "505858001263",
  appId: "1:505858001263:web:615d70f0d31472e151409a",
  measurementId: "G-LVYMJ92C4P"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const uploadTeams = async () => {
  try {
    for (const team of teamData) {
      const rawName = team.School;

      if (!rawName || typeof rawName !== "string") {
        console.warn("⚠️ Skipping team due to invalid name field:", team);
        continue;
      }

      const docId = rawName.replace(/\s+/g, "_");

      await setDoc(doc(db, "teams", docId), team);
      console.log(`✅ Uploaded: ${docId}`);
    }

    console.log("🎉 All teams uploaded!");
  } catch (err) {
    console.error("❌ Upload failed:", err);
  }
};

uploadTeams();
