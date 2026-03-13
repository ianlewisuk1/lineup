// src/utils/logFreeAgentMove.js
import { supabase } from '../supabase/supabase';

export async function logFreeAgentMove(leagueId, moveData) {
  console.log('🚀 Starting to log move:', { leagueId, moveData });

  try {
    const move = {
      league_id: leagueId,
      user_id: moveData.userId,
      team_name: moveData.teamName,
      picked_up: moveData.pickedUp || null,
      dropped: moveData.dropped || null,
      week: moveData.week || 'Unknown',
      move_type: moveData.moveType || 'swap' // 'pickup', 'drop', 'swap'
    };

    console.log('📝 Move object to save:', move);

    const { data, error } = await supabase
      .from('move_history')
      .insert(move)
      .select('id')
      .single();

    if (error) throw error;

    console.log('✅ Free agent move logged successfully:', data.id);
    return data.id;
  } catch (error) {
    console.error('❌ Error logging free agent move:', error);
    console.error('Error details:', error.message);
    throw error;
  }
}
