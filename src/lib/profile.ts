import { db } from "./db";
import type { Profile } from "@/types";

export function getProfile(): Profile {
  return db.prepare(`SELECT * FROM profile WHERE id = 1`).get() as unknown as Profile;
}

export function saveProfile(resumeText: string): Profile {
  db.prepare(
    `UPDATE profile SET resume_text = ?, updated_at = datetime('now') WHERE id = 1`
  ).run(resumeText);
  return getProfile();
}
