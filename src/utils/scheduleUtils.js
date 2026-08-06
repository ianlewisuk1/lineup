// Re-exported for the many call sites that import { normalize } from here.
// The implementation lives in utils/teamName.js — see that file before changing it.
import { normalizeTeamName } from "./teamName";

export const normalize = normalizeTeamName;

export const canonicalizeTeam = (name) => {
  if (!name) return "";
  let s = String(name).toLowerCase();

  // unify common words
  s = s.replace(/\buniversity\b/g, "")
       .replace(/\bthe\b/g, "")
       .replace(/\bof\b/g, "")
       .replace(/\bat\b/g, "")
       .replace(/\bst[.\s]\b/g, "state ");   // "st.", "st " → "state "

  // remove parentheses and their contents
  s = s.replace(/\([^)]*\)/g, "");

  // collapse & strip punctuation/spaces/hyphens
  s = s.replace(/&/g, "and")
       .replace(/[^a-z0-9]+/g, "");          // keep only a-z0-9

  return s;
};

export const getScheduleEntry = (scheduleData, name) => {
  if (!name) return undefined;
  return (
    scheduleData[name] ||
    scheduleData[name?.toLowerCase?.()] ||
    scheduleData[normalize(name)] ||
    scheduleData[`__canon__:${canonicalizeTeam(name)}`]
  );
};

// --- BYE detection helper (robust) ---
export const isTeamOnBye = (name, scheduleData) => {
  const hasEntry = !!getScheduleEntry(scheduleData, name);
  return !hasEntry;
};
