-- ============================================================
-- Migration 005 — Fix draft tables + RPCs for v2 schema
--
-- Our v2 schema migration (migration_2026_03_24.sql) dropped and
-- recreated drafts and draft_picks with simplified columns.
-- This migration adds back the columns needed for the draft engine
-- and rewrites the three core RPCs to match the new schema:
--
--   make_pick          — now uses current_pick + member_id
--   compile_draft_rosters — now writes to weekly_lineups (not league_members)
--   start_draft        — removes stale column refs
-- ============================================================


-- ------------------------------------------------------------
-- 1. Add missing columns to drafts
-- ------------------------------------------------------------
ALTER TABLE drafts
  ADD COLUMN IF NOT EXISTS pick_deadline  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS total_rounds   INT     DEFAULT 7,
  ADD COLUMN IF NOT EXISTS draft_complete BOOLEAN DEFAULT FALSE;


-- ------------------------------------------------------------
-- 2. Add missing columns to draft_picks
-- ------------------------------------------------------------
ALTER TABLE draft_picks
  ADD COLUMN IF NOT EXISTS draft_id    UUID REFERENCES drafts(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS round       INT,
  ADD COLUMN IF NOT EXISTS auto_picked BOOLEAN DEFAULT FALSE;

-- Unique constraint: one team per draft, one pick_number per draft
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'draft_picks_draft_id_team_id_key'
  ) THEN
    ALTER TABLE draft_picks ADD CONSTRAINT draft_picks_draft_id_team_id_key
      UNIQUE (draft_id, team_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'draft_picks_draft_id_pick_number_key'
  ) THEN
    ALTER TABLE draft_picks ADD CONSTRAINT draft_picks_draft_id_pick_number_key
      UNIQUE (draft_id, pick_number);
  END IF;
END $$;


-- ------------------------------------------------------------
-- 3. Rewrite make_pick
--    Changes from v1:
--    - current_pick_index → current_pick
--    - Resolves member_id from league_members for the inserting user
--    - draft_picks insert uses member_id instead of user_id
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION make_pick(
  p_draft_id  UUID,
  p_team_id   TEXT,
  p_auto_pick BOOLEAN DEFAULT FALSE
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_draft        drafts%ROWTYPE;
  v_caller       UUID := auth.uid();
  v_expected_uid TEXT;
  v_member_id    UUID;
  v_pick_number  INT;
  v_round        INT;
  v_n_managers   INT;
  v_total_picks  INT;
  v_next_index   INT;
  v_next_picker  TEXT;
  v_new_deadline TIMESTAMPTZ;
BEGIN
  -- Lock draft row
  SELECT * INTO v_draft FROM drafts WHERE id = p_draft_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Draft not found');
  END IF;

  IF v_draft.status != 'active' THEN
    RETURN jsonb_build_object('error', 'Draft is not active');
  END IF;

  -- Whose turn is it?
  v_expected_uid := draft_picker_at(v_draft.draft_order, v_draft.current_pick);

  -- Validate turn (skip for auto-pick which runs as service role)
  IF NOT p_auto_pick AND v_caller::TEXT != v_expected_uid THEN
    RETURN jsonb_build_object('error', 'Not your turn');
  END IF;

  -- Team must not already be picked in this draft
  IF EXISTS (
    SELECT 1 FROM draft_picks WHERE draft_id = p_draft_id AND team_id = p_team_id
  ) THEN
    RETURN jsonb_build_object('error', 'Team already picked');
  END IF;

  -- Resolve the league_members.id (member_id) for the picking user
  SELECT id INTO v_member_id
  FROM league_members
  WHERE league_id = v_draft.league_id AND user_id = v_expected_uid::UUID;

  IF v_member_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Picker is not a league member');
  END IF;

  v_n_managers  := array_length(v_draft.draft_order, 1);
  v_total_picks := v_n_managers * v_draft.total_rounds;
  v_pick_number := v_draft.current_pick + 1;  -- 1-based
  v_round       := (v_draft.current_pick / v_n_managers) + 1;

  -- Insert the pick
  INSERT INTO draft_picks (draft_id, league_id, member_id, pick_number, round, team_id, auto_picked)
  VALUES (p_draft_id, v_draft.league_id, v_member_id, v_pick_number, v_round, p_team_id, p_auto_pick);

  -- Draft complete?
  IF v_pick_number >= v_total_picks THEN
    UPDATE drafts SET
      current_pick   = v_pick_number,
      status         = 'complete',
      draft_complete = TRUE,
      pick_deadline  = NULL
    WHERE id = p_draft_id;

    UPDATE leagues SET draft_complete = TRUE WHERE id = v_draft.league_id;

    PERFORM compile_draft_rosters(p_draft_id);

    RETURN jsonb_build_object('success', true, 'pick_number', v_pick_number, 'draft_complete', true);
  END IF;

  -- Advance to next pick
  v_next_index  := v_draft.current_pick + 1;
  v_next_picker := draft_picker_at(v_draft.draft_order, v_next_index);

  SELECT now() + COALESCE(time_per_pick, 120) * INTERVAL '1 second'
  INTO v_new_deadline
  FROM leagues WHERE id = v_draft.league_id;

  UPDATE drafts SET
    current_pick  = v_next_index,
    pick_deadline = v_new_deadline
  WHERE id = p_draft_id;

  RETURN jsonb_build_object(
    'success',       true,
    'pick_number',   v_pick_number,
    'next_picker',   v_next_picker,
    'pick_deadline', v_new_deadline
  );
END;
$$;


-- ------------------------------------------------------------
-- 4. Rewrite compile_draft_rosters
--    v1 wrote starters/bench to league_members.
--    v2 creates a weekly_lineups row for the current week.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION compile_draft_rosters(p_draft_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_league_id UUID;
  v_member    RECORD;
  v_picks     TEXT[];
  v_week      INT := 1;
  v_config    JSONB;
BEGIN
  SELECT league_id INTO v_league_id FROM drafts WHERE id = p_draft_id;

  -- Use current week from config if available, otherwise default to 1
  SELECT value INTO v_config FROM config WHERE key = 'season';
  IF v_config IS NOT NULL THEN
    v_week := COALESCE((v_config->>'currentWeek')::INT, 1);
  END IF;

  FOR v_member IN
    SELECT DISTINCT member_id FROM draft_picks WHERE draft_id = p_draft_id
  LOOP
    -- Get picks in order for this member
    SELECT array_agg(team_id ORDER BY pick_number)
    INTO v_picks
    FROM draft_picks
    WHERE draft_id = p_draft_id AND member_id = v_member.member_id;

    -- First 5 picks = starters, remaining = bench
    INSERT INTO weekly_lineups (league_id, member_id, week, starters, bench, captain, frozen_teams, team_points, points)
    VALUES (
      v_league_id,
      v_member.member_id,
      v_week,
      v_picks[1:5],
      v_picks[6:array_length(v_picks, 1)],
      NULL,
      ARRAY[]::TEXT[],
      '{}'::JSONB,
      0
    )
    ON CONFLICT (league_id, member_id, week) DO UPDATE SET
      starters = EXCLUDED.starters,
      bench    = EXCLUDED.bench;
  END LOOP;
END;
$$;


-- ------------------------------------------------------------
-- 5. Rewrite start_draft
--    Removes stale column refs (draft_started, draft_start_time).
--    Uses current_pick instead of current_pick_index.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION start_draft(p_league_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_draft    drafts%ROWTYPE;
  v_league   leagues%ROWTYPE;
  v_members  UUID[];
  v_order    TEXT[];
  v_deadline TIMESTAMPTZ;
  v_n        INT;
BEGIN
  SELECT * INTO v_league FROM leagues WHERE id = p_league_id;

  IF auth.uid() != v_league.admin_id THEN
    RETURN jsonb_build_object('error', 'Not the league admin');
  END IF;

  SELECT * INTO v_draft FROM drafts WHERE league_id = p_league_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Draft record not found');
  END IF;

  IF v_draft.status IN ('active', 'complete') THEN
    RETURN jsonb_build_object('error', 'Draft already started');
  END IF;

  -- Build member list
  SELECT array_agg(user_id) INTO v_members
  FROM league_members WHERE league_id = p_league_id;

  v_n := array_length(v_members, 1);

  -- Use existing draft_order if it matches member count, otherwise randomise
  IF COALESCE(array_length(v_draft.draft_order, 1), 0) != v_n THEN
    SELECT array_agg(uid::TEXT ORDER BY random())
    INTO v_order FROM unnest(v_members) AS uid;
  ELSE
    v_order := v_draft.draft_order;
  END IF;

  v_deadline := now() + COALESCE(v_league.time_per_pick, 120) * INTERVAL '1 second';

  UPDATE drafts SET
    status        = 'active',
    started_at    = now(),
    draft_order   = v_order,
    current_pick  = 0,
    pick_deadline = v_deadline
  WHERE league_id = p_league_id;

  RETURN jsonb_build_object(
    'success',       true,
    'draft_order',   v_order,
    'pick_deadline', v_deadline
  );
END;
$$;
