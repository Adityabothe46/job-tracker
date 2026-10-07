import { NextRequest, NextResponse } from "next/server";
import { createWatchedBoard, listWatchedBoards } from "@/lib/watched-boards";
import type { BoardType } from "@/types";

const VALID_BOARD_TYPES: BoardType[] = ["greenhouse", "lever", "generic"];

export async function GET() {
  return NextResponse.json({ boards: listWatchedBoards() });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { company_name, board_type, board_identifier } = body ?? {};

  if (!company_name?.trim() || !board_identifier?.trim()) {
    return NextResponse.json(
      { error: "company_name and board_identifier are required" },
      { status: 400 }
    );
  }
  if (!VALID_BOARD_TYPES.includes(board_type)) {
    return NextResponse.json({ error: "Invalid board_type" }, { status: 400 });
  }

  const board = createWatchedBoard({
    company_name: company_name.trim(),
    board_type,
    board_identifier: board_identifier.trim(),
  });
  return NextResponse.json({ board }, { status: 201 });
}
