/**
 * import-schedule.js — CLI wrapper around schedule.js
 *
 * Run 019_games_schedule_fields.sql first, and make sure teams.cfbd_id is
 * populated (scripts/backfill-team-ids.js).
 *
 * Usage (run from lineup/backend/):
 *   node scripts/import-schedule.js 2026          — dry run
 *   node scripts/import-schedule.js 2026 --write  — apply
 *
 * Safe to re-run. Upserts on cfbd_game_id and never writes score columns.
 */

require('dotenv').config();

const { importSchedule } = require('../schedule');

const yearArg = process.argv.find((a) => /^\d{4}$/.test(a));
const year = yearArg ? parseInt(yearArg, 10) : new Date().getFullYear();
const dryRun = !process.argv.includes('--write');

importSchedule(year, { dryRun })
  .then((result) => {
    console.log('\n[import]', JSON.stringify(
      { year, ...result, unresolvedGames: undefined },
      null,
      1
    ));
    if (dryRun) console.log('[import] re-run with --write to apply.');
  })
  .catch((err) => {
    console.error('[import] failed:', err.message);
    process.exit(1);
  });
