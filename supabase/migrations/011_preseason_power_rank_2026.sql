-- 011_preseason_power_rank_2026.sql
-- Preseason power ranking for 2026 -> team_preseason_stats.power_rank.
-- 138 rows, ranks 1-138, one per FBS team. Rows already exist for season 2026
-- (created with predicted_wins), so this is an UPDATE, not an upsert -- it does
-- not depend on a (team_id, season_year) unique constraint being present.
-- Every team_id was verified against teams.id; a trailing comment marks rows
-- where the source name differs from the slug.

UPDATE team_preseason_stats AS p
SET power_rank = v.power_rank
FROM (VALUES
  ('ohio-state', 1),
  ('texas', 2),
  ('oregon', 3),
  ('notre-dame', 4),
  ('georgia', 5),
  ('indiana', 6),
  ('miami', 7),  -- Miami (Fla.)
  ('texas-a-m', 8),
  ('texas-tech', 9),
  ('oklahoma', 10),
  ('alabama', 11),
  ('ole-miss', 12),
  ('lsu', 13),
  ('usc', 14),
  ('byu', 15),
  ('michigan', 16),
  ('tennessee', 17),
  ('penn-state', 18),
  ('washington', 19),
  ('smu', 20),
  ('missouri', 21),
  ('utah', 22),
  ('iowa', 23),
  ('louisville', 24),
  ('florida', 25),
  ('clemson', 26),
  ('houston', 27),
  ('illinois', 28),
  ('arizona', 29),
  ('kansas-state', 30),
  ('vanderbilt', 31),
  ('south-carolina', 32),
  ('boise-state', 33),  -- Boise St.
  ('tcu', 34),
  ('nebraska', 35),
  ('auburn', 36),
  ('virginia-tech', 37),
  ('virginia', 38),
  ('arizona-state', 39),  -- Arizona St.
  ('minnesota', 40),
  ('pittsburgh', 41),
  ('georgia-tech', 42),
  ('duke', 43),
  ('nc-state', 44),
  ('wake-forest', 45),
  ('unlv', 46),
  ('florida-state', 47),
  ('northwestern', 48),
  ('ucla', 49),
  ('baylor', 50),
  ('maryland', 51),
  ('california', 52),
  ('navy', 53),
  ('iowa-state', 54),  -- Iowa St.
  ('cincinnati', 55),
  ('kansas', 56),
  ('mississippi-state', 57),  -- Miss. State
  ('kentucky', 58),
  ('utsa', 59),
  ('oklahoma-state', 60),
  ('wisconsin', 61),
  ('arkansas', 62),
  ('memphis', 63),
  ('rutgers', 64),
  ('ucf', 65),
  ('michigan-state', 66),  -- Michigan St.
  ('tulane', 67),
  ('syracuse', 68),
  ('san-diego-state', 69),  -- San Diego St.
  ('west-virginia', 70),
  ('james-madison', 71),
  ('south-florida', 72),
  ('colorado', 73),
  ('fresno-state', 74),  -- Fresno St.
  ('new-mexico', 75),
  ('east-carolina', 76),
  ('army', 77),
  ('north-carolina', 78),
  ('north-texas', 79),
  ('toledo', 80),
  ('old-dominion', 81),
  ('miami-oh', 82),
  ('texas-state', 83),  -- Texas St.
  ('georgia-southern', 84),  -- Ga. Southern
  ('washington-state', 85),  -- Washington St.
  ('jacksonville-state', 86),  -- Jacksonville St.
  ('western-kentucky', 87),  -- W. Kentucky
  ('marshall', 88),
  ('stanford', 89),
  ('utah-state', 90),  -- Utah St.
  ('western-michigan', 91),  -- W. Michigan
  ('arkansas-state', 92),  -- Arkansas St.
  ('hawaii', 93),
  ('troy', 94),
  ('louisiana', 95),
  ('air-force', 96),
  ('liberty', 97),
  ('boston-college', 98),
  ('purdue', 99),
  ('louisiana-tech', 100),
  ('ohio', 101),
  ('app-state', 102),  -- App. St.
  ('florida-atlantic', 103),  -- FAU
  ('temple', 104),
  ('colorado-state', 105),  -- Colorado St.
  ('oregon-state', 106),
  ('uconn', 107),
  ('tulsa', 108),
  ('north-dakota-state', 109),  -- N. Dakota St.
  ('kennesaw-state', 110),  -- Kennesaw St.
  ('south-alabama', 111),
  ('central-michigan', 112),  -- C. Michigan
  ('coastal-carolina', 113),  -- C. Carolina
  ('delaware', 114),
  ('buffalo', 115),
  ('wyoming', 116),
  ('florida-international', 117),  -- FIU
  ('eastern-michigan', 118),  -- E. Michigan
  ('rice', 119),
  ('bowling-green', 120),
  ('nevada', 121),
  ('san-jos-state', 122),  -- San Jose St.
  ('new-mexico-state', 123),  -- New Mexico St.
  ('uab', 124),
  ('northern-illinois', 125),  -- N. Illinois
  ('missouri-state', 126),  -- Missouri St.
  ('southern-miss', 127),  -- So. Miss
  ('akron', 128),
  ('kent-state', 129),  -- Kent St.
  ('georgia-state', 130),  -- Georgia St.
  ('utep', 131),
  ('ul-monroe', 132),
  ('sam-houston', 133),
  ('ball-state', 134),  -- Ball St.
  ('middle-tennessee', 135),  -- Middle Tenn.
  ('sacramento-state', 136),  -- Sacramento St.
  ('charlotte', 137),
  ('massachusetts', 138)  -- UMass
) AS v(team_id, power_rank)
WHERE p.team_id = v.team_id
  AND p.season_year = 2026;

-- Verification:
--   SELECT count(*) FROM team_preseason_stats
--   WHERE season_year = 2026 AND power_rank IS NOT NULL;   -- expect 138
--   SELECT count(DISTINCT power_rank) FROM team_preseason_stats
--   WHERE season_year = 2026 AND power_rank IS NOT NULL;   -- expect 138 (no ties)
