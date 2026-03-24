/**
 * Draft auto-pick job.
 *
 * Runs every 15 seconds. Finds any active draft where pick_deadline
 * has passed and the current picker hasn't made a pick, then
 * auto-picks the highest-ranked available team for them.
 */

const { supabase } = require('./db');

async function runAutoPickJobs() {
  // Find all active drafts where the deadline has passed
  const { data: expiredDrafts, error } = await supabase
    .from('drafts')
    .select('id, league_id, draft_order, current_pick, total_rounds, pick_deadline')
    .eq('status', 'active')
    .lt('pick_deadline', new Date().toISOString());

  if (error) {
    console.error('[Draft auto-pick] Query error:', error.message);
    return;
  }

  if (!expiredDrafts || expiredDrafts.length === 0) return;

  for (const draft of expiredDrafts) {
    try {
      await autoPick(draft);
    } catch (err) {
      console.error(`[Draft auto-pick] Error for draft ${draft.id}:`, err.message);
    }
  }
}

async function autoPick(draft) {
  const { id: draftId } = draft;

  // Get already-picked team IDs for this draft
  const { data: picks } = await supabase
    .from('draft_picks')
    .select('team_id')
    .eq('draft_id', draftId);

  const pickedIds = new Set((picks ?? []).map((p) => p.team_id));

  // Get best available FBS team ranked by game_points from team_season_stats.
  // Falls back to alphabetical order if season stats are not yet populated (offseason).
  const { data: fbsTeams } = await supabase
    .from('teams')
    .select('id, school')
    .in('classification', ['fbs', 'FBS']);

  const fbsIds = (fbsTeams ?? []).map((t) => t.id);

  const { data: stats } = await supabase
    .from('team_season_stats')
    .select('team_id, game_points')
    .in('team_id', fbsIds)
    .order('game_points', { ascending: false });

  // Build ranked list: stats-ranked first, then any FBS teams missing from stats
  const rankedIds = (stats ?? []).map((s) => s.team_id);
  const unrankedIds = fbsIds.filter((id) => !rankedIds.includes(id)).sort();
  const allRanked = [...rankedIds, ...unrankedIds];

  const bestTeamId = allRanked.find((id) => !pickedIds.has(id));
  const bestTeam = (fbsTeams ?? []).find((t) => t.id === bestTeamId);

  if (!bestTeam) {
    console.warn(`[Draft auto-pick] No available team found for draft ${draftId}`);
    return;
  }

  // Call make_pick RPC (service role bypasses turn check via p_auto_pick=true)
  const { data: result, error } = await supabase.rpc('make_pick', {
    p_draft_id:  draftId,
    p_team_id:   bestTeam.id,
    p_auto_pick: true,
  });

  if (error) {
    console.error(`[Draft auto-pick] make_pick error for draft ${draftId}:`, error.message);
    return;
  }

  if (result?.error) {
    console.error(`[Draft auto-pick] make_pick rejected for draft ${draftId}:`, result.error);
    return;
  }

  console.log(`[Draft auto-pick] Auto-picked ${bestTeam.school} for draft ${draftId} (pick #${result?.pick_number})`);
}

async function runAutoStartJobs() {
  // Find leagues whose draft_date has passed and draft is still pending
  const { data: leagues, error } = await supabase
    .from('leagues')
    .select('id')
    .lte('draft_date', new Date().toISOString())
    .not('draft_date', 'is', null);

  if (error || !leagues?.length) return;

  for (const league of leagues) {
    const { data: draft } = await supabase
      .from('drafts')
      .select('id, status')
      .eq('league_id', league.id)
      .single();

    if (!draft || draft.status !== 'pending') continue;

    const { data: result, error: startError } = await supabase.rpc('start_draft', {
      p_league_id: league.id,
    });

    if (startError) {
      console.error(`[Draft auto-start] Error for league ${league.id}:`, startError.message);
    } else if (result?.error) {
      console.error(`[Draft auto-start] Rejected for league ${league.id}:`, result.error);
    } else {
      console.log(`[Draft auto-start] Started draft for league ${league.id}`);
    }
  }
}

module.exports = { runAutoPickJobs, runAutoStartJobs };
