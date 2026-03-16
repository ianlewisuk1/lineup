// Central source of truth for the current season year.
// Change REACT_APP_SEASON_YEAR in .env (and Vercel env vars) to advance the season.
export const SEASON_YEAR = parseInt(process.env.REACT_APP_SEASON_YEAR || "2026", 10);
