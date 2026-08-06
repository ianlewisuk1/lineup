#!/usr/bin/env node
/**
 * Verifies every FBS team in Supabase has a logo PNG in /public/logos.
 *
 * Logos are resolved by slug, so a team whose `school` or `id` spelling drifts
 * from its filename silently renders an initials placeholder instead — easy to
 * miss by eye across 136 teams. This is the check that catches that.
 *
 * Checks BOTH lookup paths, because they can disagree:
 *   - school path: draft/scouting/free-agent pages pass team.school
 *   - id path:     lineup views pass the slug stored in weekly_lineups
 *
 * Usage: npm run check:logos     (exits 1 on any miss)
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const LOGO_DIR = path.join(ROOT, "public", "logos");

// Mirrors src/utils/teamName.js. Kept as a plain copy because this script runs
// in Node without the CRA/babel pipeline that resolves ES modules.
const normalizeTeamName = (name) =>
  name?.toLowerCase().replace(/\s+/g, "-").replace(/&/g, "-").replace(/[^a-z0-9-]/g, "");
const foldAccents = (name) => name?.normalize("NFD").replace(/[̀-ͯ]/g, "");
const logoSlug = (name) => normalizeTeamName(foldAccents(name));

function loadEnv() {
  for (const file of [".env", "backend/.env"]) {
    try {
      fs.readFileSync(path.join(ROOT, file), "utf8").split("\n").forEach((line) => {
        const m = line.match(/^([A-Z_]+)=(.*)$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
      });
    } catch {
      /* file is optional */
    }
  }
}

async function main() {
  loadEnv();
  const url = process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.REACT_APP_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    console.error("check:logos — missing Supabase URL/key in .env, skipping");
    process.exit(0);
  }

  const res = await fetch(`${url}/rest/v1/teams?select=id,school,classification`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  const rows = await res.json();
  if (!Array.isArray(rows)) {
    console.error("check:logos — unexpected response:", JSON.stringify(rows).slice(0, 200));
    process.exit(1);
  }

  const fbs = rows.filter((t) => (t.classification || "").toLowerCase() === "fbs");
  const have = new Set(
    fs.readdirSync(LOGO_DIR).filter((f) => /\.png$/i.test(f)).map((f) => f.replace(/\.png$/i, ""))
  );

  const problems = [];
  const notes = [];
  for (const t of fbs) {
    const bySchool = logoSlug(t.school);
    const byId = logoSlug(t.id);
    if (!have.has(bySchool)) problems.push(`${t.school} — missing ${bySchool}.png (school path)`);
    if (byId !== bySchool) {
      if (!have.has(byId)) problems.push(`${t.school} — missing ${byId}.png (id path)`);
      // Not a failure while both files exist, but it means this team is
      // carrying a duplicate PNG purely to paper over the spelling gap.
      else notes.push(`${t.school} — id "${t.id}" differs from "${bySchool}"; duplicate PNG covers it`);
    }
  }

  console.log(`check:logos — ${fbs.length} FBS teams, ${have.size} PNGs`);
  notes.forEach((n) => console.log(`  note: ${n}`));
  if (!problems.length) {
    console.log("  all teams resolve on both paths");
    return;
  }
  problems.forEach((p) => console.error(`  ${p}`));
  console.error(`\n${problems.length} problem(s). Add the PNG to public/logos, or fix the teams row.`);
  process.exit(1);
}

main().catch((e) => {
  console.error("check:logos failed:", e.message);
  process.exit(1);
});
