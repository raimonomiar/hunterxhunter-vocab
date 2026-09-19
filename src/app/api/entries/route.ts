import { NextRequest, NextResponse } from "next/server";
import { createEntry, getChapterEntries, searchEntries } from "@/lib/vocab";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q");

  if (q !== null) {
    const trimmed = q.trim();
    if (trimmed.length === 0) {
      return NextResponse.json([]);
    }
    const entries = await searchEntries(trimmed);
    return NextResponse.json(entries);
  }

  const volumeParam = searchParams.get("volume");
  const chapterParam = searchParams.get("chapter");
  if (volumeParam === null || chapterParam === null) {
    return NextResponse.json(
      { error: "volume and chapter are required unless q is provided" },
      { status: 400 },
    );
  }
  const volume = Number(volumeParam);
  const chapter = Number(chapterParam);
  if (!Number.isInteger(volume) || !Number.isInteger(chapter)) {
    return NextResponse.json(
      { error: "volume and chapter must be integers" },
      { status: 400 },
    );
  }

  const entries = await getChapterEntries(volume, chapter);
  return NextResponse.json(entries);
}

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export async function POST(request: NextRequest) {
  const body = await request.json();

  const volume = Number(body.volume);
  const chapter = Number(body.chapter);
  const kana = typeof body.kana === "string" ? body.kana.trim() : "";
  const english = typeof body.english === "string" ? body.english.trim() : "";
  const page = Number(body.page);
  const kanji = normalizeOptionalString(body.kanji);
  const notes = normalizeOptionalString(body.notes);

  const errors: string[] = [];
  if (!Number.isInteger(volume) || volume < 1) errors.push("volume must be a positive integer");
  if (!Number.isInteger(chapter) || chapter < 1) errors.push("chapter must be a positive integer");
  if (kana.length === 0) errors.push("kana is required");
  if (english.length === 0) errors.push("english is required");
  if (!Number.isInteger(page) || page < 1) errors.push("page must be a positive integer");

  if (errors.length > 0) {
    return NextResponse.json({ error: errors.join("; ") }, { status: 400 });
  }

  const entry = await createEntry({
    volume,
    chapter,
    kanji,
    kana,
    english,
    page,
    notes,
  });
  return NextResponse.json(entry, { status: 201 });
}
