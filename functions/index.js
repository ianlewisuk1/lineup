const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();

exports.deleteAuthUser = functions.https.onCall(async (data, context) => {
  // Verify the caller is authenticated
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
  }

  // Optional: Add admin verification
  // You can check if the user is an admin by checking their custom claims or Firestore document
  const callerUid = context.auth.uid;
  const userDoc = await admin.firestore().collection('users').doc(callerUid).get();
  
  if (!userDoc.exists || !userDoc.data().isAdmin) {
    throw new functions.https.HttpsError('permission-denied', 'Only admins can delete users.');
  }

  const { uid } = data;
  
  if (!uid) {
    throw new functions.https.HttpsError('invalid-argument', 'UID is required.');
  }

  try {
    // Delete the user from Firebase Authentication
    await admin.auth().deleteUser(uid);
    console.log(`Successfully deleted auth user: ${uid}`);
    
    return { 
      success: true, 
      message: `User ${uid} deleted successfully from Authentication` 
    };
  } catch (error) {
    console.error('Error deleting user:', error);
    
    // Handle case where user doesn't exist in auth
    if (error.code === 'auth/user-not-found') {
      return { 
        success: true, 
        message: `User ${uid} was not found in Authentication (may have been deleted already)` 
      };
    }
    
    throw new functions.https.HttpsError('internal', `Failed to delete user: ${error.message}`);
  }
});