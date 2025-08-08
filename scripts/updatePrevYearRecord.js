// scripts/updatePrevYearRecord.js

import fs from "fs";
import csvParser from "csv-parser";
import { initializeApp } from "firebase/app";
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  updateDoc,
} from "firebase/firestore";

// 🔐 Step 1: Add your Firebase web config below
const firebaseConfig = {
  apiKey: "AIzaSyC-twFTNmkXOPsVIelzPW6lwSKxzOno0Tw",
  authDomain: "lineupcfb.firebaseapp.com",
  projectId: "lineupcfb",
  storageBucket: "lineupcfb.firebasestorage.app",
  messagingSenderId: "505858001263",
  appId: "1:505858001263:web:615d70f0d31472e151409a",
  measurementId: "G-LVYMJ92C4P"
};

// 🔌 Step 2: Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// 🗺️ Step 3: Build school name → doc ID map from Firestore
async function buildSchoolToDocIdMap() {
  const snapshot = await getDocs(collection(db, "teams"));
  const map = {};
  snapshot.forEach((docSnap) => {
    const data = docSnap.data();
    if (data.school) {
      map[data.school.trim()] = docSnap.id;
    }
  });
  return map;
}

// 🧾 Step 4: Read CSV and apply updates
async function updateRecordsFromCSV() {
  const schoolToDocIdMap = await buildSchoolToDocIdMap();
  const unmatchedSchools = [];
  const updates = [];

  fs.createReadStream("scripts/records.csv") // Ensure this matches your file path
    .pipe(csvParser())
    .on("data", (row) => {
      const school = row.School?.trim();
      const record = row.Record?.trim();

      if (!school || !record) return;

      const docId = schoolToDocIdMap[school];
      if (!docId) {
        console.warn(`⚠️ No match found for school: ${school}`);
        unmatchedSchools.push(school);
        return;
      }

      const teamRef = doc(db, "teams", docId);
      updates.push(
        updateDoc(teamRef, { prevYearRecord: record }).then(() => {
          console.log(`✅ Updated ${school} (${docId}) → ${record}`);
        })
      );
    })
    .on("end", async () => {
      await Promise.all(updates);
      console.log("🎉 All records processed.");

      if (unmatchedSchools.length > 0) {
        console.warn("\n⚠️ Unmatched schools:");
        unmatchedSchools.forEach((school) =>
          console.warn(" - " + school)
        );
      }
    });
}

updateRecordsFromCSV().catch(console.error);
