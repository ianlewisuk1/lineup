-- 021_games_restore_missing_columns.sql
-- Restore five games columns that 001_initial_schema.sql declares but the live
-- database does not have.
--
-- The live table drifted from the migration history. 015_drop_prev_year_points
-- references a "migration_2026_03_24.sql" that is not in supabase/migrations/,
-- which is the likely point where games and teams were rebuilt leaner. Whatever
-- the cause, these five are load-bearing:
--
--   cfbd_game_id       backend/schedule.js upserts ON CONFLICT (cfbd_game_id).
--                      Without it the schedule import cannot dedupe and every
--                      weekly refresh would insert 888 duplicate rows.
--
--   game_time          Kickoff. There is currently no kickoff column at all.
--                      Read by src/pages/MyLineup.js and
--                      src/components/league/TeamDrawer.js.
--
--   period             backend/espn.js writes all three on every live score
--   clock              update (espn.js:139-146). Without them that job throws
--   last_score_update  as soon as a game goes in progress, which would have
--                      surfaced on the first Saturday of the season.
--
-- Types match 001_initial_schema.sql exactly so the two agree again.

ALTER TABLE games
  ADD COLUMN IF NOT EXISTS cfbd_game_id      TEXT,
  ADD COLUMN IF NOT EXISTS game_time         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS period            INT,
  ADD COLUMN IF NOT EXISTS clock             TEXT,
  ADD COLUMN IF NOT EXISTS last_score_update TIMESTAMPTZ;

-- UNIQUE on cfbd_game_id is what makes the schedule import re-runnable.
-- Added as a named constraint via guard so this migration is re-runnable too.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'games_cfbd_game_id_key'
  ) THEN
    ALTER TABLE games ADD CONSTRAINT games_cfbd_game_id_key UNIQUE (cfbd_game_id);
  END IF;
END $$;

COMMENT ON COLUMN games.cfbd_game_id IS
  'CFBD game id. Conflict target for the schedule import upsert.';
COMMENT ON COLUMN games.game_time IS
  'Kickoff. Placeholder when start_time_tbd is true.';

-- Verification — should return 5 rows:
--
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'games'
--   AND column_name IN ('cfbd_game_id','game_time','period','clock','last_score_update');
