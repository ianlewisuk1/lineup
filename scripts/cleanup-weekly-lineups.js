#!/usr/bin/env node

/**
 * Cleanup Script: Remove WeeklyLineups Test Data
 * 
 * This script will:
 * 1. Connect to your Firestore database
 * 2. Find all documents in leagues/cGOwzgjI9PDRz/weeklyLineups/
 * 3. Delete every document in that collection
 * 4. Leave member.lineup data completely untouched
 * 
 * Purpose: Clean up test data so auto-migration can work properly
 */

const admin = require('firebase-admin');
const path = require('path');

// Initialize Firebase Admin with your service account
const serviceAccount = require('./serviceAccountKey.json'); // Update this path

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://lineupcfb.firebaseio.com" // Update this URL
});

const db = admin.firestore();

async function cleanupWeeklyLineups() {
  try {
    console.log('🧹 Starting cleanup of weeklyLineups collection...');
    console.log('📍 Target: leagues/cGOwzgjI9PDRz/weeklyLineups/');
    
    const leagueId = 'cGOwzgjI9PDRzBmJKRhu';
    
    // Get all documents in the weeklyLineups collection
    const weeklyLineupsRef = db
      .collection('leagues')
      .doc(leagueId)
      .collection('weeklyLineups');
    
    const snapshot = await weeklyLineupsRef.get();
    
    if (snapshot.empty) {
      console.log('✅ No weeklyLineups documents found. Collection is already clean.');
      process.exit(0);
    }
    
    console.log(`🗑️  Found ${snapshot.size} documents to delete:`);
    
    // List what will be deleted
    snapshot.forEach(doc => {
      console.log(`   - User: ${doc.id}`);
      const data = doc.data();
      const weeks = Object.keys(data).filter(key => key.startsWith('week'));
      console.log(`     Weeks: ${weeks.join(', ')}`);
    });
    
    console.log('\n⚠️  This will DELETE all the above data.');
    console.log('💡 Your member.lineup data will remain untouched.');
    console.log('\n🤔 Do you want to continue? (y/N)');
    
    // Wait for user confirmation
    const answer = await getUserInput();
    
    if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
      console.log('❌ Cleanup cancelled by user.');
      process.exit(0);
    }
    
    // Proceed with deletion
    console.log('\n🔥 Deleting documents...');
    
    const batch = db.batch();
    snapshot.forEach(doc => {
      batch.delete(doc.ref);
    });
    
    await batch.commit();
    
    console.log(`✅ Successfully deleted ${snapshot.size} weeklyLineups documents.`);
    console.log('🎉 Cleanup complete! Your system is ready for auto-migration.');
    
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Cleanup failed:', error);
    process.exit(1);
  }
}

// Helper function to get user input
function getUserInput() {
  return new Promise((resolve) => {
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    rl.question('', (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

// Run the cleanup
cleanupWeeklyLineups();