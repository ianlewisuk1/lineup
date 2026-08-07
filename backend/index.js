/**
 * Lineup CFB Backend
 *
 * Replaces Firebase Cloud Functions with a persistent Node.js process
 * that runs scheduled cron jobs and exposes admin REST endpoints.
 *
 * Deployed to Render.com as a Web Service (always-on) from the main branch.
 * A Web Service rather than a Background Worker because it needs a public URL:
 * UptimeRobot pings /health every 5 minutes to prevent free-tier sleep, which
 * would otherwise stall the cron jobs. See render.yaml.
 */

require('dotenv').config();
const express = require('express');
const cron = require('node-cron');

const { ingestESPNScores } = require('./espn');
const { ingestCFBDLines } = require('./cfbd');
const { backfillRecentGames, updateTeamRecords } = require('./scoring');
const { runAutoPickJobs, runAutoStartJobs } = require('./draft');
const { refreshSchedule } = require('./schedule');
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

// Tuesdays at 5 AM — refresh the schedule.
//
// Not a one-shot import. Roughly half the season's kickoff times are TBD when
// first published and firm up about 12 days out, and the postseason schedule
// does not exist until December. Both arrive through this same upsert.
//
// Tuesday because the previous weekend's games are done and the next week's
// times have settled, and 5 AM to stay clear of any live game.
cron.schedule('0 5 * * 2', async () => {
  try {
    await refreshSchedule();
  } catch (err) {
    console.error('[Schedule cron]', err.message);
  }
}, { timezone: 'America/New_York' });

// Every 5 seconds — auto-pick for expired draft timers
setInterval(async () => {
  try {
    await runAutoPickJobs();
  } catch (err) {
    console.error('[Draft auto-pick cron]', err.message);
  }
}, 5_000);

// Every 5 seconds — auto-start drafts whose scheduled time has passed
setInterval(async () => {
  try {
    await runAutoStartJobs();
  } catch (err) {
    console.error('[Draft auto-start cron]', err.message);
  }
}, 5_000);

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
  console.log('  0 5  * * 2    Schedule refresh (CFBD)');
  console.log('  every 5s      Draft auto-pick + auto-start');
});
