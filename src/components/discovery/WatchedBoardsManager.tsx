"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import type { BoardType, WatchedBoard } from "@/types";

const BOARD_TYPE_PLACEHOLDERS: Record<BoardType, string> = {
  greenhouse: "greenhouse board slug (e.g. \"acme\")",
  lever: "lever board slug (e.g. \"acme\")",
  generic: "https://company.com/careers",
};

interface WatchedBoardsManagerProps {
  onToast: (message: string, tone?: "success" | "error") => void;
}

export function WatchedBoardsManager({ onToast }: WatchedBoardsManagerProps) {
  const [boards, setBoards] = useState<WatchedBoard[]>([]);
  const [loading, setLoading] = useState(true);
  const [companyName, setCompanyName] = useState("");
  const [boardType, setBoardType] = useState<BoardType>("greenhouse");
  const [boardIdentifier, setBoardIdentifier] = useState("");
  const [adding, setAdding] = useState(false);

  function loadBoards() {
    setLoading(true);
    fetch("/api/watched-boards")
      .then((res) => res.json())
      .then((data) => setBoards(data.boards))
      .catch(() => onToast("Couldn't load watched boards.", "error"))
      .finally(() => setLoading(false));
  }

  useEffect(loadBoards, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleAdd() {
    if (!companyName.trim() || !boardIdentifier.trim()) {
      onToast("Company name and board identifier are required.", "error");
      return;
    }
    setAdding(true);
    try {
      const res = await fetch("/api/watched-boards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_name: companyName.trim(),
          board_type: boardType,
          board_identifier: boardIdentifier.trim(),
        }),
      });
      if (!res.ok) throw new Error();
      setCompanyName("");
      setBoardIdentifier("");
      loadBoards();
      onToast("Board added.");
    } catch {
      onToast("Couldn't add that board.", "error");
    } finally {
      setAdding(false);
    }
  }

  async function handleToggle(board: WatchedBoard) {
    try {
      const res = await fetch(`/api/watched-boards/${board.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !board.enabled }),
      });
      if (!res.ok) throw new Error();
      loadBoards();
    } catch {
      onToast("Couldn't update that board.", "error");
    }
  }

  async function handleDelete(id: string) {
    try {
      const res = await fetch(`/api/watched-boards/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      loadBoards();
    } catch {
      onToast("Couldn't remove that board.", "error");
    }
  }

  return (
    <div className="space-y-4">
      {loading ? (
        <div className="py-4 text-center text-sm text-ink-muted">Loading…</div>
      ) : boards.length === 0 ? (
        <p className="text-sm text-ink-muted">No boards watched yet.</p>
      ) : (
        <ul className="divide-y divide-line">
          {boards.map((board) => (
            <li
              key={board.id}
              className="flex items-center justify-between gap-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink">
                  {board.company_name}{" "}
                  <span className="font-normal text-ink-muted">
                    ({board.board_type})
                  </span>
                </p>
                <p className="truncate text-xs text-ink-muted">
                  {board.board_identifier}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleToggle(board)}
                  className="text-xs font-medium text-accent-400 hover:text-accent-300"
                >
                  {board.enabled ? "Disable" : "Enable"}
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(board.id)}
                  className="text-xs font-medium text-red-400 hover:text-red-300"
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="rounded-lg border border-line bg-surface-muted p-3.5">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
          Add a board
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div>
            <Label>Company name</Label>
            <Input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Acme Inc."
            />
          </div>
          <div>
            <Label>Board type</Label>
            <select
              value={boardType}
              onChange={(e) => setBoardType(e.target.value as BoardType)}
              className="w-full rounded-md border border-line-strong bg-base/60 px-3 py-2 text-sm text-ink focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/30"
            >
              <option value="greenhouse">Greenhouse</option>
              <option value="lever">Lever</option>
              <option value="generic">Generic (careers page)</option>
            </select>
          </div>
          <div>
            <Label>Board identifier</Label>
            <Input
              value={boardIdentifier}
              onChange={(e) => setBoardIdentifier(e.target.value)}
              placeholder={BOARD_TYPE_PLACEHOLDERS[boardType]}
            />
          </div>
        </div>
        <div className="mt-3 flex justify-end">
          <Button type="button" onClick={handleAdd} disabled={adding}>
            {adding ? <Spinner /> : "Add board"}
          </Button>
        </div>
      </div>
    </div>
  );
}
