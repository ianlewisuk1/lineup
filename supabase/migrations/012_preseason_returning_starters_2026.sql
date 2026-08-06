-- 012_preseason_returning_starters_2026.sql
-- Returning starters for 2026 -> team_preseason_stats.ret_starters.
--
-- Stored as a PERCENTAGE (whole number, 0-100), not a raw count: value is
-- round(returning / 22 * 100), where 22 = 11 offensive + 11 defensive starters.
-- The trailing comment on each row keeps the underlying count for reference,
-- since the column is INT and the rounding is lossy (e.g. 9 and 10 of 22 both
-- land near 41/45, and no stored value can recover the original count).
--
-- Iowa State and North Texas are genuinely 0 returning starters, not missing data.
--
-- 138 rows, one per FBS team. UPDATE, not upsert -- the 2026 rows already exist.
-- Every team_id was verified against teams.id.

UPDATE team_preseason_stats AS p
SET ret_starters = v.ret_pct
FROM (VALUES
  ('usc', 68),  -- USC: 15 of 22
  ('georgia', 64),  -- Georgia: 14 of 22
  ('maryland', 64),  -- Maryland: 14 of 22
  ('new-mexico', 64),  -- New Mexico: 14 of 22
  ('notre-dame', 64),  -- Notre Dame: 14 of 22
  ('oklahoma', 64),  -- Oklahoma: 14 of 22
  ('oregon', 64),  -- Oregon: 14 of 22
  ('virginia-tech', 64),  -- Virginia Tech: 14 of 22
  ('byu', 59),  -- BYU: 13 of 22
  ('boise-state', 59),  -- Boise State: 13 of 22
  ('fresno-state', 59),  -- Fresno State: 13 of 22
  ('tennessee', 59),  -- Tennessee: 13 of 22
  ('texas-tech', 59),  -- Texas Tech: 13 of 22
  ('delaware', 55),  -- Delaware: 12 of 22
  ('houston', 55),  -- Houston: 12 of 22
  ('nebraska', 55),  -- Nebraska: 12 of 22
  ('stanford', 55),  -- Stanford: 12 of 22
  ('texas', 55),  -- Texas: 12 of 22
  ('air-force', 50),  -- Air Force: 11 of 22
  ('army', 50),  -- Army: 11 of 22
  ('florida-atlantic', 50),  -- Florida Atlantic: 11 of 22
  ('minnesota', 50),  -- Minnesota: 11 of 22
  ('navy', 50),  -- Navy: 11 of 22
  ('ohio-state', 50),  -- Ohio State: 11 of 22
  ('pittsburgh', 50),  -- Pittsburgh: 11 of 22
  ('smu', 50),  -- SMU: 11 of 22
  ('texas-state', 50),  -- Texas State: 11 of 22
  ('western-michigan', 50),  -- Western Michigan: 11 of 22
  ('arkansas-state', 45),  -- Arkansas State: 10 of 22
  ('indiana', 45),  -- Indiana: 10 of 22
  ('liberty', 45),  -- Liberty: 10 of 22
  ('miami', 45),  -- Miami: 10 of 22
  ('michigan', 45),  -- Michigan: 10 of 22
  ('ole-miss', 45),  -- Ole Miss: 10 of 22
  ('oregon-state', 45),  -- Oregon State: 10 of 22
  ('san-diego-state', 45),  -- San Diego State: 10 of 22
  ('south-carolina', 45),  -- South Carolina: 10 of 22
  ('ucf', 45),  -- UCF: 10 of 22
  ('vanderbilt', 45),  -- Vanderbilt: 10 of 22
  ('wake-forest', 45),  -- Wake Forest: 10 of 22
  ('washington', 45),  -- Washington: 10 of 22
  ('akron', 41),  -- Akron: 9 of 22
  ('california', 41),  -- California: 9 of 22
  ('eastern-michigan', 41),  -- Eastern Michigan: 9 of 22
  ('florida', 41),  -- Florida: 9 of 22
  ('jacksonville-state', 41),  -- Jacksonville State: 9 of 22
  ('kansas-state', 41),  -- Kansas State: 9 of 22
  ('kent-state', 41),  -- Kent State: 9 of 22
  ('louisiana', 41),  -- Louisiana: 9 of 22
  ('marshall', 41),  -- Marshall: 9 of 22
  ('miami-oh', 41),  -- Miami-Ohio: 9 of 22
  ('new-mexico-state', 41),  -- New Mexico State: 9 of 22
  ('northwestern', 41),  -- Northwestern: 9 of 22
  ('temple', 41),  -- Temple: 9 of 22
  ('texas-a-m', 41),  -- Texas A&M: 9 of 22
  ('tulsa', 41),  -- Tulsa: 9 of 22
  ('utah-state', 41),  -- Utah State: 9 of 22
  ('arizona', 36),  -- Arizona: 8 of 22
  ('central-michigan', 36),  -- Central Michigan: 8 of 22
  ('clemson', 36),  -- Clemson: 8 of 22
  ('duke', 36),  -- Duke: 8 of 22
  ('lsu', 36),  -- LSU: 8 of 22
  ('louisville', 36),  -- Louisville: 8 of 22
  ('nc-state', 36),  -- NC State: 8 of 22
  ('north-dakota-state', 36),  -- North Dakota State: 8 of 22
  ('rutgers', 36),  -- Rutgers: 8 of 22
  ('tcu', 36),  -- TCU: 8 of 22
  ('utsa', 36),  -- UTSA: 8 of 22
  ('virginia', 36),  -- Virginia: 8 of 22
  ('alabama', 32),  -- Alabama: 7 of 22
  ('ball-state', 32),  -- Ball State: 7 of 22
  ('charlotte', 32),  -- Charlotte: 7 of 22
  ('georgia-tech', 32),  -- Georgia Tech: 7 of 22
  ('hawaii', 32),  -- Hawaii: 7 of 22
  ('illinois', 32),  -- Illinois: 7 of 22
  ('louisiana-tech', 32),  -- Louisiana Tech: 7 of 22
  ('mississippi-state', 32),  -- Mississippi State: 7 of 22
  ('missouri', 32),  -- Missouri: 7 of 22
  ('missouri-state', 32),  -- Missouri State: 7 of 22
  ('purdue', 32),  -- Purdue: 7 of 22
  ('syracuse', 32),  -- Syracuse: 7 of 22
  ('troy', 32),  -- Troy: 7 of 22
  ('arkansas', 27),  -- Arkansas: 6 of 22
  ('buffalo', 27),  -- Buffalo: 6 of 22
  ('florida-state', 27),  -- Florida State: 6 of 22
  ('iowa', 27),  -- Iowa: 6 of 22
  ('kansas', 27),  -- Kansas: 6 of 22
  ('kennesaw-state', 27),  -- Kennesaw State: 6 of 22
  ('nevada', 27),  -- Nevada: 6 of 22
  ('ohio', 27),  -- Ohio: 6 of 22
  ('ucla', 27),  -- UCLA: 6 of 22
  ('massachusetts', 27),  -- UMass: 6 of 22
  ('unlv', 27),  -- UNLV: 6 of 22
  ('western-kentucky', 27),  -- Western Kentucky: 6 of 22
  ('wyoming', 27),  -- Wyoming: 6 of 22
  ('app-state', 23),  -- App State: 5 of 22
  ('baylor', 23),  -- Baylor: 5 of 22
  ('boston-college', 23),  -- Boston College: 5 of 22
  ('cincinnati', 23),  -- Cincinnati: 5 of 22
  ('coastal-carolina', 23),  -- Coastal Carolina: 5 of 22
  ('colorado', 23),  -- Colorado: 5 of 22
  ('florida-international', 23),  -- FIU: 5 of 22
  ('georgia-state', 23),  -- Georgia State: 5 of 22
  ('kentucky', 23),  -- Kentucky: 5 of 22
  ('ul-monroe', 23),  -- Louisiana Monroe: 5 of 22
  ('michigan-state', 23),  -- Michigan State: 5 of 22
  ('north-carolina', 23),  -- North Carolina: 5 of 22
  ('old-dominion', 23),  -- Old Dominion: 5 of 22
  ('rice', 23),  -- Rice: 5 of 22
  ('sam-houston', 23),  -- Sam Houston: 5 of 22
  ('south-alabama', 23),  -- South Alabama: 5 of 22
  ('tulane', 23),  -- Tulane: 5 of 22
  ('utah', 23),  -- Utah: 5 of 22
  ('washington-state', 23),  -- Washington State: 5 of 22
  ('colorado-state', 18),  -- Colorado State: 4 of 22
  ('middle-tennessee', 18),  -- Middle Tennessee: 4 of 22
  ('northern-illinois', 18),  -- Northern Illinois: 4 of 22
  ('penn-state', 18),  -- Penn State: 4 of 22
  ('sacramento-state', 18),  -- Sacramento State: 4 of 22
  ('utep', 18),  -- UTEP: 4 of 22
  ('wisconsin', 18),  -- Wisconsin: 4 of 22
  ('arizona-state', 14),  -- Arizona State: 3 of 22
  ('auburn', 14),  -- Auburn: 3 of 22
  ('bowling-green', 14),  -- Bowling Green: 3 of 22
  ('east-carolina', 14),  -- East Carolina: 3 of 22
  ('georgia-southern', 14),  -- Georgia Southern: 3 of 22
  ('james-madison', 14),  -- James Madison: 3 of 22
  ('oklahoma-state', 14),  -- Oklahoma State: 3 of 22
  ('south-florida', 14),  -- South Florida: 3 of 22
  ('uab', 14),  -- UAB: 3 of 22
  ('west-virginia', 14),  -- West Virginia: 3 of 22
  ('san-jos-state', 9),  -- San Jose State: 2 of 22
  ('memphis', 5),  -- Memphis: 1 of 22
  ('southern-miss', 5),  -- Southern Miss: 1 of 22
  ('toledo', 5),  -- Toledo: 1 of 22
  ('uconn', 5),  -- UConn: 1 of 22
  ('iowa-state', 0),  -- Iowa State: 0 of 22
  ('north-texas', 0)  -- North Texas: 0 of 22
) AS v(team_id, ret_pct)
WHERE p.team_id = v.team_id
  AND p.season_year = 2026;

-- Verification:
--   SELECT count(*) FROM team_preseason_stats
--   WHERE season_year = 2026 AND ret_starters IS NOT NULL;   -- expect 138
