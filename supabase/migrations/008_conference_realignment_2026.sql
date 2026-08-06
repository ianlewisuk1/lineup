-- 008_conference_realignment_2026.sql
-- FBS conference realignment effective 2026-07-01.
--
-- Pac-12 rebuilds to 8 (adds 5 from Mountain West + Texas State from Sun Belt).
-- Mountain West backfills with UTEP (CUSA), Northern Illinois (MAC), North Dakota State (FCS).
-- Conference USA drops to 10. MAC replaces NIU with Sacramento State (FCS promotion).
-- Sun Belt replaces Texas State with Louisiana Tech.
--
-- Conference strings match existing DB values exactly ('Mid-American', not 'MAC';
-- 'Pac-12'; 'Conference USA'). classification is lowercase 'fbs'/'fcs' in this table.

BEGIN;

-- Conference moves — all rows already classification = 'fbs'.
UPDATE teams AS t
SET conference = v.conference
FROM (VALUES
  -- Mountain West -> Pac-12
  ('boise-state',        'Pac-12'),
  ('colorado-state',     'Pac-12'),
  ('fresno-state',       'Pac-12'),
  ('san-diego-state',    'Pac-12'),
  ('utah-state',         'Pac-12'),
  -- Sun Belt -> Pac-12
  ('texas-state',        'Pac-12'),
  -- Conference USA -> Sun Belt
  ('louisiana-tech',     'Sun Belt'),
  -- Conference USA -> Mountain West
  ('utep',               'Mountain West'),
  -- Mid-American -> Mountain West
  ('northern-illinois',  'Mountain West'),
  -- MVFC (FCS) -> Mountain West; row was already promoted to classification 'fbs'
  ('north-dakota-state', 'Mountain West')
) AS v(id, conference)
WHERE t.id = v.id;

-- Sacramento State: FCS promotion. Needs classification flipped as well as conference.
UPDATE teams
SET conference = 'Mid-American',
    classification = 'fbs'
WHERE id = 'sacramento-state';

COMMIT;

-- Verification — expected FBS counts for 2026:
--   ACC 17 | American Athletic 14 | Big 12 16 | Big Ten 18 | Conference USA 10
--   FBS Independents 2 | Mid-American 13 | Mountain West 10 | Pac-12 8
--   SEC 16 | Sun Belt 14        (138 total, and no remaining fbs|MVFC row)
--
-- SELECT conference, count(*) FROM teams
-- WHERE classification = 'fbs' GROUP BY 1 ORDER BY 1;
