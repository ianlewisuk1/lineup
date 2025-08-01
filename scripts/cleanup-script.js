// Backend cleanup script - Run with: node cleanup-script.js
// Make sure you have firebase-admin installed: npm install firebase-admin

const admin = require('firebase-admin');

// Initialize Firebase Admin (you'll need your service account key)
// Replace with your actual service account key path
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function cleanupTeamGameStatus() {
  try {
    console.log('🚀 Starting backend cleanup...');

    // Step 1: Get current week from global config
    const configDoc = await db.doc('config/season').get();
    if (!configDoc.exists) {
      throw new Error('Season config not found');
    }
    
    const currentWeek = configDoc.data().currentWeek;
    const currentWeekNumber = parseInt(currentWeek.replace(/\D/g, '')) || 0;
    
    console.log(`📅 Current week: ${currentWeek} (Week ${currentWeekNumber})`);

    // Step 2: Get all teams
    const teamsSnapshot = await db.collection('teams').get();
    const teams = [];
    
    teamsSnapshot.forEach(doc => {
      const teamData = doc.data();
      if (teamData.school) {
        teams.push({
          id: doc.id,
          school: teamData.school,
          currentSeason: teamData.currentSeason || {}
        });
      }
    });

    console.log(`🏈 Found ${teams.length} teams to process`);

    // Step 3: Get schedule data for current week
    const scheduleSnapshot = await db
      .collection(`schedule/2025/weeks/${currentWeekNumber}/games`)
      .get();
    
    const games = [];
    scheduleSnapshot.forEach(doc => {
      const gameData = doc.data();
      games.push({
        id: doc.id,
        homeTeam: gameData.homeTeam,
        awayTeam: gameData.awayTeam,
        gameComplete: gameData.gameComplete || false,
        homePoints: gameData.homePoints || null,
        awayPoints: gameData.awayPoints || null
      });
    });

    console.log(`🗓️ Found ${games.length} games scheduled for week ${currentWeekNumber}`);

    // Step 4: Process each team
    let updatedCount = 0;
    let errors = 0;

    for (const team of teams) {
      try {
        // Find this team's game in the schedule
        const teamGame = games.find(game => 
          game.homeTeam === team.school || game.awayTeam === team.school
        );

        let updateData = {};

        if (teamGame) {
          // Team has a game scheduled
          if (teamGame.gameComplete) {
            // Game is complete - set points and status
            const isHomeTeam = teamGame.homeTeam === team.school;
            const teamPoints = isHomeTeam ? teamGame.homePoints : teamGame.awayPoints;
            
            updateData = {
              'currentSeason.gameComplete': true,
              'currentSeason.currentWeekPoints': teamPoints || 0
            };
            
            console.log(`✅ ${team.school}: Game complete, ${teamPoints || 0} points`);
          } else {
            // Game not complete yet - remove currentWeekPoints
            updateData = {
              'currentSeason.gameComplete': false,
              'currentSeason.currentWeekPoints': admin.firestore.FieldValue.delete()
            };
            
            console.log(`⏳ ${team.school}: Game scheduled but not complete`);
          }
        } else {
          // No game found for this team this week (bye week?)
          updateData = {
            'currentSeason.gameComplete': false,
            'currentSeason.currentWeekPoints': admin.firestore.FieldValue.delete()
          };
          
          console.log(`🚫 ${team.school}: No game scheduled (bye week?)`);
        }

        // Update the team document
        await db.doc(`teams/${team.id}`).update(updateData);
        updatedCount++;

      } catch (error) {
        console.error(`❌ Error updating ${team.school}:`, error);
        errors++;
      }
    }

    // Step 5: Summary
    console.log('\n📊 Cleanup Summary:');
    console.log(`✅ Successfully updated: ${updatedCount} teams`);
    console.log(`❌ Errors: ${errors} teams`);
    console.log(`📅 Week processed: ${currentWeek}`);
    
    if (errors === 0) {
      console.log('🎉 Backend cleanup completed successfully!');
    } else {
      console.log('⚠️ Cleanup completed with some errors. Check logs above.');
    }

    // Exit the process
    process.exit(0);

  } catch (error) {
    console.error('💥 Fatal error during cleanup:', error);
    process.exit(1);
  }
}

// Function to clean up a specific week
async function cleanupSpecificWeek(weekNumber) {
  try {
    console.log(`🚀 Starting cleanup for Week ${weekNumber}...`);

    // Get all teams
    const teamsSnapshot = await db.collection('teams').get();
    const teams = [];
    
    teamsSnapshot.forEach(doc => {
      const teamData = doc.data();
      if (teamData.school) {
        teams.push({
          id: doc.id,
          school: teamData.school
        });
      }
    });

    // Get schedule for specified week
    const scheduleSnapshot = await db
      .collection(`schedule/2025/weeks/${weekNumber}/games`)
      .get();
    
    const games = [];
    scheduleSnapshot.forEach(doc => {
      const gameData = doc.data();
      games.push({
        homeTeam: gameData.homeTeam,
        awayTeam: gameData.awayTeam,
        gameComplete: gameData.gameComplete || false,
        homePoints: gameData.homePoints || null,
        awayPoints: gameData.awayPoints || null
      });
    });

    console.log(`Found ${games.length} games for Week ${weekNumber}`);

    // Update teams based on this week's schedule
    for (const team of teams) {
      const teamGame = games.find(game => 
        game.homeTeam === team.school || game.awayTeam === team.school
      );

      let updateData = {};
      if (teamGame && teamGame.gameComplete) {
        const isHomeTeam = teamGame.homeTeam === team.school;
        const teamPoints = isHomeTeam ? teamGame.homePoints : teamGame.awayPoints;
        
        updateData = {
          'currentSeason.gameComplete': true,
          'currentSeason.currentWeekPoints': teamPoints || 0
        };
      } else {
        updateData = {
          'currentSeason.gameComplete': false,
          'currentSeason.currentWeekPoints': admin.firestore.FieldValue.delete()
        };
      }

      await db.doc(`teams/${team.id}`).update(updateData);
    }

    console.log(`✅ Week ${weekNumber} cleanup completed!`);
    process.exit(0);

  } catch (error) {
    console.error(`❌ Error cleaning up Week ${weekNumber}:`, error);
    process.exit(1);
  }
}

// Command line arguments handling
const args = process.argv.slice(2);
if (args.length > 0) {
  const weekNumber = parseInt(args[0]);
  if (isNaN(weekNumber)) {
    console.error('❌ Please provide a valid week number');
    process.exit(1);
  }
  cleanupSpecificWeek(weekNumber);
} else {
  cleanupTeamGameStatus();
}

/*
SETUP INSTRUCTIONS:

1. Install firebase-admin:
   npm install firebase-admin

2. Get your service account key:
   - Go to Firebase Console > Project Settings > Service Accounts
   - Generate new private key
   - Download the JSON file

3. Update the script:
   - Replace './path-to-your-service-account-key.json' with actual path
   - Replace 'your-project-id' with your Firebase project ID

4. Run the script:
   node cleanup-script.js              # Clean current week
   node cleanup-script.js 10           # Clean specific week (10)
*/