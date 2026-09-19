import { NextRequest, NextResponse } from "next/server";
import { getChapterEntries, searchEntries } from "@/lib/vocab";

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
    return NextResponse.json({ error: "volume and chapter must be integers" }, { status: 400 });
  }

  const entries = await getChapterEntries(volume, chapter);
  return NextResponse.json(entries);
}

export function POST() {
  return NextResponse.json(
    { error: "The vocabulary viewer is read-only; update Markdown and sync the database." },
    { status: 405 },
  );
}
