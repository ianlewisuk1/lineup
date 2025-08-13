// debug-league.js
const admin = require('firebase-admin');

// Initialize Firebase Admin
const serviceAccount = require('./serviceAccountKey.json'); // if in the same folder

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function debugLeague() {
  const leagueId = 'cGOwzgjl9PDRzBmJKRhu';
  
  console.log('🔍 Debugging league data...');
  console.log(`League ID: ${leagueId}`);
  
  try {
    // Check if leagues collection exists
    console.log('\n📋 Checking leagues collection...');
    const leaguesSnap = await db.collection('leagues').get();
    console.log(`Found ${leaguesSnap.size} leagues total`);
    
    leaguesSnap.forEach(doc => {
      console.log(`  - League: ${doc.id}`);
    });
    
    // Check specific league
    console.log(`\n🎯 Checking specific league: ${leagueId}`);
    const leagueRef = db.doc(`leagues/${leagueId}`);
    const leagueSnap = await leagueRef.get();
    
    if (!leagueSnap.exists()) {
      console.log('❌ League document does not exist!');
      return;
    }
    
    console.log('✅ League document exists');
    console.log('League data:', leagueSnap.data());
    
    // Check members subcollection
    console.log('\n👥 Checking members subcollection...');
    const membersRef = db.collection(`leagues/${leagueId}/members`);
    const membersSnap = await membersRef.get();
    
    console.log(`Found ${membersSnap.size} members`);
    
    membersSnap.forEach(memberDoc => {
      const memberData = memberDoc.data();
      console.log(`  - Member: ${memberDoc.id}`);
      console.log(`    Team: ${memberData.teamName || 'Unknown'}`);
      console.log(`    Has lineup: ${!!memberData.lineup}`);
      if (memberData.lineup) {
        console.log(`    Starters: ${memberData.lineup.starters?.length || 0}`);
        console.log(`    Bench: ${memberData.lineup.bench?.length || 0}`);
      }
    });
    
    // Check if weeklyLineups already exist
    console.log('\n📅 Checking existing weekly lineups...');
    const weeklyLineupsRef = db.collection(`leagues/${leagueId}/weeklyLineups`);
    const weeklySnap = await weeklyLineupsRef.get();
    
    console.log(`Found ${weeklySnap.size} existing weekly lineups`);
    
    weeklySnap.forEach(doc => {
      console.log(`  - User: ${doc.id} already has weekly lineups`);
    });
    
  } catch (error) {
    console.error('💥 Debug failed:', error);
  } finally {
    process.exit(0);
  }
}

debugLeague();