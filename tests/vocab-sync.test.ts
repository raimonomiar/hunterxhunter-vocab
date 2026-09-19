import assert from "node:assert/strict";
import { createClient, type Client } from "@libsql/client";
import test from "node:test";
import { ensureSchema } from "../src/lib/db";
import {
  applyVocabSync,
  planVocabSync,
  type SyncPlan,
} from "../src/lib/vocab-sync";
import {
  corpusRevision,
  sourceEntryKey,
  type ChapterSource,
  type CorpusSource,
  type SourceEntry,
} from "../src/lib/vocab-markdown";

function entry(
  id: string,
  page: number,
  english: string,
  notes: string | null = null,
): SourceEntry {
  return {
    id,
    page,
    kanji: "語",
    kana: "ご",
    english,
    notes,
    wkLevel: null,
    file: "data/vocab-seed/vol1-ch01.md",
    line: page + 1,
  };
}

function corpus(entries: SourceEntry[] = [entry("e0001", 1, "word"), entry("e0002", 2, "second")]): CorpusSource {
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

async function applyClean(db: Client, source = corpus()): Promise<SyncPlan> {
  const plan = await planVocabSync(db, source);
  assert.equal(plan.conflicts.length, 0);
  await applyVocabSync(db, plan, source);
  return plan;
}

async function entryRows(db: Client): Promise<Array<Record<string, unknown>>> {
  return (await db.execute(`
    SELECT e.id, v.number volume, c.number chapter, e.kanji, e.kana,
           e.english, e.page, e.notes, e.wk_level
    FROM vocab_entries e
    JOIN chapters c ON c.id = e.chapter_id
    JOIN volumes v ON v.id = c.volume_id
    ORDER BY e.id
  `)).rows as Array<Record<string, unknown>>;
}

test("fresh adoption adds entries, and a repeated plan is a no-op", async () => {
  const db = await isolatedDb();
  const source = corpus();
  const first = await planVocabSync(db, source);
  assert.equal(first.summary.add, 2);
  await applyVocabSync(db, first, source);
  const repeat = await planVocabSync(db, source);
  assert.equal(repeat.conflicts.length, 0);
  assert.equal(repeat.summary.add, 0);
  assert.equal(repeat.summary.update, 0);
  assert.equal(repeat.summary.unchanged, 2);
  assert.equal((await entryRows(db)).length, 2);
});

test("accepted shared correction updates an unchanged local row", async () => {
  const db = await isolatedDb();
  await applyClean(db);
  const changed = corpus([
    entry("e0001", 1, "corrected gloss"),
    entry("e0002", 2, "second"),
  ]);
  const plan = await planVocabSync(db, changed);
  assert.equal(plan.summary.update, 1);
  assert.equal(plan.conflicts.length, 0);
  await applyVocabSync(db, plan, changed);
  const rows = await entryRows(db);
  assert.equal(rows[0].english, "corrected gloss");
});

test("personal edit is preserved when source is unchanged and conflicts when both change", async () => {
  const db = await isolatedDb();
  await applyClean(db);
  await db.execute({
    sql: "UPDATE vocab_entries SET english = ? WHERE id = 1",
    args: ["my personal gloss"],
  });
  const unchangedSource = corpus();
  const preserved = await planVocabSync(db, unchangedSource);
  assert.equal(preserved.summary.preserveLocal, 1);
  assert.equal(preserved.conflicts.length, 0);
  await applyVocabSync(db, preserved, unchangedSource);
  assert.equal((await entryRows(db))[0].english, "my personal gloss");

  const changedSource = corpus([
    entry("e0001", 1, "maintainer correction"),
    entry("e0002", 2, "second"),
  ]);
  const conflictPlan = await planVocabSync(db, changedSource);
  assert.equal(conflictPlan.conflicts.length, 1);
  assert.match(conflictPlan.conflicts[0].message ?? "", /both changed/);
  await assert.rejects(() => applyVocabSync(db, conflictPlan, changedSource));
});

test("personal deletion becomes a tombstone and is protected from a changed source", async () => {
  const db = await isolatedDb();
  await applyClean(db);
  const sourceKey = sourceEntryKey(1, 1, "e0001");
  const tx = await db.transaction("write");
  await tx.execute({
    sql: "UPDATE vocab_source_entries SET local_entry_id = NULL, local_deleted = 1 WHERE source_key = ?",
    args: [sourceKey],
  });
  await tx.execute({ sql: "DELETE FROM vocab_entries WHERE id = 1" });
  await tx.commit();

  const same = await planVocabSync(db, corpus());
  assert.equal(same.summary.preserveDeletion, 1);
  assert.equal(same.conflicts.length, 0);
  await applyVocabSync(db, same, corpus());
  assert.equal((await entryRows(db)).length, 1);

  const changed = corpus([
    entry("e0001", 1, "new shared meaning"),
    entry("e0002", 2, "second"),
  ]);
  const conflictPlan = await planVocabSync(db, changed);
  assert.equal(conflictPlan.conflicts.length, 1);
  assert.match(conflictPlan.conflicts[0].message ?? "", /personally deleted/);
});

test("upstream deletion is explicit and repeat synchronization does not delete again", async () => {
  const db = await isolatedDb();
  await applyClean(db);
  const remaining = corpus([entry("e0002", 2, "second")]);
  const plan = await planVocabSync(db, remaining);
  assert.equal(plan.summary.remove, 1);
  assert.equal(plan.conflicts.length, 0);
  await applyVocabSync(db, plan, remaining);
  assert.equal((await entryRows(db)).length, 1);
  const repeat = await planVocabSync(db, remaining);
  assert.equal(repeat.summary.remove, 0);
  assert.equal(repeat.conflicts.length, 0);
});

test("personal-only rows survive shared updates", async () => {
  const db = await isolatedDb();
  await applyClean(db);
  const chapter = (await db.execute({
    sql: "SELECT id FROM chapters WHERE volume_id = (SELECT id FROM volumes WHERE number = 1) AND number = 1",
  })).rows[0].id;
  await db.execute({
    sql: `INSERT INTO vocab_entries (chapter_id, kanji, kana, english, page, notes, wk_level)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [chapter, "私", "わたし", "personal", 99, null, null],
  });
  const changed = corpus([
    entry("e0001", 1, "corrected"),
    entry("e0002", 2, "second"),
  ]);
  const plan = await planVocabSync(db, changed);
  assert.equal(plan.summary.update, 1);
  assert.equal(plan.summary.personalOnly, 1);
  await applyVocabSync(db, plan, changed);
  const rows = await entryRows(db);
  assert.equal(rows.length, 3);
  assert.ok(rows.some((row) => row.english === "personal"));
});

test("pre-migration adoption refuses ambiguous exact matches", async () => {
  const db = await isolatedDb();
  await db.execute({
    sql: `INSERT INTO chapters (volume_id, number)
          VALUES ((SELECT id FROM volumes WHERE number = 1), 1)`,
  });
  const chapter = (await db.execute({
    sql: "SELECT id FROM chapters WHERE volume_id = (SELECT id FROM volumes WHERE number = 1) AND number = 1",
  })).rows[0].id;
  for (let index = 0; index < 2; index++) {
    await db.execute({
      sql: `INSERT INTO vocab_entries (chapter_id, kanji, kana, english, page, notes, wk_level)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [chapter, "語", "ご", "word", 1, null, null],
    });
  }
  const plan = await planVocabSync(db, corpus([entry("e0001", 1, "word")]));
  assert.ok(plan.conflicts.length > 0);
  assert.match(plan.conflicts[0].message ?? "", /multiple local rows/);
});

test("apply rolls back all writes when a later operation fails", async () => {
  const db = await isolatedDb();
  const source = corpus();
  const plan = await planVocabSync(db, source);
  const broken = {
    ...plan,
    operations: [...plan.operations, { kind: "add" as const }],
  } as SyncPlan;
  await assert.rejects(() => applyVocabSync(db, broken, source));
  assert.equal((await entryRows(db)).length, 0);
  assert.equal((await db.execute("SELECT COUNT(*) c FROM vocab_source_entries")).rows[0].c, 0);
  assert.equal((await db.execute("SELECT COUNT(*) c FROM vocab_source_state")).rows[0].c, 0);
});

test("apply refuses a plan after its source or database changed", async () => {
  const db = await isolatedDb();
  const source = corpus();
  const plan = await planVocabSync(db, source);
  const changedSource = corpus([entry("e0001", 1, "changed"), entry("e0002", 2, "second")]);
  await assert.rejects(
    () => applyVocabSync(db, plan, changedSource),
    /source changed after planning/,
  );

  await db.execute({
    sql: `INSERT INTO chapters (volume_id, number)
          VALUES ((SELECT id FROM volumes WHERE number = 1), 2)`,
  });
  await assert.rejects(() => applyVocabSync(db, plan, source), /database changed after planning/);
});
