/**
 * admin.js
 *
 * Admin REST endpoints. Replaces Firebase HTTP Cloud Functions.
 * All routes require Authorization: Bearer <ADMIN_SECRET> header.
 *
 * Mount in index.js: app.use('/admin', adminRouter)
 */

const express = require('express');
const { supabase } = require('./db');
const { recalculateAllMemberPoints } = require('./scoring');

const router = express.Router();

// ---------------------------------------------------------------------------
// Auth middleware — simple shared secret
// ---------------------------------------------------------------------------
function requireAdmin(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token || token !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

router.use(requireAdmin);

// ---------------------------------------------------------------------------
// POST /admin/advance-week
// Advances the global current week, snapshots standings, resets weekly lineups
// Replaces: advanceWeekAndSnapshot Cloud Function
// ---------------------------------------------------------------------------
router.post('/advance-week', async (req, res) => {
  try {
    const { newWeek } = req.body;
    if (!newWeek) return res.status(400).json({ error: 'newWeek required' });

    const { data: configRow } = await supabase
      .from('config')
      .select('value')
      .eq('key', 'season')
      .single();

    const currentWeek = configRow?.value?.currentWeek;

    // Snapshot all member standings for the outgoing week
    const { data: allMembers } = await supabase
      .from('league_members')
      .select('league_id, user_id, points, weekly_points, team_name');

    if (allMembers?.length) {
      // Group by league and rank
      const byLeague = {};
      for (const m of allMembers) {
        if (!byLeague[m.league_id]) byLeague[m.league_id] = [];
        byLeague[m.league_id].push(m);
      }

      const standingsRows = [];
      for (const [leagueId, members] of Object.entries(byLeague)) {
        const sorted = [...members].sort((a, b) => b.points - a.points);
        sorted.forEach((m, i) => {
          standingsRows.push({
            league_id: leagueId,
            user_id: m.user_id,
            week: currentWeek,
            points: m.points,
            rank: i + 1,
            team_name: m.team_name,
          });
        });
      }

      await supabase
        .from('weekly_standings')
        .upsert(standingsRows, { onConflict: 'league_id,user_id,week' });
    }

    // Advance the week
    await supabase
      .from('config')
      .update({ value: { ...configRow.value, currentWeek: newWeek } })
      .eq('key', 'season');

    res.json({ ok: true, previousWeek: currentWeek, newWeek });
  } catch (err) {
    console.error('[advance-week]', err);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /admin/recalculate-points
// Force recalculate all member points for current week
// Replaces: recalculateMemberPoints Cloud Function
// ---------------------------------------------------------------------------
router.post('/recalculate-points', async (req, res) => {
  try {
    const { data: configRow } = await supabase
      .from('config')
      .select('value')
      .eq('key', 'season')
      .single();

    const currentWeek = configRow?.value?.currentWeek;
    await recalculateAllMemberPoints(currentWeek);
    res.json({ ok: true, week: currentWeek });
  } catch (err) {
    console.error('[recalculate-points]', err);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /admin/reset-team-stats
// Clears weekly team stats for a given week
// Replaces: resetAllTeamStats Cloud Function
// ---------------------------------------------------------------------------
router.post('/reset-team-stats', async (req, res) => {
  try {
    const { week } = req.body;
    if (!week) return res.status(400).json({ error: 'week required' });

    const { data: teams } = await supabase.from('teams').select('id, weekly_points');

    for (const team of teams || []) {
      const wp = team.weekly_points || {};
      delete wp[week];
      const gamePoints = Object.values(wp).reduce((a, b) => a + b, 0);
      await supabase
        .from('teams')
        .update({ weekly_points: wp, game_points: gamePoints })
        .eq('id', team.id);
    }

    res.json({ ok: true, week });
  } catch (err) {
    console.error('[reset-team-stats]', err);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /admin/set-fa-lock
// Toggle free agency lock
// ---------------------------------------------------------------------------
router.post('/set-fa-lock', async (req, res) => {
  try {
    const { locked } = req.body;
    const { data: configRow } = await supabase
      .from('config')
      .select('value')
      .eq('key', 'season')
      .single();

    await supabase
      .from('config')
      .update({ value: { ...configRow.value, faLocked: !!locked } })
      .eq('key', 'season');

    res.json({ ok: true, faLocked: !!locked });
  } catch (err) {
    console.error('[set-fa-lock]', err);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /admin/initialize-playoffs
// Creates the playoff bracket for a league
// Replaces: initializePlayoffs Cloud Function
// The complex bracket generation logic will be ported to playoffs.js
// ---------------------------------------------------------------------------
router.post('/initialize-playoffs', async (req, res) => {
  try {
    const { leagueId, year } = req.body;
    if (!leagueId) return res.status(400).json({ error: 'leagueId required' });

    const { initializePlayoffs } = require('./playoffs');
    const bracket = await initializePlayoffs(leagueId, year || new Date().getFullYear());
    res.json({ ok: true, bracket });
  } catch (err) {
    console.error('[initialize-playoffs]', err);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /admin/advance-playoff-week
// Advances the playoff bracket to the next round
// Replaces: advancePlayoffWeek Cloud Function
// ---------------------------------------------------------------------------
router.post('/advance-playoff-week', async (req, res) => {
  try {
    const { leagueId, fromWeek } = req.body;
    if (!leagueId || !fromWeek) {
      return res.status(400).json({ error: 'leagueId and fromWeek required' });
    }

    const { advancePlayoffWeek } = require('./playoffs');
    await advancePlayoffWeek(leagueId, fromWeek);
    res.json({ ok: true });
  } catch (err) {
    console.error('[advance-playoff-week]', err);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// DELETE /admin/user/:uid
// Deletes a Supabase Auth user (admin only)
// Replaces: deleteAuthUser Cloud Function
// ---------------------------------------------------------------------------
router.delete('/user/:uid', async (req, res) => {
  try {
    const { uid } = req.params;
    const { error } = await supabase.auth.admin.deleteUser(uid);
    if (error) throw error;
    res.json({ ok: true, uid });
  } catch (err) {
    console.error('[delete-user]', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
