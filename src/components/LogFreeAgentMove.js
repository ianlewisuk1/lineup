// src/utils/logFreeAgentMove.js
import { db } from '../firebase/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

export async function logFreeAgentMove(leagueId, moveData) {
  console.log('🚀 Starting to log move:', { leagueId, moveData });
  
  try {
    const move = {
      userId: moveData.userId,
      teamName: moveData.teamName,
      pickedUp: moveData.pickedUp || null,
      dropped: moveData.dropped || null,
      timestamp: serverTimestamp(),
      week: moveData.week || 'Unknown',
      moveType: moveData.moveType || 'swap' // 'pickup', 'drop', 'swap'
    };

    console.log('📝 Move object to save:', move);
    console.log('🎯 Collection path:', `leagues/${leagueId}/moveHistory`);

    const moveRef = await addDoc(
      collection(db, 'leagues', leagueId, 'moveHistory'),
      move
    );

    console.log('✅ Free agent move logged successfully:', moveRef.id);
    return moveRef.id;
  } catch (error) {
    console.error('❌ Error logging free agent move:', error);
    console.error('Error details:', error.message);
    throw error;
  }
}