-- 015_drop_prev_year_points.sql
-- Remove prev_year_points entirely. The stat is unused by the app.
--
-- Two live tables carried it:
--   team_season_stats.prev_year_points    (migration_2026_03_24.sql:83)
--   team_preseason_stats.prev_year_points (007_team_preseason_stats.sql:11)
--
-- teams.prev_year_points was already dropped by migration_2026_03_24.sql; the
-- statement below is a no-op guard in case an environment missed that migration.
-- Both live columns were NULL on every row when this ran, so no data is lost.

ALTER TABLE teams
  DROP COLUMN IF EXISTS prev_year_points;

ALTER TABLE team_season_stats
  DROP COLUMN IF EXISTS prev_year_points;

ALTER TABLE team_preseason_stats
  DROP COLUMN IF EXISTS prev_year_points;

-- Verification — should return 0 rows:
--
-- SELECT table_name, column_name FROM information_schema.columns
-- WHERE column_name = 'prev_year_points';
