import { randomUUID } from "node:crypto";
import { db } from "./db";
import type { BoardType, WatchedBoard } from "@/types";

export function listWatchedBoards(): WatchedBoard[] {
  return db
    .prepare(`SELECT * FROM watched_boards ORDER BY created_at ASC`)
    .all() as unknown as WatchedBoard[];
}

export function listEnabledWatchedBoards(): WatchedBoard[] {
  return db
    .prepare(`SELECT * FROM watched_boards WHERE enabled = 1 ORDER BY created_at ASC`)
    .all() as unknown as WatchedBoard[];
}

export interface CreateWatchedBoardInput {
  company_name: string;
  board_type: BoardType;
  board_identifier: string;
}

export function createWatchedBoard(input: CreateWatchedBoardInput): WatchedBoard {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO watched_boards (id, company_name, board_type, board_identifier, enabled)
     VALUES (@id, @company_name, @board_type, @board_identifier, 1)`
  ).run({
    id,
    company_name: input.company_name,
    board_type: input.board_type,
    board_identifier: input.board_identifier,
  });
  return db
    .prepare(`SELECT * FROM watched_boards WHERE id = ?`)
    .get(id) as unknown as WatchedBoard;
}

export function setWatchedBoardEnabled(
  id: string,
  enabled: boolean
): WatchedBoard | undefined {
  db.prepare(`UPDATE watched_boards SET enabled = @enabled WHERE id = @id`).run({
    id,
    enabled: enabled ? 1 : 0,
  });
  return db
    .prepare(`SELECT * FROM watched_boards WHERE id = ?`)
    .get(id) as unknown as WatchedBoard | undefined;
}

export function deleteWatchedBoard(id: string): void {
  db.prepare(`DELETE FROM watched_boards WHERE id = ?`).run(id);
}
