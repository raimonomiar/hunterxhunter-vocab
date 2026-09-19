import { ready } from "@/lib/db";
import type { Client, Transaction } from "@libsql/client";

export type VocabEntry = {
  id: number;
  volume: number;
  chapter: number;
  kanji: string | null;
  kana: string;
  english: string;
  page: number;
  notes: string | null;
};

export type ChapterSummary = {
  number: number;
  entryCount: number;
};

export type VolumeSummary = {
  number: number;
  chapters: ChapterSummary[];
};

function mapRow(row: Record<string, unknown>): VocabEntry {
  return {
    id: Number(row.id),
    volume: Number(row.volume_number),
    chapter: Number(row.chapter_number),
    kanji: (row.kanji as string | null) ?? null,
    kana: row.kana as string,
    english: row.english as string,
    page: Number(row.page),
    notes: (row.notes as string | null) ?? null,
  };
}

type DbExecutor = Pick<Client | Transaction, "execute">;

/** Finds the volume+chapter row, creating either as needed. */
export async function findOrCreateChapterWithExecutor(
  db: DbExecutor,
  volume: number,
  chapter: number,
): Promise<number> {
  await db.execute({
    sql: `INSERT INTO volumes (number) VALUES (?) ON CONFLICT(number) DO NOTHING`,
    args: [volume],
  });
  const volumeRow = await db.execute({
    sql: `SELECT id FROM volumes WHERE number = ?`,
    args: [volume],
  });
  const volumeId = volumeRow.rows[0].id as number;

  await db.execute({
    sql: `INSERT INTO chapters (volume_id, number) VALUES (?, ?) ON CONFLICT(volume_id, number) DO NOTHING`,
    args: [volumeId, chapter],
  });
  const chapterRow = await db.execute({
    sql: `SELECT id FROM chapters WHERE volume_id = ? AND number = ?`,
    args: [volumeId, chapter],
  });
  return chapterRow.rows[0].id as number;
}

/** Finds the volume+chapter row, creating either as needed. */
export async function findOrCreateChapter(volume: number, chapter: number): Promise<number> {
  return findOrCreateChapterWithExecutor(await ready(), volume, chapter);
}

export async function getStructure(): Promise<VolumeSummary[]> {
  const db = await ready();
  const result = await db.execute(`
    SELECT
      v.number AS volume_number,
      c.number AS chapter_number,
      COUNT(e.id) AS entry_count
    FROM volumes v
    LEFT JOIN chapters c ON c.volume_id = v.id
    LEFT JOIN vocab_entries e ON e.chapter_id = c.id
    GROUP BY v.number, c.number
    ORDER BY v.number ASC, c.number ASC
  `);

  const byVolume = new Map<number, ChapterSummary[]>();
  for (const number of result.rows.map((r) => Number(r.volume_number))) {
    if (!byVolume.has(number)) byVolume.set(number, []);
  }
  for (const row of result.rows) {
    const volumeNumber = Number(row.volume_number);
    if (row.chapter_number === null) continue;
    byVolume.get(volumeNumber)!.push({
      number: Number(row.chapter_number),
      entryCount: Number(row.entry_count),
    });
  }

  return [...byVolume.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([number, chapters]) => ({ number, chapters }));
}

export async function getChapterEntries(volume: number, chapter: number): Promise<VocabEntry[]> {
  const db = await ready();
  const result = await db.execute({
    sql: `
      SELECT e.id, v.number AS volume_number, c.number AS chapter_number,
             e.kanji, e.kana, e.english, e.page, e.notes
      FROM vocab_entries e
      JOIN chapters c ON c.id = e.chapter_id
      JOIN volumes v ON v.id = c.volume_id
      WHERE v.number = ? AND c.number = ?
      ORDER BY e.page ASC, e.id ASC
    `,
    args: [volume, chapter],
  });
  return result.rows.map((r) => mapRow(r as Record<string, unknown>));
}

export async function searchEntries(query: string): Promise<VocabEntry[]> {
  const db = await ready();
  const like = `%${query}%`;
  const result = await db.execute({
    sql: `
      SELECT e.id, v.number AS volume_number, c.number AS chapter_number,
             e.kanji, e.kana, e.english, e.page, e.notes
      FROM vocab_entries e
      JOIN chapters c ON c.id = e.chapter_id
      JOIN volumes v ON v.id = c.volume_id
      WHERE e.kanji LIKE ? OR e.kana LIKE ? OR e.english LIKE ?
      ORDER BY v.number ASC, c.number ASC, e.page ASC, e.id ASC
    `,
    args: [like, like, like],
  });
  return result.rows.map((r) => mapRow(r as Record<string, unknown>));
}
