import { randomUUID } from "node:crypto";
import { db } from "./db";
import type { Generation, GenerationType } from "@/types";

export function listGenerationsForJob(jobId: string): Generation[] {
  return db
    .prepare(`SELECT * FROM generations WHERE job_id = ? ORDER BY type ASC`)
    .all(jobId) as unknown as Generation[];
}

/**
 * Saves (or overwrites) the current generation of a given type for a job.
 * `UNIQUE(job_id, type)` means regenerating replaces the previous content
 * rather than accumulating history.
 */
export function saveGeneration(
  jobId: string,
  type: GenerationType,
  content: string
): Generation {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO generations (id, job_id, type, content)
     VALUES (@id, @job_id, @type, @content)
     ON CONFLICT(job_id, type) DO UPDATE SET
       content = excluded.content,
       created_at = datetime('now')`
  ).run({ id, job_id: jobId, type, content });

  return db
    .prepare(`SELECT * FROM generations WHERE job_id = ? AND type = ?`)
    .get(jobId, type) as unknown as Generation;
}
