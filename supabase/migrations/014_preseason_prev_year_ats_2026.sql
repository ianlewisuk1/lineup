-- 014_preseason_prev_year_ats_2026.sql
-- 2025 against-the-spread record -> team_preseason_stats.prev_year_ats.
-- Format is W-L-P (pushes third), e.g. Ohio State '10-3-1'.
--
-- 137 rows, not 138. North Dakota State has no 2025 ATS line in the source and
-- stays NULL. Sacramento State is present but only '1-0-0' -- it played 2025 in
-- FCS and only one game carried a spread, so that record is not comparable to
-- the FBS teams' full seasons.
--
-- UPDATE, not upsert -- the 2026 rows already exist.
-- Every team_id was verified against teams.id.

UPDATE team_preseason_stats AS p
SET prev_year_ats = v.ats
FROM (VALUES
  ('sacramento-state', '1-0-0'),
  ('texas-tech', '12-2-0'),
  ('san-diego-state', '10-3-0'),  -- San Diego St
  ('utah-state', '10-3-0'),  -- Utah St
  ('western-kentucky', '10-3-0'),  -- W Kentucky
  ('hawaii', '9-3-0'),
  ('byu', '10-4-0'),
  ('north-texas', '10-4-0'),  -- N Texas
  ('ohio-state', '10-3-1'),  -- Ohio St
  ('western-michigan', '10-3-1'),  -- W Michigan
  ('arkansas-state', '9-4-0'),  -- Arkansas St
  ('houston', '9-4-0'),
  ('iowa', '9-3-1'),
  ('toledo', '9-4-0'),
  ('utah', '9-4-0'),
  ('vanderbilt', '9-3-1'),
  ('wake-forest', '9-4-0'),
  ('washington-state', '9-4-0'),  -- Washington St
  ('miami', '11-5-0'),
  ('james-madison', '9-5-0'),  -- J Madison
  ('kennesaw-state', '9-5-0'),  -- Kennesaw St
  ('troy', '9-5-0'),
  ('virginia', '9-5-0'),
  ('indiana', '10-6-0'),
  ('arizona', '8-5-0'),
  ('central-michigan', '8-5-0'),  -- C Michigan
  ('east-carolina', '8-4-1'),  -- E Carolina
  ('florida-international', '8-5-0'),  -- Florida Intl
  ('illinois', '8-4-1'),
  ('louisiana-tech', '8-5-0'),
  ('memphis', '8-5-0'),
  ('mississippi-state', '8-5-0'),  -- Mississippi St
  ('old-dominion', '8-5-0'),
  ('pittsburgh', '8-5-0'),
  ('south-florida', '8-4-1'),  -- S Florida
  ('alabama', '9-5-1'),
  ('ole-miss', '9-6-0'),  -- Mississippi
  ('oregon', '9-6-0'),
  ('ball-state', '7-5-0'),  -- Ball St
  ('eastern-michigan', '7-4-1'),  -- E Michigan
  ('florida-atlantic', '7-5-0'),
  ('marshall', '7-5-0'),
  ('michigan-state', '7-5-0'),  -- Michigan St
  ('temple', '7-5-0'),
  ('west-virginia', '7-5-0'),
  ('boise-state', '8-5-1'),  -- Boise St
  ('miami-oh', '8-6-0'),
  ('army', '7-5-1'),
  ('fresno-state', '7-6-0'),  -- Fresno St
  ('georgia-southern', '7-5-1'),  -- Georgia So
  ('georgia-tech', '7-6-0'),
  ('missouri-state', '7-6-0'),  -- Missouri St
  ('nc-state', '7-6-0'),
  ('new-mexico', '7-6-0'),
  ('northwestern', '7-4-2'),
  ('tcu', '7-5-1'),
  ('utsa', '7-6-0'),
  ('washington', '7-6-0'),
  ('jacksonville-state', '7-7-0'),  -- Jacksonville St
  ('unlv', '7-7-0'),
  ('akron', '6-6-0'),
  ('boston-college', '6-6-0'),
  ('kent-state', '6-6-0'),  -- Kent St
  ('middle-tennessee', '6-6-0'),  -- Middle Tenn
  ('new-mexico-state', '6-6-0'),  -- New Mexico St
  ('notre-dame', '6-6-0'),
  ('rutgers', '6-6-0'),
  ('south-carolina', '6-6-0'),
  ('tulsa', '6-6-0'),
  ('wisconsin', '6-6-0'),
  ('arizona-state', '6-6-1'),  -- Arizona St
  ('cincinnati', '6-7-0'),
  ('coastal-carolina', '6-7-0'),  -- Coastal Car
  ('louisiana', '6-7-0'),
  ('missouri', '6-6-1'),
  ('ohio', '6-6-1'),
  ('oklahoma', '6-6-1'),
  ('smu', '6-7-0'),
  ('uconn', '6-6-1'),
  ('duke', '6-7-1'),
  ('georgia', '6-8-0'),
  ('tulane', '6-7-1'),
  ('air-force', '5-7-0'),
  ('bowling-green', '5-7-0'),
  ('buffalo', '5-7-0'),
  ('florida', '5-7-0'),
  ('florida-state', '5-7-0'),  -- Florida St
  ('iowa-state', '5-6-1'),  -- Iowa St
  ('kansas', '5-7-0'),
  ('kansas-state', '5-7-0'),  -- Kansas St
  ('kentucky', '5-7-0'),
  ('maryland', '5-7-0'),
  ('nevada', '5-6-1'),
  ('north-carolina', '5-6-1'),
  ('oklahoma-state', '5-7-0'),  -- Oklahoma St
  ('south-alabama', '5-7-0'),  -- S Alabama
  ('stanford', '5-7-0'),
  ('wyoming', '5-7-0'),
  ('app-state', '5-8-0'),
  ('california', '5-8-0'),
  ('clemson', '5-8-0'),
  ('delaware', '5-7-1'),
  ('minnesota', '5-7-1'),
  ('navy', '5-8-0'),
  ('penn-state', '5-8-0'),  -- Penn St
  ('rice', '5-8-0'),
  ('southern-miss', '5-7-1'),
  ('tennessee', '5-8-0'),
  ('texas', '5-7-1'),
  ('texas-a-m', '5-8-0'),
  ('texas-state', '5-8-0'),  -- Texas St
  ('usc', '5-8-0'),
  ('arkansas', '4-8-0'),
  ('auburn', '4-7-1'),
  ('charlotte', '4-6-2'),
  ('colorado', '4-7-1'),
  ('colorado-state', '4-8-0'),  -- Colorado St
  ('purdue', '4-7-1'),
  ('san-jos-state', '4-8-0'),  -- San Jose St
  ('syracuse', '4-7-1'),
  ('uab', '4-8-0'),
  ('ucla', '4-8-0'),
  ('ul-monroe', '4-8-0'),
  ('lsu', '4-9-0'),
  ('louisville', '4-9-0'),
  ('michigan', '4-9-0'),
  ('nebraska', '4-8-1'),
  ('ucf', '3-8-0'),
  ('liberty', '3-9-0'),
  ('northern-illinois', '3-9-0'),  -- N Illinois
  ('oregon-state', '3-9-0'),  -- Oregon St
  ('sam-houston', '3-9-0'),
  ('massachusetts', '3-9-0'),  -- UMass
  ('utep', '3-9-0'),
  ('virginia-tech', '3-9-0'),
  ('baylor', '2-10-0'),
  ('georgia-state', '2-10-0')  -- Georgia St
) AS v(team_id, ats)
WHERE p.team_id = v.team_id
  AND p.season_year = 2026;

-- Verification:
--   SELECT count(*) FROM team_preseason_stats
--   WHERE season_year = 2026 AND prev_year_ats IS NOT NULL;   -- expect 137
