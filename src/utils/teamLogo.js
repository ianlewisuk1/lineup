// Single source of truth for team logo URLs.
//
// Logos are static PNGs committed to /public/logos, named by the team slug
// (e.g. "Ohio State" -> /logos/ohio-state.png). Nothing else — no DB column,
// no CDN, no per-team override — decides where a logo comes from.
//
// The file may not exist yet for every team; callers should render an initials
// placeholder behind the <img> and hide the image in onError.

// Combining diacritical marks, left behind after an NFD decomposition.
const COMBINING_MARKS = /[̀-ͯ]/g;

// Normalizes a team name to the slug format used for logo filenames and as the
// key in the AuthContext teams map (e.g. "Texas A&M" -> "texas-am").
export const normalizeTeamSlug = (name) =>
  name?.toLowerCase().replace(/\s+/g, "-").replace(/&/g, "").replace(/[^a-z0-9-]/g, "");

// Builds the logo URL for a team name or an already-normalized slug.
//
// Accents are folded first ("San José State" -> san-jose-state). The plain
// normalizer strips them entirely, which would ask for san-jos-state.png.
// Folding is deliberately not done inside normalizeTeamSlug: that function's
// output is used as the teams-map key and is already baked into stored lineup
// arrays, so changing it would break those lookups.
export const teamLogoUrl = (nameOrSlug) => {
  const folded = nameOrSlug?.normalize("NFD").replace(COMBINING_MARKS, "");
  const slug = normalizeTeamSlug(folded);
  return slug ? `/logos/${slug}.png` : null;
};
