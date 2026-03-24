-- ============================================================
-- Migration 006 — Row Level Security policies
--
-- Enables RLS on all unrestricted tables and adds appropriate
-- read/write policies. The backend uses the service role key
-- which bypasses RLS entirely, so backend writes need no policy.
-- ============================================================


-- ------------------------------------------------------------
-- Helper: is the calling user a member of this league?
-- Used across multiple policies.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION is_league_member(p_league_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM league_members
    WHERE league_id = p_league_id AND user_id = auth.uid()
  )
$$;


-- ------------------------------------------------------------
-- team_season_stats
-- Public read (all users need team stats for scouting/lineup).
-- Writes handled by service role backend only.
-- ------------------------------------------------------------
ALTER TABLE team_season_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "team_season_stats_read" ON team_season_stats
  FOR SELECT USING (true);


-- ------------------------------------------------------------
-- games
-- Public read. Writes handled by service role backend only.
-- ------------------------------------------------------------
ALTER TABLE games ENABLE ROW LEVEL SECURITY;

CREATE POLICY "games_read" ON games
  FOR SELECT USING (true);


-- ------------------------------------------------------------
-- cfb_misses
-- Public read. Writes handled by service role backend only.
-- ------------------------------------------------------------
ALTER TABLE cfb_misses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cfb_misses_read" ON cfb_misses
  FOR SELECT USING (true);


-- ------------------------------------------------------------
-- leagues
-- Read: any authenticated user (needed for join-by-invite-code flow).
-- Insert: any authenticated user (create league).
-- Update: league admin only.
-- Delete: league admin only.
-- ------------------------------------------------------------
ALTER TABLE leagues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "leagues_read" ON leagues
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "leagues_insert" ON leagues
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);

CREATE POLICY "leagues_update" ON leagues
  FOR UPDATE TO authenticated
  USING (auth.uid() = admin_id);

CREATE POLICY "leagues_delete" ON leagues
  FOR DELETE TO authenticated
  USING (auth.uid() = admin_id);


-- ------------------------------------------------------------
-- league_members
-- Read: members of the same league.
-- Insert: authenticated users joining a league (themselves only).
-- Update: own row only (team_name, avatar).
-- Delete: own row or league admin.
-- ------------------------------------------------------------
ALTER TABLE league_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "league_members_read" ON league_members
  FOR SELECT TO authenticated
  USING (is_league_member(league_id));

CREATE POLICY "league_members_insert" ON league_members
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "league_members_update_own" ON league_members
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "league_members_delete" ON league_members
  FOR DELETE TO authenticated
  USING (
    auth.uid() = user_id OR
    auth.uid() IN (SELECT admin_id FROM leagues WHERE id = league_id)
  );


-- ------------------------------------------------------------
-- drafts
-- Read: league members only.
-- Insert: league creator (handled in migration 004 policy,
--         re-created here for completeness).
-- Update: league admin only.
-- ------------------------------------------------------------
ALTER TABLE drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "drafts_read" ON drafts
  FOR SELECT TO authenticated
  USING (is_league_member(league_id));

CREATE POLICY "drafts_insert" ON drafts
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() IN (SELECT created_by FROM leagues WHERE id = league_id)
  );

CREATE POLICY "drafts_update" ON drafts
  FOR UPDATE TO authenticated
  USING (
    auth.uid() IN (SELECT admin_id FROM leagues WHERE id = league_id)
  );


-- ------------------------------------------------------------
-- draft_picks
-- Read: league members only.
-- Insert: service role backend only (via make_pick RPC).
-- ------------------------------------------------------------
ALTER TABLE draft_picks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "draft_picks_read" ON draft_picks
  FOR SELECT TO authenticated
  USING (is_league_member(league_id));

CREATE POLICY "draft_picks_service_insert" ON draft_picks
  FOR INSERT WITH CHECK (true);


-- ------------------------------------------------------------
-- weekly_lineups
-- Read: league members only.
-- Insert/Update: own member_id only.
-- ------------------------------------------------------------
ALTER TABLE weekly_lineups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "weekly_lineups_read" ON weekly_lineups
  FOR SELECT TO authenticated
  USING (is_league_member(league_id));

CREATE POLICY "weekly_lineups_write" ON weekly_lineups
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() IN (
      SELECT user_id FROM league_members WHERE id = member_id
    )
  );

CREATE POLICY "weekly_lineups_update" ON weekly_lineups
  FOR UPDATE TO authenticated
  USING (
    auth.uid() IN (
      SELECT user_id FROM league_members WHERE id = member_id
    )
  );


-- ------------------------------------------------------------
-- move_history
-- Read: league members only.
-- Insert: own member_id only.
-- ------------------------------------------------------------
ALTER TABLE move_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "move_history_read" ON move_history
  FOR SELECT TO authenticated
  USING (is_league_member(league_id));

CREATE POLICY "move_history_insert" ON move_history
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() IN (
      SELECT user_id FROM league_members WHERE id = member_id
    )
  );


-- ------------------------------------------------------------
-- weekly_standings
-- Read: league members only.
-- Writes handled by service role backend (advance-week endpoint).
-- ------------------------------------------------------------
ALTER TABLE weekly_standings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "weekly_standings_read" ON weekly_standings
  FOR SELECT TO authenticated
  USING (is_league_member(league_id));
