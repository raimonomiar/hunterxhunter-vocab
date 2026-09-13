import { NextRequest, NextResponse } from "next/server";
import { deleteEntry, updateEntry } from "@/lib/vocab";

function normalizeOptionalString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  const body = await request.json();
  const errors: string[] = [];

  const update: Parameters<typeof updateEntry>[1] = {};

  if (body.volume !== undefined) {
    const volume = Number(body.volume);
    if (!Number.isInteger(volume) || volume < 1) errors.push("volume must be a positive integer");
    else update.volume = volume;
  }
  if (body.chapter !== undefined) {
    const chapter = Number(body.chapter);
    if (!Number.isInteger(chapter) || chapter < 1) errors.push("chapter must be a positive integer");
    else update.chapter = chapter;
  }
  if ((body.volume !== undefined) !== (body.chapter !== undefined)) {
    errors.push("volume and chapter must be updated together");
  }
  if (body.kana !== undefined) {
    const kana = typeof body.kana === "string" ? body.kana.trim() : "";
    if (kana.length === 0) errors.push("kana cannot be empty");
    else update.kana = kana;
  }
  if (body.english !== undefined) {
    const english = typeof body.english === "string" ? body.english.trim() : "";
    if (english.length === 0) errors.push("english cannot be empty");
    else update.english = english;
  }
  if (body.page !== undefined) {
    const page = Number(body.page);
    if (!Number.isInteger(page) || page < 1) errors.push("page must be a positive integer");
    else update.page = page;
  }
  if (body.kanji !== undefined) update.kanji = normalizeOptionalString(body.kanji) ?? null;
  if (body.notes !== undefined) update.notes = normalizeOptionalString(body.notes) ?? null;
  if (body.wkLevel !== undefined) update.wkLevel = normalizeOptionalString(body.wkLevel) ?? null;

  if (errors.length > 0) {
    return NextResponse.json({ error: errors.join("; ") }, { status: 400 });
  }

  const entry = await updateEntry(id, update);
  if (!entry) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json(entry);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  const deleted = await deleteEntry(id);
  if (!deleted) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
