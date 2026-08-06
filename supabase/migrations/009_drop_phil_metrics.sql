-- 009_drop_phil_metrics.sql
-- Remove the Phil Metrics feature entirely.
--
-- Two columns carried it:
--   teams.phil_metrics                  NUMERIC  (001_initial_schema.sql:76)
--   team_preseason_stats.phil_metric_rank INT    (007_team_preseason_stats.sql:5)
--
-- teams.phil_metrics was already dropped by migration_2026_03_24.sql; the
-- statement below is a no-op guard in case an environment missed that migration.
-- team_preseason_stats had 0 rows when this ran, so no data is lost.

ALTER TABLE teams
  DROP COLUMN IF EXISTS phil_metrics;

ALTER TABLE team_preseason_stats
  DROP COLUMN IF EXISTS phil_metric_rank;

-- Verification — both should return 0 rows:
--
-- SELECT table_name, column_name FROM information_schema.columns
-- WHERE column_name ILIKE '%phil%';
