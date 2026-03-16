-- ============================================================
-- Draft Rewrite Migration
-- Adds proper server-driven draft state with pick_deadline,
-- a normalised draft_picks table, and atomic RPCs.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Extend drafts table
-- ------------------------------------------------------------
ALTER TABLE drafts
  ADD COLUMN IF NOT EXISTS status        TEXT        DEFAULT 'pending',  -- 'pending'|'active'|'complete'
  ADD COLUMN IF NOT EXISTS pick_deadline TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS total_rounds  INT         DEFAULT 9;          -- teams per manager

-- Back-fill status from old boolean columns
UPDATE drafts SET status = 'complete' WHERE draft_complete = TRUE;
UPDATE drafts SET status = 'active'   WHERE draft_started  = TRUE AND draft_complete = FALSE;
UPDATE drafts SET status = 'pending'  WHERE status IS NULL OR status = 'pending';


-- ------------------------------------------------------------
-- 2. Normalised draft_picks table
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS draft_picks (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id    UUID        NOT NULL REFERENCES drafts(id)  ON DELETE CASCADE,
  league_id   UUID        NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  pick_number INT         NOT NULL,   -- 1-based global pick number
  round       INT         NOT NULL,   -- 1-based round
  user_id     UUID        NOT NULL REFERENCES users(id),
  team_id     TEXT        NOT NULL,
  auto_picked BOOLEAN     DEFAULT FALSE,
  picked_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE (draft_id, pick_number),
  UNIQUE (draft_id, team_id)
);

CREATE INDEX IF NOT EXISTS dp_draft_idx  ON draft_picks (draft_id);
CREATE INDEX IF NOT EXISTS dp_league_idx ON draft_picks (league_id);

ALTER TABLE draft_picks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dp_member_read" ON draft_picks FOR SELECT
  USING (
    auth.uid() IN (
      SELECT user_id FROM league_members WHERE league_id = draft_picks.league_id
    )
  );

-- Backend (service role) handles inserts
CREATE POLICY "dp_service_insert" ON draft_picks FOR INSERT
  WITH CHECK (true);

-- Allow league creator to insert the initial drafts row
CREATE POLICY "drafts_creator_insert" ON drafts FOR INSERT
  WITH CHECK (
    auth.uid() IN (
      SELECT created_by FROM leagues WHERE id = league_id
    )
  );


-- ------------------------------------------------------------
-- 3. Helper: resolve who picks at a given pick_index (snake)
-- draft_order is 0-indexed array, pick_index is 0-based
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION draft_picker_at(
  p_order   TEXT[],
  p_index   INT
) RETURNS TEXT LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  n     INT := array_length(p_order, 1);
  round INT := p_index / n;  -- 0-based round
  pos   INT;
BEGIN
  IF n IS NULL OR n = 0 THEN RETURN NULL; END IF;
  IF round % 2 = 0 THEN
    pos := p_index % n;
  ELSE
    pos := (n - 1) - (p_index % n);
  END IF;
  RETURN p_order[pos + 1];  -- pg arrays are 1-indexed
END;
$$;


-- ------------------------------------------------------------
-- 4. RPC: make_pick
-- Called by the client when a user selects a team.
-- Also called by the backend auto-pick job (with auto_pick=true).
-- Returns: {success, pick_number} or {error}
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
  v_pick_number  INT;
  v_round        INT;
  v_n_managers   INT;
  v_total_picks  INT;
  v_next_index   INT;
  v_next_picker  TEXT;
  v_new_deadline TIMESTAMPTZ;
BEGIN
  -- Lock draft row for atomic update
  SELECT * INTO v_draft FROM drafts WHERE id = p_draft_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Draft not found');
  END IF;

  IF v_draft.status != 'active' THEN
    RETURN jsonb_build_object('error', 'Draft is not active');
  END IF;

  -- Who should be picking right now?
  v_expected_uid := draft_picker_at(v_draft.draft_order, v_draft.current_pick_index);

  -- Validate turn (skip for auto-pick which runs as service role)
  IF NOT p_auto_pick AND v_caller::TEXT != v_expected_uid THEN
    RETURN jsonb_build_object('error', 'Not your turn');
  END IF;

  -- Team must not already be picked
  IF EXISTS (
    SELECT 1 FROM draft_picks
    WHERE draft_id = p_draft_id AND team_id = p_team_id
  ) THEN
    RETURN jsonb_build_object('error', 'Team already picked');
  END IF;

  v_n_managers  := array_length(v_draft.draft_order, 1);
  v_total_picks := v_n_managers * v_draft.total_rounds;
  v_pick_number := v_draft.current_pick_index + 1;  -- 1-based
  v_round       := (v_draft.current_pick_index / v_n_managers) + 1;

  -- Insert the pick
  INSERT INTO draft_picks (draft_id, league_id, pick_number, round, user_id, team_id, auto_picked)
  VALUES (p_draft_id, v_draft.league_id, v_pick_number, v_round, v_expected_uid::UUID, p_team_id, p_auto_pick);

  -- Check if draft is complete
  IF v_pick_number >= v_total_picks THEN
    UPDATE drafts SET
      current_pick_index = v_pick_number,
      status             = 'complete',
      draft_complete     = TRUE,
      pick_deadline      = NULL
    WHERE id = p_draft_id;

    -- Mark league draft complete
    UPDATE leagues SET draft_complete = TRUE
    WHERE id = v_draft.league_id;

    -- Compile picks into league_members starters/bench
    PERFORM compile_draft_rosters(p_draft_id);

    RETURN jsonb_build_object('success', true, 'pick_number', v_pick_number, 'draft_complete', true);
  END IF;

  -- Advance to next pick
  v_next_index  := v_draft.current_pick_index + 1;
  v_next_picker := draft_picker_at(v_draft.draft_order, v_next_index);

  -- Get time_per_pick from leagues table (seconds)
  SELECT COALESCE(time_per_pick, 120) * INTERVAL '1 second'
  INTO v_new_deadline
  FROM leagues WHERE id = v_draft.league_id;
  v_new_deadline := now() + v_new_deadline;

  UPDATE drafts SET
    current_pick_index = v_next_index,
    pick_deadline      = v_new_deadline
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
-- 5. RPC: compile_draft_rosters
-- After draft completes, writes picks into league_members
-- starters (first 7) and bench (remaining)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION compile_draft_rosters(p_draft_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_league_id UUID;
  v_member    RECORD;
  v_picks     TEXT[];
BEGIN
  SELECT league_id INTO v_league_id FROM drafts WHERE id = p_draft_id;

  FOR v_member IN
    SELECT DISTINCT user_id FROM draft_picks WHERE draft_id = p_draft_id
  LOOP
    SELECT array_agg(team_id ORDER BY pick_number)
    INTO v_picks
    FROM draft_picks
    WHERE draft_id = p_draft_id AND user_id = v_member.user_id;

    UPDATE league_members SET
      starters = v_picks[1:7],
      bench    = v_picks[8:array_length(v_picks, 1)]
    WHERE league_id = v_league_id AND user_id = v_member.user_id;
  END LOOP;
END;
$$;


-- ------------------------------------------------------------
-- 6. RPC: start_draft
-- Called by admin. Shuffles or preserves draft order,
-- sets status=active, sets first pick_deadline.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION start_draft(p_league_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_draft       drafts%ROWTYPE;
  v_league      leagues%ROWTYPE;
  v_members     UUID[];
  v_order       TEXT[];
  v_deadline    TIMESTAMPTZ;
  v_n           INT;
BEGIN
  -- Only the league admin may start
  SELECT * INTO v_league FROM leagues WHERE id = p_league_id;
  IF auth.uid() != v_league.admin_id THEN
    RETURN jsonb_build_object('error', 'Not the league admin');
  END IF;

  SELECT * INTO v_draft FROM drafts WHERE league_id = p_league_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Draft record not found');
  END IF;

  IF v_draft.status = 'active' OR v_draft.status = 'complete' THEN
    RETURN jsonb_build_object('error', 'Draft already started');
  END IF;

  -- Build member list
  SELECT array_agg(user_id) INTO v_members
  FROM league_members WHERE league_id = p_league_id;

  v_n := array_length(v_members, 1);

  -- If draft_order already set by admin, keep it; otherwise randomise
  -- COALESCE handles both NULL and empty array '{}' (array_length returns NULL for both)
  IF COALESCE(array_length(v_draft.draft_order, 1), 0) != v_n THEN
    -- Fisher-Yates shuffle via random ordering
    SELECT array_agg(uid::TEXT ORDER BY random())
    INTO v_order
    FROM unnest(v_members) AS uid;
  ELSE
    v_order := v_draft.draft_order;
  END IF;

  v_deadline := now() + COALESCE(v_league.time_per_pick, 120) * INTERVAL '1 second';

  UPDATE drafts SET
    status             = 'active',
    draft_started      = TRUE,
    draft_start_time   = now(),
    draft_order        = v_order,
    current_pick_index = 0,
    pick_deadline      = v_deadline
  WHERE league_id = p_league_id;

  RETURN jsonb_build_object('success', true, 'draft_order', v_order, 'pick_deadline', v_deadline);
END;
$$;


-- ------------------------------------------------------------
-- 7. Draft scheduling overlap check helper
-- Returns count of drafts scheduled within ±1 hour of a given time
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION count_overlapping_drafts(p_draft_time TIMESTAMPTZ)
RETURNS INT LANGUAGE sql STABLE AS $$
  SELECT COUNT(*)::INT
  FROM leagues
  WHERE draft_date IS NOT NULL
    AND draft_date BETWEEN p_draft_time - INTERVAL '1 hour'
                       AND p_draft_time + INTERVAL '1 hour';
$$;
