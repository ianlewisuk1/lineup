import { auth, db } from "../firebase/firebase";
import {
  doc,
  getDoc,
  getDocs,
  setDoc,
  collection,
  query,
  where
} from "firebase/firestore";

export const populateLeagueMembers = async () => {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    console.error("User not logged in");
    return;
  }

  const userRef = doc(db, "users", currentUser.uid);
  const userSnap = await getDoc(userRef);
  const leagueId = userSnap.data().leagueId;

  if (!leagueId) {
    console.error("No leagueId found for user");
    return;
  }

  const q = query(collection(db, "users"), where("leagueId", "==", leagueId));
  const snapshot = await getDocs(q);

  for (let userDoc of snapshot.docs) {
    const userData = userDoc.data();
    const memberRef = doc(db, "leagues", leagueId, "members", userDoc.id);

    await setDoc(memberRef, {
      teamName: userData.displayName + "'s Team",
      lineup: [],
      email: userData.email,
      displayName: userData.displayName || "",
      joinedAt: new Date(),
    }, { merge: true }); // ✅ prevents overwriting

    console.log(`✅ Added ${userData.email} to league members`);
  }

  console.log("🚀 League members initialized.");
};
