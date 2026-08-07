-- 023_games_drop_duplicate_game_time.sql
-- Remove games.game_time. It duplicates games.date.
--
-- 021 added game_time because 001_initial_schema.sql declares it and a live
-- probe did not find it. That probe was wrong — it checked for "start_date" but
-- not "date", and the live table has carried a "date" timestamptz all along.
-- The result was two kickoff columns, with the schedule import writing one and
-- most of the app reading the other.
--
-- Consolidating on "date" rather than "game_time" because "date" is what the
-- existing call sites already use:
--
--   backend/scoring.js:183                  .gte('date', since)
--   src/pages/MyLineup.js:347               game.date
--   src/components/league/TeamCardModal.js  formatDate(game.date)  (x2)
--   src/pages/AdminSchedulePanel.js         sort + search on g.date
--
-- Note backend/scoring.js:183 is the daily backfillRecentGames cron. It filters
-- games by date, so it would have matched nothing for the whole season had the
-- import kept writing kickoff into game_time.
--
-- Run backend/scripts/import-schedule.js again after this to populate date on
-- the 888 existing rows — the upsert is keyed on cfbd_game_id, so it updates
-- them in place rather than duplicating.

ALTER TABLE games
  DROP COLUMN IF EXISTS game_time;

COMMENT ON COLUMN games.date IS
  'Kickoff (timestamptz). Placeholder value when start_time_tbd is true.';

-- Verification — should return 0 rows for game_time, 888 for a populated date
-- once the import has been re-run:
--
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name = 'games' AND column_name = 'game_time';
--
-- SELECT COUNT(*) FROM games WHERE year = 2026 AND date IS NOT NULL;
