import { NextResponse } from "next/server";

function readOnlyResponse() {
  return NextResponse.json(
    { error: "The vocabulary viewer is read-only; update Markdown and sync the database." },
    { status: 405 },
  );
}

export function PATCH() {
  return readOnlyResponse();
}

export function DELETE() {
  return readOnlyResponse();
}
