import { NextRequest, NextResponse } from "next/server";
import { deleteWatchedBoard, setWatchedBoardEnabled } from "@/lib/watched-boards";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await req.json();
  const board = setWatchedBoardEnabled(params.id, !!body?.enabled);
  if (!board) {
    return NextResponse.json({ error: "Board not found" }, { status: 404 });
  }
  return NextResponse.json({ board });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  deleteWatchedBoard(params.id);
  return NextResponse.json({ ok: true });
}
