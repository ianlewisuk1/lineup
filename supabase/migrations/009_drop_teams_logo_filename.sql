-- 009_drop_teams_logo_filename.sql
-- Removes teams.logo_filename.
--
-- Logos are static PNGs in /public/logos, resolved by team slug via
-- src/utils/teamLogo.js. The column was never populated — it is NULL on all
-- 264 rows — and the frontend code that read it was removed, so it resolved to
-- "no logo" wherever it was consulted.
--
-- Verified before writing this migration:
--   select count(*) from teams where logo_filename is not null;  -- 0
--   grep -rn "logo_filename" src backend             -- no reads remain
--
-- Irreversible, but discards no data. If a per-team logo override is ever
-- needed again, re-add the column and teach teamLogoUrl() to prefer it.

BEGIN;

ALTER TABLE teams DROP COLUMN IF EXISTS logo_filename;

COMMIT;
