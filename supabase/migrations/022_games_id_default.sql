-- 022_games_id_default.sql
-- Restore the missing default on games.id.
--
-- 001_initial_schema.sql declares:
--   id UUID PRIMARY KEY DEFAULT gen_random_uuid()
--
-- The live column is TEXT, NOT NULL, with no default — more fallout from the
-- untracked rebuild that also cost games its cfbd_game_id, game_time, period,
-- clock and last_score_update columns (see 021).
--
-- Every insert path omits id, expecting the database to mint one:
--   backend/schedule.js               (schedule import — fails on all 888 rows)
--   backend/scripts/simulate-games.js (same latent failure, never hit because
--                                      it was only run against an empty table)
--
-- Failure mode is:
--   null value in column "id" of relation "games" violates not-null constraint
--
-- The column is left TEXT rather than converted to UUID. Nothing reads games.id
-- as a uuid — it is passed around as an opaque string by AdminSchedulePanel and
-- the .eq('id', game.id) filters in espn.js — so a type change would be churn
-- with no benefit and a rewrite risk on any existing reference.

ALTER TABLE games
  ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;

-- Verification — should return 'gen_random_uuid()::text':
--
-- SELECT column_default FROM information_schema.columns
-- WHERE table_name = 'games' AND column_name = 'id';
