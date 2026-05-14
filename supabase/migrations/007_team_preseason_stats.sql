CREATE TABLE team_preseason_stats (
  team_id           TEXT    NOT NULL REFERENCES teams(id),
  season_year       INT     NOT NULL,
  conf_odds         NUMERIC,
  phil_metric_rank  INT,
  power_rank        INT,
  ret_starters      INT,
  predicted_wins    NUMERIC,
  prev_year_record  TEXT,
  prev_year_ats     TEXT,
  prev_year_points  NUMERIC,
  PRIMARY KEY (team_id, season_year)
);

ALTER TABLE team_preseason_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "preseason_stats_public_read"
  ON team_preseason_stats FOR SELECT USING (true);
