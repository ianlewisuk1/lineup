-- 025_preseason_sos_rank.sql
-- Add strength of schedule to team_preseason_stats.
--
-- Why here and not team_season_stats:
--   team_season_stats.sos_rank already exists and is an in-season number — it
--   belongs to the same row the cron jobs rewrite with records, points and
--   spreads all year. The Scouting page is pre-draft only, and everything else
--   it reads (conf_odds, power_rank, ret_starters, predicted_wins) comes from
--   team_preseason_stats. Putting SOS anywhere else would make Scouting join
--   two tables to build one row for no gain.
--
--   The two are also different measurements and will not agree. Preseason SOS
--   is a projection over the whole published schedule; the in-season one moves
--   as games are played. Storing them in one column would silently overwrite
--   the pre-draft value once the season starts.
--
-- Ranks run 1..N over FBS, 1 = hardest schedule. Nullable with no default, so
-- an unpopulated season renders "-" on Scouting rather than sorting to #1.
--
-- Populate with:
--   cd backend && node scripts/import-sos.js 2026          # dry run
--   cd backend && node scripts/import-sos.js 2026 --write

ALTER TABLE team_preseason_stats
  ADD COLUMN IF NOT EXISTS sos_rank int;

COMMENT ON COLUMN team_preseason_stats.sos_rank IS
  'Preseason strength of schedule rank over the full published schedule, 1 = hardest. Source: ESPN FPI resume.avgsosrank via backend/scripts/import-sos.js.';
