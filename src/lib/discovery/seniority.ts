// Seniority filter for Job Watch. The user is early-career (MS grad + co-op +
// ~2.7 yrs manufacturing), so senior/lead/level-III+ titles are noise.
// Dependency-free: used by job-watch.ts (dropping results) and jobs.ts
// (hiding ones already on the board).

const SENIOR_WORDS =
  /\b(senior|sr\.?|lead|principal|staff|director|head of|vice president|vp|chief|architect|manager\s+(ii|iii|iv))\b/i;
// Level III and above as a standalone roman numeral ("Engineer III", "IV").
const HIGH_LEVEL = /\b(iii|iv|v|vi)\b(?![\w-])/i;

export function isSeniorTitle(title: string): boolean {
  return SENIOR_WORDS.test(title) || HIGH_LEVEL.test(title);
}
