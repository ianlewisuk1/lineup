-- ============================================================
-- Lineup CFB - Initial Schema
-- Migrated from Firestore to PostgreSQL via Supabase
-- ============================================================
--
-- HISTORICAL. Do not read this file as a description of the live database.
-- Every table below has drifted. Current column lists: supabase/SCHEMA.md.
--
-- Some drift is accounted for by later migrations (004/005 rewrote drafts,
-- 007 added preseason stats, 018 added big boards). The rest traces to a
-- "migration_2026_03_24.sql" that 015 references but which was never committed
-- to supabase/migrations/. That change rebuilt teams and games leaner:
--
--   teams   lost 25 of the columns declared here (stats moved to
--           team_season_stats; location and logo fields dropped outright)
--   games   lost cfbd_game_id, period, clock, last_score_update and the
--           default on id — all restored by 021 and 022 — and carries four
--           columns never declared here
--
-- That gap cost five separate round trips during the 2026 schedule import.
-- Probe the live database before writing against these definitions.

-- ------------------------------------------------------------
-- Global app config (replaces config/season document)
-- ------------------------------------------------------------
CREATE TABLE config (
  key   TEXT PRIMARY KEY,
  value JSONB NOT NULL
);

INSERT INTO config (key, value) VALUES
  ('season', '{"currentWeek": "Preseason", "faLocked": false}');


-- ------------------------------------------------------------
-- Users (mirrors Supabase Auth uid, replaces users collection)
-- ------------------------------------------------------------
CREATE TABLE users (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name    TEXT,
  last_name     TEXT,
  email         TEXT UNIQUE NOT NULL,
  dob           DATE,
  is_admin      BOOLEAN      DEFAULT FALSE,
  smack_talk    TEXT,
  team_avatar   TEXT,
  custom_avatar BOOLEAN      DEFAULT FALSE,
  created_at    TIMESTAMPTZ  DEFAULT now()
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Users can read and update only their own row
CREATE POLICY "users_self_select" ON users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "users_self_update" ON users FOR UPDATE USING (auth.uid() = id);
-- Insert is handled server-side on signup (trigger below)

-- Auto-create user row when a Supabase Auth user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.users (id, email, created_at)
  VALUES (NEW.id, NEW.email, now())
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ------------------------------------------------------------
-- Teams (replaces teams collection)
-- ------------------------------------------------------------
CREATE TABLE teams (
  id                          TEXT PRIMARY KEY,  -- normalized slug e.g. 'alabama'
  school                      TEXT NOT NULL,
  mascot                      TEXT,
  abbreviation                TEXT,
  classification              TEXT,              -- 'FBS' | 'FCS'
  conference                  TEXT,
  color                       TEXT,
  alternate_color             TEXT,
  logos                       TEXT[],
  city                        TEXT,
  state                       TEXT,
  stadium                     TEXT,
  capacity                    INT,
  timezone                    TEXT,
  sos_rank                    INT,
  phil_metrics                NUMERIC,
  prev_year_points            NUMERIC,
  alternate_names             TEXT[],
  -- Current season stats (updated by backend cron jobs)
  game_points                 NUMERIC     DEFAULT 0,
  record                      TEXT,
  conf_record                 TEXT,
  ats_record                  TEXT,
  total_points_for            NUMERIC     DEFAULT 0,
  total_points_against        NUMERIC     DEFAULT 0,
  next_opponent               TEXT,
  next_game_is_home           BOOLEAN,
  next_opponent_spread        NUMERIC,
  next_opponent_spread_display TEXT,
  is_on_bye                   BOOLEAN     DEFAULT FALSE,
  weekly_points               JSONB       DEFAULT '{}',  -- {"Week 1": 5, "Week 2": 3}
  game_status                 TEXT        DEFAULT 'scheduled',  -- 'scheduled'|'in_progress'|'final'|'postponed'
  game_complete               BOOLEAN     DEFAULT FALSE,
  ats_wins                    INT         DEFAULT 0,
  ats_losses                  INT         DEFAULT 0
);

ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
-- Teams are public read, backend-only write (service role bypasses RLS)
CREATE POLICY "teams_public_read" ON teams FOR SELECT USING (true);


-- ------------------------------------------------------------
-- Games / Schedule (replaces schedule/2025/weeks/{n}/games)
--
-- STALE. The live table differs substantially — see supabase/SCHEMA.md.
-- Notably: id is TEXT (not UUID), week is INT (not TEXT), kickoff lives in
-- "date" (not game_time, which 023 dropped), and season_type, start_time_tbd
-- and conference_game exist but are not declared here.
-- ------------------------------------------------------------
CREATE TABLE games (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  cfbd_game_id      TEXT        UNIQUE,
  year              INT         NOT NULL,
  week              TEXT        NOT NULL,
  home_team         TEXT        REFERENCES teams(id),
  away_team         TEXT        REFERENCES teams(id),
  game_time         TIMESTAMPTZ,
  venue             TEXT,
  neutral_site      BOOLEAN     DEFAULT FALSE,
  home_score        INT,
  away_score        INT,
  home_spread       NUMERIC,
  game_status       TEXT        DEFAULT 'scheduled',
  game_complete     BOOLEAN     DEFAULT FALSE,
  period            INT,
  clock             TEXT,
  last_score_update TIMESTAMPTZ
);

CREATE INDEX games_week_idx  ON games (year, week);
CREATE INDEX games_teams_idx ON games (home_team, away_team);

ALTER TABLE games ENABLE ROW LEVEL SECURITY;
CREATE POLICY "games_public_read" ON games FOR SELECT USING (true);


-- ------------------------------------------------------------
-- Leagues (replaces leagues collection)
-- ------------------------------------------------------------
CREATE TABLE leagues (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT        NOT NULL,
  created_by       UUID        REFERENCES users(id),
  admin_id         UUID        REFERENCES users(id),
  max_managers     INT         DEFAULT 10,
  draft_complete   BOOLEAN     DEFAULT FALSE,
  draft_type       TEXT        DEFAULT 'manual',   -- 'manual' | 'live'
  draft_order_type TEXT        DEFAULT 'random',   -- 'random' | 'admin'
  scoring_type     TEXT        DEFAULT 'cumulative',
  current_week     TEXT,
  draft_date       TIMESTAMPTZ,
  time_per_pick    INT,                             -- seconds per pick (live draft)
  created_at       TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE leagues ENABLE ROW LEVEL SECURITY;

-- Only the league admin can update
CREATE POLICY "leagues_admin_update" ON leagues FOR UPDATE
  USING (auth.uid() = admin_id);

-- Any authenticated user can create a league
CREATE POLICY "leagues_auth_insert" ON leagues FOR INSERT
  WITH CHECK (auth.uid() = created_by);


-- ------------------------------------------------------------
-- League Members (replaces leagues/{id}/members subcollection)
-- ------------------------------------------------------------
CREATE TABLE league_members (
  id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id              UUID        NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  user_id                UUID        NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  team_name              TEXT,
  points                 NUMERIC     DEFAULT 0,
  weekly_points          NUMERIC     DEFAULT 0,
  weekly_points_history  JSONB       DEFAULT '{}',  -- {"Week 1": 45, "Week 2": 38}
  free_agent_moves       INT         DEFAULT 0,
  starters               TEXT[]      DEFAULT '{}',
  bench                  TEXT[]      DEFAULT '{}',
  captain                TEXT,        -- team id
  trip_play_team         TEXT,        -- team id
  team_avatar            TEXT,
  custom_avatar          BOOLEAN     DEFAULT FALSE,
  joined_at              TIMESTAMPTZ DEFAULT now(),
  UNIQUE (league_id, user_id)
);

CREATE INDEX lm_league_idx ON league_members (league_id);
CREATE INDEX lm_user_idx   ON league_members (user_id);

ALTER TABLE league_members ENABLE ROW LEVEL SECURITY;

-- League members can read all members of their leagues
CREATE POLICY "lm_member_read" ON league_members FOR SELECT
  USING (
    auth.uid() IN (
      SELECT user_id FROM league_members lm2 WHERE lm2.league_id = league_id
    )
  );

-- Members can update only their own row
CREATE POLICY "lm_self_update" ON league_members FOR UPDATE
  USING (auth.uid() = user_id);

-- Authenticated users can insert their own membership
CREATE POLICY "lm_self_insert" ON league_members FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Only league admin can delete members (enforced server-side via service role)

-- leagues_member_read is defined here (after league_members exists) to avoid forward reference
CREATE POLICY "leagues_member_read" ON leagues FOR SELECT
  USING (
    auth.uid() = admin_id
    OR auth.uid() IN (
      SELECT user_id FROM league_members WHERE league_id = id
    )
  );


-- ------------------------------------------------------------
-- Drafts (replaces leagues/{id}/meta/draft document)
-- ------------------------------------------------------------
CREATE TABLE drafts (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id         UUID        NOT NULL REFERENCES leagues(id) ON DELETE CASCADE UNIQUE,
  draft_order       TEXT[]      DEFAULT '{}',   -- ordered array of user ids
  current_pick_index INT        DEFAULT 0,
  selected_teams    JSONB       DEFAULT '{}',   -- {userId: [teamId, ...]}
  draft_started     BOOLEAN     DEFAULT FALSE,
  draft_complete    BOOLEAN     DEFAULT FALSE,
  draft_start_time  TIMESTAMPTZ,
  pick_log          JSONB       DEFAULT '[]'    -- [{userId, teamId, pickIndex, timestamp}]
);

ALTER TABLE drafts ENABLE ROW LEVEL SECURITY;

-- All league members can read draft state (needed for live draft room)
CREATE POLICY "drafts_member_read" ON drafts FOR SELECT
  USING (
    auth.uid() IN (
      SELECT user_id FROM league_members WHERE league_id = league_id
    )
  );

-- Draft writes handled server-side via service role for atomicity


-- ------------------------------------------------------------
-- Weekly Lineups (replaces leagues/{id}/weeklyLineups)
-- ------------------------------------------------------------
CREATE TABLE weekly_lineups (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id      UUID        NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  user_id        UUID        NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  week           TEXT        NOT NULL,
  starters       TEXT[]      DEFAULT '{}',
  bench          TEXT[]      DEFAULT '{}',
  captain        TEXT,
  trip_play_team TEXT,
  submitted_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE (league_id, user_id, week)
);

CREATE INDEX wl_league_week_idx ON weekly_lineups (league_id, week);

ALTER TABLE weekly_lineups ENABLE ROW LEVEL SECURITY;

-- Members can read all lineups in their leagues
CREATE POLICY "wl_member_read" ON weekly_lineups FOR SELECT
  USING (
    auth.uid() IN (
      SELECT user_id FROM league_members WHERE league_id = league_id
    )
  );

-- Members can insert/update their own lineups
CREATE POLICY "wl_self_write" ON weekly_lineups FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "wl_self_update" ON weekly_lineups FOR UPDATE
  USING (auth.uid() = user_id);


-- ------------------------------------------------------------
-- Weekly Standings (replaces leagues/{id}/weeklyStandings)
-- ------------------------------------------------------------
CREATE TABLE weekly_standings (
  id        UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID    NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  user_id   UUID    NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  week      TEXT    NOT NULL,
  points    NUMERIC,
  rank      INT,
  team_name TEXT,
  UNIQUE (league_id, user_id, week)
);

CREATE INDEX ws_league_week_idx ON weekly_standings (league_id, week);

ALTER TABLE weekly_standings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ws_member_read" ON weekly_standings FOR SELECT
  USING (
    auth.uid() IN (
      SELECT user_id FROM league_members WHERE league_id = league_id
    )
  );


-- ------------------------------------------------------------
-- Free Agent Move History (replaces leagues/{id}/moveHistory)
-- ------------------------------------------------------------
CREATE TABLE move_history (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id  UUID        NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  team_name  TEXT,
  picked_up  TEXT,        -- team id
  dropped    TEXT,        -- team id
  move_type  TEXT,        -- 'pickup' | 'drop' | 'swap'
  week       TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX mh_league_idx ON move_history (league_id, created_at DESC);

ALTER TABLE move_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mh_member_read" ON move_history FOR SELECT
  USING (
    auth.uid() IN (
      SELECT user_id FROM league_members WHERE league_id = league_id
    )
  );

CREATE POLICY "mh_self_insert" ON move_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);


-- ------------------------------------------------------------
-- Playoffs (replaces leagues/{id}/playoffs/{year} document)
-- ------------------------------------------------------------
CREATE TABLE playoffs (
  id                   UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id            UUID    NOT NULL REFERENCES leagues(id) ON DELETE CASCADE UNIQUE,
  year                 INT     NOT NULL,
  championship_bracket JSONB   DEFAULT '{}',
  loser_bracket        JSONB   DEFAULT '{}',
  final_draft_order    TEXT[]  DEFAULT '{}',
  playoffs_complete    BOOLEAN DEFAULT FALSE
);

ALTER TABLE playoffs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "playoffs_member_read" ON playoffs FOR SELECT
  USING (
    auth.uid() IN (
      SELECT user_id FROM league_members WHERE league_id = league_id
    )
  );


-- ------------------------------------------------------------
-- ESPN / CFBD team name miss log (replaces cfb/misses/teams)
-- ------------------------------------------------------------
CREATE TABLE cfb_misses (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  team_name  TEXT,
  context    TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- No RLS needed — backend-only table, accessed via service role
