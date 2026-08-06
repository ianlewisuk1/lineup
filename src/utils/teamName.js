// Canonical team-name normalization.
//
// A team's slug is the join key used everywhere: it keys the AuthContext teams
// map, it is what gets written into weekly_lineups starters/bench arrays, and
// it names the logo file in /public/logos.
//
// Ampersands become "-", not "". This matches teams.id in Supabase
// ("Texas A&M" -> "texas-a-m") and was already the behaviour of most call
// sites. Do not "simplify" it to strip the ampersand — that produces
// "texas-am", which silently fails to match stored roster data.
//
// Import this. Do not hand-roll the regex; divergent copies previously caused
// Texas A&M to miss every teams-map lookup.
export const normalizeTeamName = (name) =>
  name
    ?.toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/&/g, "-")
    .replace(/[^a-z0-9-]/g, "");

// Combining diacritical marks left behind by an NFD decomposition.
const COMBINING_MARKS = /[̀-ͯ]/g;

// Strips accents so "San José State" folds to "san-jose-state" rather than
// losing the character entirely ("san-jos-state").
export const foldAccents = (name) =>
  name?.normalize("NFD").replace(COMBINING_MARKS, "");
