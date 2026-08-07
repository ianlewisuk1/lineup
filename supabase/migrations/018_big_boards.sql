-- ============================================================
-- 018_big_boards.sql
-- Per-user, per-league pre-draft big board: an ordered shortlist
-- of at most 15 teams.
--
-- Stored as a single row per (user, league) holding an ordered
-- text[] of team slugs rather than 15 ranked rows. At this size
-- the array wins: order is array order (no rank column, no
-- reindexing), every mutation is one upsert, and the cap is a
-- CHECK constraint instead of application arithmetic.
--
-- A team that gets drafted is stripped from every board in that
-- league by trigger, so the removal happens for members who are
-- not online.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Table
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS big_boards (
  user_id    UUID        NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  league_id  UUID        NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  team_ids   TEXT[]      NOT NULL DEFAULT '{}',   -- ordered team slugs (teams.id)
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, league_id),
  CONSTRAINT big_board_max_15
    CHECK (array_length(team_ids, 1) IS NULL OR array_length(team_ids, 1) <= 15)
);

CREATE INDEX IF NOT EXISTS bb_league_idx ON big_boards (league_id);


-- ------------------------------------------------------------
-- 2. RLS — a big board is private to its owner
-- ------------------------------------------------------------
ALTER TABLE big_boards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "big_boards_own_read"   ON big_boards;
DROP POLICY IF EXISTS "big_boards_own_insert" ON big_boards;
DROP POLICY IF EXISTS "big_boards_own_update" ON big_boards;
DROP POLICY IF EXISTS "big_boards_own_delete" ON big_boards;

CREATE POLICY "big_boards_own_read" ON big_boards FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "big_boards_own_insert" ON big_boards FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "big_boards_own_update" ON big_boards FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "big_boards_own_delete" ON big_boards FOR DELETE
  USING (auth.uid() = user_id);


-- ------------------------------------------------------------
-- 3. Drafted teams fall off every board in the league
--
-- SECURITY DEFINER is required: the trigger writes other users'
-- rows, which the auth.uid() = user_id policy would block. The
-- UPDATE is scoped by NEW.league_id, so a pick in one league can
-- never touch another league's boards.
--
-- Undoing a pick does not restore the team to anyone's board.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION strip_drafted_from_big_boards()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE big_boards
     SET team_ids   = array_remove(team_ids, NEW.team_id),
         updated_at = now()
   WHERE league_id = NEW.league_id
     AND NEW.team_id = ANY (team_ids);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS draft_pick_strips_big_boards ON draft_picks;

CREATE TRIGGER draft_pick_strips_big_boards
AFTER INSERT ON draft_picks
FOR EACH ROW EXECUTE FUNCTION strip_drafted_from_big_boards();
