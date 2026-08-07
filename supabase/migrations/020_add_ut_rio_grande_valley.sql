-- 020_add_ut_rio_grande_valley.sql
-- Add UT Rio Grande Valley, the one team blocking a complete 2026 schedule import.
--
-- RGV is a new FCS program (Southland). It plays at UTSA in week 1, and it was
-- the only unresolved team out of 888 games on the CFBD 2026 schedule.
--
-- It is absent from ESPN's team list entirely, so scripts/backfill-team-ids.js
-- could not have caught it — espn_id stays NULL until ESPN publishes the team.
-- That is fine: espn.js matches games by home team, and UTSA is the home side,
-- so live scoring for that game works without it. The UNIQUE constraint on
-- espn_id permits multiple NULLs.
--
-- id is normalizeTeamName('UT Rio Grande Valley') per src/utils/teamName.js.
-- No logo PNG needed — scripts/checkLogos.js only checks FBS teams.
--
-- Values from CFBD /teams id=292. CFBD also returns city, state, stadium,
-- capacity and timezone for this team; none are stored, because the live teams
-- table has no such columns. color/alternate_color come back as the string
-- "#null" there, so they are left NULL rather than stored as junk.

INSERT INTO teams (
  id,
  school,
  mascot,
  abbreviation,
  classification,
  conference,
  alternate_names,
  cfbd_id,
  espn_id
) VALUES (
  'ut-rio-grande-valley',
  'UT Rio Grande Valley',
  'Vaqueros',
  'RGV',
  'fcs',
  'Southland',
  ARRAY['RGV', 'UT Rio Grande', 'UT Rio Grande Valley'],
  292,
  NULL
)
ON CONFLICT (id) DO NOTHING;

-- Verification — should return 1 row:
--
-- SELECT id, school, classification, cfbd_id, espn_id
-- FROM teams WHERE id = 'ut-rio-grande-valley';
