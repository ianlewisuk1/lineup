const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs } = require('firebase/firestore');

// Replace with your actual Firebase config from your React app
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

async function debugHawaiiSchedule() {
  try {
    console.log('🔍 Debugging Hawaii schedule references...\n');
    
    // Just check one specific path we know exists: 2025/weeks/2/games
    console.log('📅 Checking 2025, week 2...');
    
    const gamesSnapshot = await getDocs(collection(db, 'schedule', '2025', 'weeks', '2', 'games'));
    console.log(`Found ${gamesSnapshot.size} games in week 2`);
    
    gamesSnapshot.forEach(gameDoc => {
      const gameData = gameDoc.data();
      console.log(`\nGame ${gameDoc.id}:`);
      console.log(`  Home: "${gameData.homeTeam}"`);
      console.log(`  Away: "${gameData.awayTeam}"`);
      
      // Check if this is a Hawaii game
      if (gameData.homeTeam?.toLowerCase().includes('hawaii') || 
          gameData.awayTeam?.toLowerCase().includes('hawaii')) {
        console.log(`  🏈 HAWAII GAME FOUND!`);
        console.log(`     Home raw: ${JSON.stringify(gameData.homeTeam)}`);
        console.log(`     Away raw: ${JSON.stringify(gameData.awayTeam)}`);
      }
    });
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
  
  process.exit(0);
}

debugHawaiiSchedule();