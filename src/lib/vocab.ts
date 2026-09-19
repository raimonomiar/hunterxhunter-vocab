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
  wkLevel: string | null;
};

export type ChapterSummary = {
  number: number;
  entryCount: number;
};

export type VolumeSummary = {
  number: number;
  chapters: ChapterSummary[];
};

export type NewEntryInput = {
  volume: number;
  chapter: number;
  kanji: string | null;
  kana: string;
  english: string;
  page: number;
  notes: string | null;
  wkLevel: string | null;
};

export type UpdateEntryInput = Partial<
  Omit<NewEntryInput, "volume" | "chapter">
> & {
  volume?: number;
  chapter?: number;
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
    wkLevel: (row.wk_level as string | null) ?? null,
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
export async function findOrCreateChapter(
  volume: number,
  chapter: number,
): Promise<number> {
  return findOrCreateChapterWithExecutor(await ready(), volume, chapter);
}

export async function ensureVolume(volume: number): Promise<void> {
  const db = await ready();
  await db.execute({
    sql: `INSERT INTO volumes (number) VALUES (?) ON CONFLICT(number) DO NOTHING`,
    args: [volume],
  });
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

export async function getChapterEntries(
  volume: number,
  chapter: number,
): Promise<VocabEntry[]> {
  const db = await ready();
  const result = await db.execute({
    sql: `
      SELECT e.id, v.number AS volume_number, c.number AS chapter_number,
             e.kanji, e.kana, e.english, e.page, e.notes, e.wk_level
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
             e.kanji, e.kana, e.english, e.page, e.notes, e.wk_level
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

export async function createEntry(input: NewEntryInput): Promise<VocabEntry> {
  const db = await ready();
  const chapterId = await findOrCreateChapter(input.volume, input.chapter);
  const result = await db.execute({
    sql: `
      INSERT INTO vocab_entries (chapter_id, kanji, kana, english, page, notes, wk_level)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      RETURNING id
    `,
    args: [
      chapterId,
      input.kanji,
      input.kana,
      input.english,
      input.page,
      input.notes,
      input.wkLevel,
    ],
  });
  const id = result.rows[0].id as number;
  return {
    id: Number(id),
    volume: input.volume,
    chapter: input.chapter,
    kanji: input.kanji,
    kana: input.kana,
    english: input.english,
    page: input.page,
    notes: input.notes,
    wkLevel: input.wkLevel,
  };
}

export async function updateEntry(
  id: number,
  input: UpdateEntryInput,
): Promise<VocabEntry | null> {
  const db = await ready();

  let chapterId: number | undefined;
  if (input.volume !== undefined && input.chapter !== undefined) {
    chapterId = await findOrCreateChapter(input.volume, input.chapter);
  }

  const fields: string[] = [];
  const args: (string | number | null)[] = [];
  if (chapterId !== undefined) {
    fields.push("chapter_id = ?");
    args.push(chapterId);
  }
  if (input.kanji !== undefined) {
    fields.push("kanji = ?");
    args.push(input.kanji);
  }
  if (input.kana !== undefined) {
    fields.push("kana = ?");
    args.push(input.kana);
  }
  if (input.english !== undefined) {
    fields.push("english = ?");
    args.push(input.english);
  }
  if (input.page !== undefined) {
    fields.push("page = ?");
    args.push(input.page);
  }
  if (input.notes !== undefined) {
    fields.push("notes = ?");
    args.push(input.notes);
  }
  if (input.wkLevel !== undefined) {
    fields.push("wk_level = ?");
    args.push(input.wkLevel);
  }

  if (fields.length === 0) {
    const existing = await db.execute({
      sql: `
        SELECT e.id, v.number AS volume_number, c.number AS chapter_number,
               e.kanji, e.kana, e.english, e.page, e.notes, e.wk_level
        FROM vocab_entries e
        JOIN chapters c ON c.id = e.chapter_id
        JOIN volumes v ON v.id = c.volume_id
        WHERE e.id = ?
      `,
      args: [id],
    });
    if (existing.rows.length === 0) return null;
    return mapRow(existing.rows[0] as Record<string, unknown>);
  }

  args.push(id);
  await db.execute({
    sql: `UPDATE vocab_entries SET ${fields.join(", ")} WHERE id = ?`,
    args,
  });

  const result = await db.execute({
    sql: `
      SELECT e.id, v.number AS volume_number, c.number AS chapter_number,
             e.kanji, e.kana, e.english, e.page, e.notes, e.wk_level
      FROM vocab_entries e
      JOIN chapters c ON c.id = e.chapter_id
      JOIN volumes v ON v.id = c.volume_id
      WHERE e.id = ?
    `,
    args: [id],
  });
  if (result.rows.length === 0) return null;
  return mapRow(result.rows[0] as Record<string, unknown>);
}

export async function deleteEntry(id: number): Promise<boolean> {
  const db = await ready();
  const transaction = await db.transaction("write");
  try {
    await transaction.execute({
      sql: `UPDATE vocab_source_entries
            SET local_entry_id = NULL, local_deleted = 1
            WHERE local_entry_id = ?`,
      args: [id],
    });
    const result = await transaction.execute({
      sql: `DELETE FROM vocab_entries WHERE id = ?`,
      args: [id],
    });
    await transaction.commit();
    return result.rowsAffected > 0;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}
