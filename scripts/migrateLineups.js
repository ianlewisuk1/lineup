const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json'); // adjust path if needed

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function migrateLineups() {
  const leagueId = 'cGOwzgjI9PDRzBmJKRhu'; // change as needed
  const targetWeek = 'week1'; // change as needed

  console.log('🚀 Starting lineup migration...');
  console.log(`League ID: ${leagueId}`);

  try {
    // Pull all members from the subcollection
    const membersSnap = await db.collection(`leagues/${leagueId}/members`).get();
    console.log(`Found ${membersSnap.size} members to process`);

    console.log("Project ID:", admin.app().options.projectId);

    const leaguesCol = await db.collection('leagues').get();
    console.log("Leagues in DB:");
    leaguesCol.forEach(doc => console.log(` - ${doc.id}`));

    if (membersSnap.empty) {
      console.log('No members found — aborting.');
      return;
    }

    let migratedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const memberDoc of membersSnap.docs) {
      const memberId = memberDoc.id;
      const memberData = memberDoc.data();

      if (!memberData.lineup) {
        console.log(`⚠️  Skipping ${memberId} — no lineup found`);
        skippedCount++;
        continue;
      }

      const starters = memberData.lineup.starters || [];
      const bench = memberData.lineup.bench || [];

      try {
        const weeklyRef = db
          .collection(`leagues/${leagueId}/weeklyLineups`)
          .doc(memberId);

        // Merge so we don’t wipe out other weeks
        await weeklyRef.set({
          [targetWeek]: {
            starters,
            bench,
            lockedAt: null
          }
        }, { merge: true });

        console.log(`✅ Migrated lineup for ${memberId}`);
        migratedCount++;
      } catch (err) {
        console.error(`❌ Error migrating ${memberId}:`, err);
        errorCount++;
      }
    }

    console.log('\n🎉 Migration completed!');
    console.log(`   ✅ Successfully migrated: ${migratedCount} users`);
    console.log(`   ⏭ Skipped: ${skippedCount} users`);
    console.log(`   ❌ Errors: ${errorCount} users`);

  } catch (error) {
    console.error('💥 Migration failed:', error);
  } finally {
    process.exit(0);
  }
}

migrateLineups();
