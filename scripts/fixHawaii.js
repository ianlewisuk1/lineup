const { initializeApp } = require('firebase/app');
const { getFirestore, doc, getDoc, setDoc, deleteDoc } = require('firebase/firestore');

// Paste your Firebase config here
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

async function fixHawaii() {
  try {
    console.log('Getting hawai-i document...');
    const oldDoc = await getDoc(doc(db, 'teams', 'hawai-i'));
    
    if (!oldDoc.exists()) {
      console.log('❌ Document hawai-i not found');
      return;
    }
    
    console.log('Creating new hawaii document...');
    await setDoc(doc(db, 'teams', 'hawaii'), oldDoc.data());
    
    console.log('Deleting old hawai-i document...');
    await deleteDoc(doc(db, 'teams', 'hawai-i'));
    
    console.log('✅ Successfully changed document ID from hawai-i to hawaii');
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
  
  process.exit(0);
}

fixHawaii();