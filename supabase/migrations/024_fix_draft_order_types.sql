-- 024_fix_draft_order_types.sql
-- Fix the draft functions, which are written for TEXT[] against a uuid[] column.
--
-- Symptom, logged every 5 seconds by the auto-start cron on Render:
--
--   [Draft auto-start] Error for league 51147d36-...:
--   column "draft_order" is of type uuid[] but expression is of type text[]
--
-- start_draft declares v_order as TEXT[] and builds it with
-- array_agg(uid::TEXT), so the UPDATE against drafts.draft_order (uuid[])
-- fails. The draft stays 'pending', the cron retries, and it loops forever.
--
-- The same mismatch sits in make_pick, which calls
-- draft_picker_at(v_draft.draft_order, ...) — passing uuid[] to a function
-- declared TEXT[]. PostgreSQL resolves function arguments using implicit casts
-- only, and uuid[] to text[] is not implicit, so that call would fail too. It
-- has never been reached because no draft has ever started.
--
-- Fixed with an overload rather than by rewriting make_pick. Adding a uuid[]
-- variant of draft_picker_at means make_pick's existing call resolves to it and
-- gets a UUID back. Assigning that UUID into make_pick's TEXT variable is legal
-- (assignment context permits I/O conversion to a string type), so its
-- v_caller::TEXT comparison and v_expected_uid::UUID cast keep working
-- untouched. Less surface area than retyping a function that handles turn
-- order, snake rounds and auto-pick.
--
-- The TEXT[] variant is left in place. 004_draft_rewrite.sql defines it and
-- nothing proves it is unreferenced.


-- ------------------------------------------------------------
-- 1. uuid[] overload of draft_picker_at
--    Snake order, 0-indexed, identical logic to the TEXT[] version.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION draft_picker_at(
  p_order   UUID[],
  p_index   INT
) RETURNS UUID LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  n     INT := array_length(p_order, 1);
  round INT := p_index / n;              -- 0-based round
  pos   INT := p_index % n;              -- position within the round
BEGIN
  IF n IS NULL OR n = 0 THEN
    RETURN NULL;
  END IF;

  -- Odd rounds reverse (snake draft). Arrays are 1-indexed.
  IF round % 2 = 1 THEN
    RETURN p_order[n - pos];
  ELSE
    RETURN p_order[pos + 1];
  END IF;
END;
$$;


-- ------------------------------------------------------------
-- 2. start_draft — build a uuid[] instead of a text[]
--    Body is otherwise identical to 005_draft_schema_v2.sql.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION start_draft(p_league_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_draft    drafts%ROWTYPE;
  v_league   leagues%ROWTYPE;
  v_members  UUID[];
  v_order    UUID[];          -- was TEXT[]
  v_deadline TIMESTAMPTZ;
  v_n        INT;
BEGIN
  SELECT * INTO v_league FROM leagues WHERE id = p_league_id;

  -- auth.uid() is NULL when called by the service role (the auto-start cron),
  -- so this comparison yields NULL and falls through — which is what lets the
  -- backend start drafts. Left as-is deliberately.
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

  SELECT array_agg(user_id) INTO v_members
  FROM league_members WHERE league_id = p_league_id;

  v_n := array_length(v_members, 1);

  IF v_n IS NULL OR v_n = 0 THEN
    RETURN jsonb_build_object('error', 'League has no members');
  END IF;

  -- Use existing draft_order if it matches member count, otherwise randomise.
  -- No ::TEXT cast — this is what was producing a text[] for a uuid[] column.
  IF COALESCE(array_length(v_draft.draft_order, 1), 0) != v_n THEN
    SELECT array_agg(uid ORDER BY random())
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

-- Verification — the auto-start cron picks this up within 5 seconds. Watch for
-- "[Draft auto-start] Started draft for league ..." in the Render logs, then:
--
-- SELECT status, draft_order, current_pick FROM drafts
-- WHERE league_id = '51147d36-bbba-4de9-9972-0614f524d5be';
