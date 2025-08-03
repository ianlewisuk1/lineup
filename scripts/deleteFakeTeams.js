import { initializeApp } from "firebase/app";
import { getFirestore, collection, query, where, getDocs, deleteDoc, doc } from "firebase/firestore";
import { firebaseConfig } from "../src/firebase/firebase.js"; // adjust path if needed

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function deleteFakeTeams() {
  const teamsRef = collection(db, "teams");
  const q = query(teamsRef, where("testTeam", "==", true));

  const snapshot = await getDocs(q);
  if (snapshot.empty) {
    console.log("❌ No fake teams found.");
    return;
  }

  for (const teamDoc of snapshot.docs) {
    await deleteDoc(doc(db, "teams", teamDoc.id));
    console.log(`🗑️ Deleted fake team: ${teamDoc.id}`);
  }

  console.log("✅ All fake teams deleted.");
}

deleteFakeTeams();
