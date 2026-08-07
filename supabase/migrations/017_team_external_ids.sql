-- 017_team_external_ids.sql
-- Add stable external identifiers to teams so ingestion stops matching on names.
--
-- Why:
--   backend/espn.js and backend/cfbd.js currently resolve an API team to a row
--   by mashing the API's name through a hand-rolled slug regex. Both copies of
--   that regex strip "&" instead of replacing it with "-", so "Texas A&M"
--   produces "texas-am" and never matches teams.id "texas-a-m". Texas A&M's
--   scores and spreads silently never ingest. Name matching also cannot
--   disambiguate "Miami" (FL vs OH).
--
--   An integer ID is exact: it either matches a row or it does not, and a
--   failure shows up as a NULL you can query for rather than as a team that
--   quietly scores zero all season.
--
-- Both columns are nullable with no default, so every existing query is
-- unaffected. Backfill with:
--
--   cd backend && node scripts/backfill-team-ids.js        # dry run
--   cd backend && node scripts/backfill-team-ids.js --write
--
-- Note: CFBD sources its team IDs from ESPN, so cfbd_id and espn_id hold the
-- same value for all 264 current rows. They are kept separate deliberately —
-- a single shared column would, if the two providers ever diverged for one
-- team, route that team's data to the wrong row with nothing to catch it.

ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS cfbd_id INT,
  ADD COLUMN IF NOT EXISTS espn_id INT;

-- UNIQUE as constraints rather than inline so the migration is re-runnable.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'teams_cfbd_id_key'
  ) THEN
    ALTER TABLE teams ADD CONSTRAINT teams_cfbd_id_key UNIQUE (cfbd_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'teams_espn_id_key'
  ) THEN
    ALTER TABLE teams ADD CONSTRAINT teams_espn_id_key UNIQUE (espn_id);
  END IF;
END $$;

COMMENT ON COLUMN teams.cfbd_id IS
  'College Football Data API team id. Join key for /games and /lines ingestion.';
COMMENT ON COLUMN teams.espn_id IS
  'ESPN team id (competitor.team.id on the scoreboard feed). Join key for live scores.';

-- teams.classification stores lowercase values ('fbs' / 'fcs'), not the
-- uppercase shown in 001_initial_schema.sql. Correct the record here so new
-- queries do not write .eq('classification', 'FBS') and silently match 0 rows.
COMMENT ON COLUMN teams.classification IS
  'Lowercase: ''fbs'' or ''fcs''. Case matters in equality filters.';

-- Verification — should return 0 rows once the backfill has run:
--
-- SELECT id, school FROM teams WHERE cfbd_id IS NULL OR espn_id IS NULL;
