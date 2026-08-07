-- 019_games_schedule_fields.sql
-- Fields the CFBD schedule import needs that games does not yet carry.
--
-- Context: the games table has been empty since the Supabase migration. Nothing
-- ever populated it — backend/espn.js and backend/cfbd.js both only UPDATE rows
-- that already exist, so both cron jobs have been looping over an empty list.
-- backend/schedule.js fills it; these three columns are what it needs.
--
-- season_type
--   CFBD splits its schedule into seasonType=regular and seasonType=postseason,
--   each with its own week numbering. Bowls and the CFP are week 1 of the
--   postseason, which would collide with week 1 of September. Storing the type
--   separately keeps games.week numeric, so the existing week filters in
--   espn.js and useLeagueData.js keep working untouched.
--
-- start_time_tbd
--   443 of the 888 FBS games on the 2026 schedule have startTimeTBD: true at
--   the time of writing — kickoff is not set until roughly 12 days out. Without
--   this flag those games render as a real kickoff time that is actually a
--   placeholder. The UI should show "TBD" instead.
--
-- conference_game
--   Free on the CFBD games payload, and teams already tracks conf_record.

ALTER TABLE games
  ADD COLUMN IF NOT EXISTS season_type     TEXT    DEFAULT 'regular',
  ADD COLUMN IF NOT EXISTS start_time_tbd  BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS conference_game BOOLEAN;

COMMENT ON COLUMN games.season_type IS
  '''regular'' or ''postseason''. Week numbering restarts within each.';
COMMENT ON COLUMN games.start_time_tbd IS
  'True when CFBD has not set kickoff yet — game_time is a placeholder, show "TBD".';
COMMENT ON COLUMN games.conference_game IS
  'True when both teams share a conference.';

-- games.week is TEXT and holds a numeric string. The uniqueness that matters is
-- cfbd_game_id, which 001_initial_schema.sql already declares UNIQUE — that is
-- what makes the import re-runnable via upsert rather than duplicating rows.

-- The import re-runs weekly to pick up firmed kickoff times and the postseason
-- schedule once it is published, so lookups by (year, season_type, week) are hot.
CREATE INDEX IF NOT EXISTS games_season_week_idx
  ON games (year, season_type, week);

-- Verification:
--
-- SELECT season_type, week, COUNT(*) FROM games
-- WHERE year = 2026 GROUP BY season_type, week ORDER BY season_type, week::int;
