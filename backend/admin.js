/**
 * admin.js
 *
 * Admin REST endpoints. All routes require Authorization: Bearer <ADMIN_SECRET>.
 *
 * v2 schema notes:
 *   - weekly_standings uses member_id (not user_id)
 *   - weekly points come from weekly_lineups.points (not league_members.weekly_points)
 *   - team stats live in team_season_stats (not teams)
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
// Snapshots standings for the outgoing week, then advances the global week.
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
    const weekNum = parseInt(String(currentWeek || '').replace(/\D/g, ''), 10);

    // Fetch all members (id + league_id + cumulative points)
    const { data: allMembers } = await supabase
      .from('league_members')
      .select('id, league_id, points');

    // Fetch this week's per-lineup points (what each member scored this week)
    const { data: weekLineups } = await supabase
      .from('weekly_lineups')
      .select('member_id, points')
      .eq('week', weekNum || currentWeek);

    const weeklyPointsMap = {};
    for (const l of weekLineups || []) {
      weeklyPointsMap[l.member_id] = l.points || 0;
    }

    if (allMembers?.length) {
      // Group by league and rank by cumulative points
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
            member_id: m.id,
            week:      weekNum || currentWeek,
            points:    weeklyPointsMap[m.id] || 0,  // weekly score, not cumulative
            rank:      i + 1,
          });
        });
      }

      await supabase
        .from('weekly_standings')
        .upsert(standingsRows, { onConflict: 'league_id,member_id,week' });
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
// Force recalculate all member points for current week.
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
// Clears weekly team stats for a given week in team_season_stats.
// ---------------------------------------------------------------------------
router.post('/reset-team-stats', async (req, res) => {
  try {
    const { week } = req.body;
    if (!week) return res.status(400).json({ error: 'week required' });

    const { data: configRow } = await supabase
      .from('config')
      .select('value')
      .eq('key', 'season')
      .single();

    const year = configRow?.value?.year || new Date().getFullYear();
    const weekKey = String(parseInt(String(week).replace(/\D/g, ''), 10));

    const { data: stats } = await supabase
      .from('team_season_stats')
      .select('team_id, weekly_points, game_points')
      .eq('season_year', year);

    for (const stat of stats || []) {
      const wp = stat.weekly_points || {};
      delete wp[weekKey];
      const gamePoints = Object.values(wp).reduce((a, b) => a + b, 0);
      await supabase
        .from('team_season_stats')
        .update({ weekly_points: wp, game_points: gamePoints })
        .eq('team_id', stat.team_id)
        .eq('season_year', year);
    }

    res.json({ ok: true, week });
  } catch (err) {
    console.error('[reset-team-stats]', err);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /admin/set-fa-lock
// Toggle free agency lock.
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
// POST /admin/import-schedule
// Populates games from CFBD. Safe to re-run — upserts on cfbd_game_id and
// touches schedule columns only, never live scores.
//
// Body: { year?: number, dryRun?: boolean }
// ---------------------------------------------------------------------------
router.post('/import-schedule', async (req, res) => {
  try {
    const { year, dryRun } = req.body || {};

    let season = year;
    if (!season) {
      const { data: configRow } = await supabase
        .from('config')
        .select('value')
        .eq('key', 'season')
        .single();
      season = configRow?.value?.year || new Date().getFullYear();
    }

    const { importSchedule } = require('./schedule');
    const result = await importSchedule(season, { dryRun: Boolean(dryRun) });
    res.json({ ok: true, year: season, ...result });
  } catch (err) {
    console.error('[import-schedule]', err);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// DELETE /admin/user/:uid
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
