import assert from "node:assert/strict";
import { createClient, type Client } from "@libsql/client";
import test from "node:test";
import { ensureSchema } from "../src/lib/db";
import { getChapterEntriesWithExecutor } from "../src/lib/vocab";
import { applyVocabSync, planVocabSync } from "../src/lib/vocab-sync";
import {
  corpusRevision,
  type ChapterSource,
  type CorpusSource,
  type SourceEntry,
} from "../src/lib/vocab-markdown";

function entry(id: string, page: number, english: string): SourceEntry {
  return {
    id,
    page,
    kanji: "語",
    kana: "ご",
    english,
    notes: null,
    file: "data/vocab-seed/vol1-ch01.md",
    line: 1,
  };
}

function corpus(entries: SourceEntry[]): CorpusSource {
  const chapter: ChapterSource = {
    volume: 1,
    chapter: 1,
    title: "Volume 1 · Chapter 1",
    file: "data/vocab-seed/vol1-ch01.md",
    entries,
  };
  return { chapters: [chapter], revision: corpusRevision([chapter]) };
}

async function isolatedDb(): Promise<Client> {
  const db = createClient({ url: "file::memory:" });
  await ensureSchema(db);
  return db;
}

async function syncClean(db: Client, source: CorpusSource): Promise<void> {
  const plan = await planVocabSync(db, source);
  assert.equal(plan.conflicts.length, 0);
  await applyVocabSync(db, plan, source);
}

test("chapter entries render in on-page reading order, grouped by page", async () => {
  const db = await isolatedDb();
  // The source file lists page-1 and page-2 entries interleaved (as later
  // recording passes append entries out of page order); the app must still
  // group by page and follow each page's own reading order.
  const source = corpus([
    entry("e0001", 1, "a"),
    entry("e0002", 2, "x"),
    entry("e0003", 1, "b"),
    entry("e0004", 1, "c"),
    entry("e0005", 2, "y"),
  ]);
  await syncClean(db, source);

  const entries = await getChapterEntriesWithExecutor(db, 1, 1);
  assert.deepEqual(
    entries.map((e) => e.english),
    ["a", "b", "c", "x", "y"],
  );
});

test("a personal-only entry is placed after source entries on its page", async () => {
  const db = await isolatedDb();
  const source = corpus([entry("e0001", 1, "a"), entry("e0002", 1, "b")]);
  await syncClean(db, source);

  const chapter = (
    await db.execute({
      sql: "SELECT id FROM chapters WHERE volume_id = (SELECT id FROM volumes WHERE number = 1) AND number = 1",
    })
  ).rows[0].id;
  await db.execute({
    sql: `INSERT INTO vocab_entries (chapter_id, kanji, kana, english, page, notes)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [chapter, "私", "わたし", "personal", 1, null],
  });

  const entries = await getChapterEntriesWithExecutor(db, 1, 1);
  assert.deepEqual(
    entries.map((e) => e.english),
    ["a", "b", "personal"],
  );
});

test("a pure reorder of the chapter file is a position change, not a content update or conflict", async () => {
  const db = await isolatedDb();
  const original = corpus([entry("e0001", 1, "a"), entry("e0002", 1, "b"), entry("e0003", 1, "c")]);
  await syncClean(db, original);
  const before = await getChapterEntriesWithExecutor(db, 1, 1);
  const idByEnglish = new Map(before.map((e) => [e.english, e.id]));

  const reordered = corpus([
    entry("e0003", 1, "c"),
    entry("e0001", 1, "a"),
    entry("e0002", 1, "b"),
  ]);
  const plan = await planVocabSync(db, reordered);
  assert.equal(plan.conflicts.length, 0);
  assert.equal(plan.summary.update, 0);
  assert.equal(plan.summary.unchanged, 3);
  await applyVocabSync(db, plan, reordered);

  const after = await getChapterEntriesWithExecutor(db, 1, 1);
  assert.deepEqual(
    after.map((e) => e.english),
    ["c", "a", "b"],
  );
  // IDs are unchanged — only display position moved.
  for (const e of after) {
    assert.equal(e.id, idByEnglish.get(e.english));
  }

  // Repeating the same reordered sync is still a no-op.
  const repeat = await planVocabSync(db, reordered);
  assert.equal(repeat.conflicts.length, 0);
  assert.equal(repeat.summary.update, 0);
  assert.equal(repeat.summary.add, 0);
  assert.equal(repeat.summary.unchanged, 3);
});
