/**
 * Lineup CFB Backend
 *
 * Replaces Firebase Cloud Functions with a persistent Node.js process
 * that runs scheduled cron jobs and exposes admin REST endpoints.
 *
 * Deployed to Render.com as a Background Worker (always-on).
 * UptimeRobot pings /health every 5 minutes to prevent free-tier sleep.
 */

require('dotenv').config();
const express = require('express');
const cron = require('node-cron');

const { ingestESPNScores } = require('./espn');
const { ingestCFBDLines } = require('./cfbd');
const { backfillRecentGames, updateTeamRecords } = require('./scoring');
const adminRouter = require('./admin');

const app = express();
app.use(express.json());

// ---------------------------------------------------------------------------
// Health check (keeps Render free tier alive via UptimeRobot)
// ---------------------------------------------------------------------------
app.get('/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// ---------------------------------------------------------------------------
// Admin endpoints (require Authorization: Bearer <ADMIN_SECRET> header)
// ---------------------------------------------------------------------------
app.use('/admin', adminRouter);

// ---------------------------------------------------------------------------
// Scheduled jobs
// ---------------------------------------------------------------------------

// Every 2 minutes — fetch ESPN live scores and recalculate member points
// Only fires during college football season (Aug–Jan)
cron.schedule('*/2 * * * *', async () => {
  try {
    await ingestESPNScores();
  } catch (err) {
    console.error('[ESPN cron]', err.message);
  }
}, { timezone: 'America/New_York' });

// Every 20 minutes — fetch CFBD spread data and update next opponent fields
cron.schedule('*/20 * * * *', async () => {
  try {
    await ingestCFBDLines();
  } catch (err) {
    console.error('[CFBD cron]', err.message);
  }
}, { timezone: 'America/New_York' });

// Daily at 6 AM — catch any games that completed overnight and were missed
cron.schedule('0 6 * * *', async () => {
  try {
    await backfillRecentGames();
  } catch (err) {
    console.error('[Backfill cron]', err.message);
  }
}, { timezone: 'America/New_York' });

// Daily at 8 AM — sync team W-L records from completed schedule
cron.schedule('0 8 * * *', async () => {
  try {
    await updateTeamRecords();
  } catch (err) {
    console.error('[Records cron]', err.message);
  }
}, { timezone: 'America/New_York' });

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Lineup backend running on port ${PORT}`);
  console.log('Cron jobs scheduled:');
  console.log('  */2  * * * *  ESPN score ingestion');
  console.log('  */20 * * * *  CFBD lines ingestion');
  console.log('  0 6  * * *    Backfill recent games');
  console.log('  0 8  * * *    Update team records');
});
