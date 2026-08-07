# Live schema snapshot

Generated from the PostgREST OpenAPI spec on 2026-08-06 against the production
Supabase project. Column names and types only.

**This does not capture defaults, constraints, indexes, or RLS policies.** Two of
those were missing from the live `games` table and cost a full debugging cycle
each: the UNIQUE on `cfbd_game_id` and the DEFAULT on `id`. Probe the live
database before writing anything that depends on them.

`supabase/migrations/001_initial_schema.sql` no longer describes any table in
this list accurately. See the drift notes at the top of that file.

Regenerate with:

```bash
curl -s "$SUPABASE_URL/rest/v1/" -H "apikey: $SUPABASE_SERVICE_KEY"
```

## users

| column | type |
|---|---|
| id | uuid |
| first_name | text |
| last_name | text |
| email | text |
| dob | date |
| is_admin | boolean |
| smack_talk | text |
| team_avatar | text |
| custom_avatar | boolean |
| created_at | timestamp with time zone |
| firebase_uid | text |
| push_token | text |
| avatar_url | text |

## teams

| column | type |
|---|---|
| id | text |
| school | text |
| mascot | text |
| abbreviation | text |
| classification | text |
| conference | text |
| color | text |
| alternate_color | text |
| alternate_names | text[] |
| cfbd_id | integer |
| espn_id | integer |

## team_season_stats

| column | type |
|---|---|
| team_id | text |
| season_year | integer |
| record | text |
| conf_record | text |
| ats_record | text |
| ats_wins | integer |
| ats_losses | integer |
| game_points | integer |
| weekly_points | jsonb |
| game_status | text |
| game_complete | boolean |
| is_on_bye | boolean |
| next_opponent | text |
| next_game_is_home | boolean |
| next_opponent_spread | numeric |
| next_opponent_spread_display | text |
| total_points_for | integer |
| total_points_against | integer |
| sos_rank | integer |

## team_preseason_stats

| column | type |
|---|---|
| team_id | text |
| season_year | integer |
| conf_odds | numeric |
| power_rank | integer |
| ret_starters | integer |
| predicted_wins | numeric |
| prev_year_record | text |
| prev_year_ats | text |

## games

| column | type |
|---|---|
| id | text |
| week | integer |
| year | integer |
| home_team | text |
| away_team | text |
| home_score | integer |
| away_score | integer |
| home_spread | numeric |
| game_status | text |
| game_complete | boolean |
| neutral_site | boolean |
| venue | text |
| date | timestamp with time zone |
| season_type | text |
| start_time_tbd | boolean |
| conference_game | boolean |
| cfbd_game_id | text |
| game_time | timestamp with time zone |
| period | integer |
| clock | text |
| last_score_update | timestamp with time zone |

## leagues

| column | type |
|---|---|
| id | uuid |
| name | text |
| created_by | uuid |
| admin_id | uuid |
| max_managers | integer |
| draft_complete | boolean |
| draft_type | text |
| draft_order_type | text |
| scoring_type | text |
| invite_code | text |
| draft_date | timestamp with time zone |
| time_per_pick | integer |

## league_members

| column | type |
|---|---|
| id | uuid |
| league_id | uuid |
| user_id | uuid |
| team_name | text |
| avatar_url | text |
| points | numeric |
| has_trip_play | boolean |
| trip_play_used_week | integer |
| freezes_remaining | integer |

## drafts

| column | type |
|---|---|
| id | uuid |
| league_id | uuid |
| status | text |
| draft_order | uuid[] |
| current_pick | integer |
| started_at | timestamp with time zone |
| pick_deadline | timestamp with time zone |
| total_rounds | integer |
| draft_complete | boolean |

## draft_picks

| column | type |
|---|---|
| id | uuid |
| league_id | uuid |
| member_id | uuid |
| team_id | text |
| pick_number | integer |
| picked_at | timestamp with time zone |
| draft_id | uuid |
| round | integer |
| auto_picked | boolean |

## big_boards

| column | type |
|---|---|
| user_id | uuid |
| league_id | uuid |
| team_ids | text[] |
| updated_at | timestamp with time zone |

## weekly_lineups

| column | type |
|---|---|
| id | uuid |
| league_id | uuid |
| member_id | uuid |
| week | integer |
| starters | text[] |
| bench | text[] |
| captain | text |
| trip_play_team | text |
| frozen_teams | text[] |
| team_points | jsonb |
| points | numeric |

## weekly_standings

| column | type |
|---|---|
| league_id | uuid |
| member_id | uuid |
| week | integer |
| points | numeric |
| rank | integer |

## move_history

| column | type |
|---|---|
| id | uuid |
| league_id | uuid |
| member_id | uuid |
| week | integer |
| team_added | text |
| team_dropped | text |
| created_at | timestamp with time zone |

## playoffs

| column | type |
|---|---|
| id | uuid |
| league_id | uuid |
| year | integer |
| championship_bracket | jsonb |
| loser_bracket | jsonb |
| final_draft_order | text[] |
| playoffs_complete | boolean |

## config

| column | type |
|---|---|
| key | text |
| value | jsonb |

## cfb_misses

| column | type |
|---|---|
| id | uuid |
| team_name | text |
| context | text |
| created_at | timestamp with time zone |
