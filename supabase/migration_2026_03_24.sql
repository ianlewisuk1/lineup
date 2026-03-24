-- =============================================================
-- Lineup DB Migration — 2026-03-24
-- Safe to run against production.
-- Preserves: users (alter only), teams (alter only), config (untouched)
-- Drops and recreates: all other tables
-- =============================================================

-- -------------------------------------------------------------
-- 1. DROP dependent tables first (order matters for FK constraints)
-- -------------------------------------------------------------
DROP TABLE IF EXISTS weekly_standings CASCADE;
DROP TABLE IF EXISTS move_history CASCADE;
DROP TABLE IF EXISTS draft_picks CASCADE;
DROP TABLE IF EXISTS weekly_lineups CASCADE;
DROP TABLE IF EXISTS league_members CASCADE;
DROP TABLE IF EXISTS drafts CASCADE;
DROP TABLE IF EXISTS leagues CASCADE;
DROP TABLE IF EXISTS games CASCADE;
DROP TABLE IF EXISTS team_season_stats CASCADE;

-- -------------------------------------------------------------
-- 2. ALTER teams — keep static data, drop live columns, add logo_filename
-- -------------------------------------------------------------
ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS logo_filename text;

ALTER TABLE teams
  DROP COLUMN IF EXISTS logos,
  DROP COLUMN IF EXISTS city,
  DROP COLUMN IF EXISTS state,
  DROP COLUMN IF EXISTS stadium,
  DROP COLUMN IF EXISTS capacity,
  DROP COLUMN IF EXISTS timezone,
  DROP COLUMN IF EXISTS sos_rank,
  DROP COLUMN IF EXISTS phil_metrics,
  DROP COLUMN IF EXISTS prev_year_points,
  DROP COLUMN IF EXISTS game_points,
  DROP COLUMN IF EXISTS weekly_points,
  DROP COLUMN IF EXISTS game_status,
  DROP COLUMN IF EXISTS game_complete,
  DROP COLUMN IF EXISTS is_on_bye,
  DROP COLUMN IF EXISTS next_opponent,
  DROP COLUMN IF EXISTS next_game_is_home,
  DROP COLUMN IF EXISTS next_opponent_spread,
  DROP COLUMN IF EXISTS next_opponent_spread_display,
  DROP COLUMN IF EXISTS total_points_for,
  DROP COLUMN IF EXISTS total_points_against,
  DROP COLUMN IF EXISTS ats_record,
  DROP COLUMN IF EXISTS ats_wins,
  DROP COLUMN IF EXISTS ats_losses,
  DROP COLUMN IF EXISTS record,
  DROP COLUMN IF EXISTS conf_record;

-- -------------------------------------------------------------
-- 3. ALTER users — add avatar_url (preserve all existing data)
-- -------------------------------------------------------------
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS avatar_url text;

-- -------------------------------------------------------------
-- 4. CREATE team_season_stats — populated fresh by backend each season
-- -------------------------------------------------------------
CREATE TABLE team_season_stats (
  team_id                      text        NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  season_year                  int         NOT NULL,
  record                       text,
  conf_record                  text,
  ats_record                   text,
  ats_wins                     int         DEFAULT 0,
  ats_losses                   int         DEFAULT 0,
  game_points                  int         DEFAULT 0,
  weekly_points                jsonb       DEFAULT '{}',
  game_status                  text        DEFAULT 'scheduled',
  game_complete                bool        DEFAULT false,
  is_on_bye                    bool        DEFAULT false,
  next_opponent                text,
  next_game_is_home            bool,
  next_opponent_spread         numeric,
  next_opponent_spread_display text,
  total_points_for             int         DEFAULT 0,
  total_points_against         int         DEFAULT 0,
  sos_rank                     int,
  prev_year_points             int,
  PRIMARY KEY (team_id, season_year)
);

-- -------------------------------------------------------------
-- 5. CREATE games
-- -------------------------------------------------------------
CREATE TABLE games (
  id            text        PRIMARY KEY,
  week          int         NOT NULL,
  year          int         NOT NULL,
  home_team     text,
  away_team     text,
  home_score    int,
  away_score    int,
  home_spread   numeric,
  game_status   text        DEFAULT 'scheduled',
  game_complete bool        DEFAULT false,
  neutral_site  bool        DEFAULT false,
  venue         text,
  date          timestamptz
);

-- -------------------------------------------------------------
-- 6. CREATE leagues
-- -------------------------------------------------------------
CREATE TABLE leagues (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text        NOT NULL,
  created_by       uuid        REFERENCES users(id),
  admin_id         uuid        REFERENCES users(id),
  max_managers     int         DEFAULT 8,
  draft_complete   bool        DEFAULT false,
  draft_type       text        DEFAULT 'manual',
  draft_order_type text        DEFAULT 'random',
  scoring_type     text        DEFAULT 'cumulative',
  invite_code      text        UNIQUE,
  draft_date       timestamptz,
  time_per_pick    int
);

-- -------------------------------------------------------------
-- 7. CREATE league_members
-- -------------------------------------------------------------
CREATE TABLE league_members (
  id                  uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id           uuid    NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  user_id             uuid    NOT NULL REFERENCES users(id),
  team_name           text,
  avatar_url          text,
  points              numeric DEFAULT 0,
  has_trip_play       bool    DEFAULT false,
  trip_play_used_week int,
  freezes_remaining   int     DEFAULT 5,
  UNIQUE (league_id, user_id)
);

-- -------------------------------------------------------------
-- 8. CREATE drafts
-- -------------------------------------------------------------
CREATE TABLE drafts (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id    uuid        NOT NULL REFERENCES leagues(id) ON DELETE CASCADE UNIQUE,
  status       text        DEFAULT 'pending',
  draft_order  uuid[],
  current_pick int         DEFAULT 0,
  started_at   timestamptz
);

-- -------------------------------------------------------------
-- 9. CREATE draft_picks
-- -------------------------------------------------------------
CREATE TABLE draft_picks (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id   uuid        NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  member_id   uuid        NOT NULL REFERENCES league_members(id) ON DELETE CASCADE,
  team_id     text        REFERENCES teams(id),
  pick_number int,
  picked_at   timestamptz DEFAULT now()
);

-- -------------------------------------------------------------
-- 10. CREATE weekly_lineups
-- -------------------------------------------------------------
CREATE TABLE weekly_lineups (
  id             uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id      uuid    NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  member_id      uuid    NOT NULL REFERENCES league_members(id) ON DELETE CASCADE,
  week           int     NOT NULL,
  starters       text[]  DEFAULT '{}',
  bench          text[]  DEFAULT '{}',
  captain        text,
  trip_play_team text,
  frozen_teams   text[]  DEFAULT '{}',
  team_points    jsonb   DEFAULT '{}',
  points         numeric DEFAULT 0,
  UNIQUE (league_id, member_id, week)
);

-- -------------------------------------------------------------
-- 11. CREATE move_history
-- -------------------------------------------------------------
CREATE TABLE move_history (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id    uuid        NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  member_id    uuid        NOT NULL REFERENCES league_members(id) ON DELETE CASCADE,
  week         int,
  team_added   text        REFERENCES teams(id),
  team_dropped text,
  created_at   timestamptz DEFAULT now()
);

-- -------------------------------------------------------------
-- 12. CREATE weekly_standings
-- -------------------------------------------------------------
CREATE TABLE weekly_standings (
  league_id   uuid    NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  member_id   uuid    NOT NULL REFERENCES league_members(id) ON DELETE CASCADE,
  week        int     NOT NULL,
  points      numeric DEFAULT 0,
  rank        int,
  PRIMARY KEY (league_id, member_id, week)
);

-- -------------------------------------------------------------
-- Done.
-- -------------------------------------------------------------
