// Single source of truth for team logo URLs.
//
// Logos are static PNGs committed to /public/logos, named by the team slug
// (e.g. "Ohio State" -> /logos/ohio-state.png). Nothing else — no DB column,
// no CDN, no per-team override — decides where a logo comes from.
//
// The file may not exist yet for every team; callers should render an initials
// placeholder behind the <img> and hide the image in onError.
//
// Run `npm run check:logos` to verify every FBS team in the DB resolves.
import { normalizeTeamName, foldAccents } from "./teamName";

// Builds the logo URL for a team name or an already-normalized slug.
//
// Accents are folded first, so "San José State" asks for san-jose-state.png.
// The plain normalizer drops the character entirely, which would ask for
// san-jos-state.png. Folding is deliberately NOT part of normalizeTeamName:
// that output must keep matching teams.id in Supabase, which stores the
// accent-stripped form.
export const teamLogoUrl = (nameOrSlug) => {
  const slug = normalizeTeamName(foldAccents(nameOrSlug));
  return slug ? `/logos/${slug}.png` : null;
};
