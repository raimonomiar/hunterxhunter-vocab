import crypto from "node:crypto";
import type { Client, Transaction } from "@libsql/client";
import { ensureSchema } from "@/lib/db";
import {
  corpusRevision,
  semanticEntry,
  sourceEntryKey,
  type CorpusSource,
  type SourceEntry,
} from "@/lib/vocab-markdown";
import { findOrCreateChapterWithExecutor } from "@/lib/vocab";

type DbExecutor = Pick<Client | Transaction, "execute">;

/** Fields owned by the canonical Markdown corpus.
 *
 * The database still has nullable legacy WK columns, but they are deliberately
 * excluded here so source revisions cannot erase or conflict with that old
 * personal metadata.
 */
type EntryFields = {
  volume: number;
  chapter: number;
  kanji: string | null;
  kana: string;
  english: string;
  page: number;
  notes: string | null;
};

type LocalEntry = EntryFields & { id: number };

type ProvenanceRow = EntryFields & {
  sourceKey: string;
  localEntryId: number | null;
  sourceOrder: number;
  sourceFile: string;
  sourceHash: string;
  sourceRevision: string;
  sourcePresent: boolean;
  localDeleted: boolean;
};

export type SyncSourceRecord = {
  sourceKey: string;
  volume: number;
  chapter: number;
  sourceOrder: number;
  sourceFile: string;
  sourceLine: number;
  sourceHash: string;
  entry: SourceEntry;
};

export type SyncOperationKind =
  | "add"
  | "adopt"
  | "update"
  | "remove"
  | "preserve-local"
  | "preserve-deletion"
  | "advance-baseline"
  | "unchanged"
  | "personal-only"
  | "tombstone"
  | "conflict";

export type SyncOperation = {
  kind: SyncOperationKind;
  sourceKey?: string;
  sourceFile?: string;
  sourceLine?: number;
  message?: string;
  source?: SyncSourceRecord;
  provenance?: ProvenanceRow;
  local?: LocalEntry;
};

export type SyncSummary = {
  add: number;
  adopt: number;
  update: number;
  remove: number;
  preserveLocal: number;
  preserveDeletion: number;
  advanceBaseline: number;
  unchanged: number;
  personalOnly: number;
  tombstone: number;
  conflicts: number;
};

export type SyncPlan = {
  sourceRevision: string;
  databaseFingerprint: string;
  corpus: CorpusSource;
  sourceRecords: SyncSourceRecord[];
  operations: SyncOperation[];
  conflicts: SyncOperation[];
  summary: SyncSummary;
  priorSourceRevision: string | null;
};

export class SyncConflictError extends Error {
  constructor(public readonly conflicts: SyncOperation[]) {
    super(
      conflicts
        .map(
          (conflict) =>
            `${conflict.sourceFile ?? "<database>"}:${conflict.sourceLine ?? 1}: ${conflict.message ?? "source conflict"}`,
        )
        .join("\n"),
    );
    this.name = "SyncConflictError";
  }
}

export class StaleSyncPlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StaleSyncPlanError";
  }
}

function numberValue(value: unknown): number {
  return Number(value);
}

function stringOrNull(value: unknown): string | null {
  return (value as string | null) ?? null;
}

function mapLocalEntry(row: Record<string, unknown>): LocalEntry {
  return {
    id: numberValue(row.id),
    volume: numberValue(row.volume_number),
    chapter: numberValue(row.chapter_number),
    kanji: stringOrNull(row.kanji),
    kana: String(row.kana),
    english: String(row.english),
    page: numberValue(row.page),
    notes: stringOrNull(row.notes),
  };
}

function mapProvenance(row: Record<string, unknown>): ProvenanceRow {
  return {
    sourceKey: String(row.source_key),
    localEntryId: row.local_entry_id === null ? null : numberValue(row.local_entry_id),
    volume: numberValue(row.volume),
    chapter: numberValue(row.chapter),
    sourceOrder: numberValue(row.source_order),
    sourceFile: String(row.source_file),
    sourceHash: String(row.source_hash),
    sourceRevision: String(row.source_revision),
    sourcePresent: numberValue(row.source_present) !== 0,
    localDeleted: numberValue(row.local_deleted) !== 0,
    kanji: stringOrNull(row.base_kanji),
    kana: String(row.base_kana),
    english: String(row.base_english),
    page: numberValue(row.base_page),
    notes: stringOrNull(row.base_notes),
  };
}

async function readLocalEntries(db: DbExecutor): Promise<LocalEntry[]> {
  const result = await db.execute(`
    SELECT e.id, v.number AS volume_number, c.number AS chapter_number,
           e.kanji, e.kana, e.english, e.page, e.notes
    FROM vocab_entries e
    JOIN chapters c ON c.id = e.chapter_id
    JOIN volumes v ON v.id = c.volume_id
    ORDER BY e.id ASC
  `);
  return result.rows.map((row) => mapLocalEntry(row as Record<string, unknown>));
}

async function readProvenance(db: DbExecutor): Promise<ProvenanceRow[]> {
  const result = await db.execute(`
    SELECT source_key, local_entry_id, volume, chapter, source_order,
           source_file, source_hash, source_revision, source_present, local_deleted,
           base_kanji, base_kana, base_english, base_page, base_notes
    FROM vocab_source_entries
    ORDER BY source_key ASC
  `);
  return result.rows.map((row) => mapProvenance(row as Record<string, unknown>));
}

async function readSourceRevision(db: DbExecutor): Promise<string | null> {
  const result = await db.execute(`SELECT source_revision FROM vocab_source_state WHERE id = 1`);
  return result.rows.length === 0 ? null : String(result.rows[0].source_revision);
}

async function readDatabaseStructure(db: DbExecutor): Promise<Array<Record<string, unknown>>> {
  const result = await db.execute(`
    SELECT v.number AS volume, c.number AS chapter, COUNT(e.id) AS entries
    FROM volumes v
    LEFT JOIN chapters c ON c.volume_id = v.id
    LEFT JOIN vocab_entries e ON e.chapter_id = c.id
    GROUP BY v.number, c.number
    ORDER BY v.number ASC, c.number ASC
  `);
  return result.rows.map((row) => ({
    volume: row.volume === null ? null : numberValue(row.volume),
    chapter: row.chapter === null ? null : numberValue(row.chapter),
    entries: numberValue(row.entries),
  }));
}

async function databaseSnapshot(db: DbExecutor): Promise<{
  fingerprint: string;
  localEntries: LocalEntry[];
  provenance: ProvenanceRow[];
  sourceRevision: string | null;
}> {
  const [localEntries, provenance, sourceRevision, structure] = await Promise.all([
    readLocalEntries(db),
    readProvenance(db),
    readSourceRevision(db),
    readDatabaseStructure(db),
  ]);
  const fingerprint = crypto
    .createHash("sha256")
    .update(JSON.stringify({ localEntries, provenance, sourceRevision, structure }))
    .digest("hex");
  return { fingerprint, localEntries, provenance, sourceRevision };
}

function sourceContentHash(volume: number, chapter: number, entry: SourceEntry): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify({ volume, chapter, entry: semanticEntry(entry) }))
    .digest("hex");
}

function sourceRecords(corpus: CorpusSource): SyncSourceRecord[] {
  const records: SyncSourceRecord[] = [];
  for (const chapter of [...corpus.chapters].sort(
    (a, b) => a.volume - b.volume || a.chapter - b.chapter,
  )) {
    chapter.entries.forEach((entry, index) => {
      records.push({
        sourceKey: sourceEntryKey(chapter.volume, chapter.chapter, entry.id),
        volume: chapter.volume,
        chapter: chapter.chapter,
        sourceOrder: index,
        sourceFile:
          entry.file ??
          chapter.file ??
          `data/vocab-seed/vol${chapter.volume}-ch${String(chapter.chapter).padStart(2, "0")}.md`,
        sourceLine: entry.line ?? 1,
        sourceHash: sourceContentHash(chapter.volume, chapter.chapter, entry),
        entry,
      });
    });
  }
  return records;
}

function sameFields(a: EntryFields, b: EntryFields): boolean {
  return (
    a.volume === b.volume &&
    a.chapter === b.chapter &&
    a.kanji === b.kanji &&
    a.kana === b.kana &&
    a.english === b.english &&
    a.page === b.page &&
    a.notes === b.notes
  );
}

function sourceFields(record: SyncSourceRecord): EntryFields {
  return {
    volume: record.volume,
    chapter: record.chapter,
    kanji: record.entry.kanji,
    kana: record.entry.kana,
    english: record.entry.english,
    page: record.entry.page,
    notes: record.entry.notes,
  };
}

function provenanceFields(row: ProvenanceRow): EntryFields {
  return {
    volume: row.volume,
    chapter: row.chapter,
    kanji: row.kanji,
    kana: row.kana,
    english: row.english,
    page: row.page,
    notes: row.notes,
  };
}

function chapterKey(volume: number, chapter: number): string {
  return `${volume}-${chapter}`;
}

function operation(
  kind: SyncOperationKind,
  source?: SyncSourceRecord,
  extras: Partial<SyncOperation> = {},
): SyncOperation {
  return {
    kind,
    sourceKey: source?.sourceKey ?? extras.sourceKey,
    sourceFile: source?.sourceFile ?? extras.sourceFile,
    sourceLine: source?.sourceLine ?? extras.sourceLine,
    source,
    ...extras,
  };
}

function conflict(
  source: SyncSourceRecord | undefined,
  message: string,
  extras: Partial<SyncOperation> = {},
): SyncOperation {
  return operation("conflict", source, { ...extras, message });
}

function emptySummary(): SyncSummary {
  return {
    add: 0,
    adopt: 0,
    update: 0,
    remove: 0,
    preserveLocal: 0,
    preserveDeletion: 0,
    advanceBaseline: 0,
    unchanged: 0,
    personalOnly: 0,
    tombstone: 0,
    conflicts: 0,
  };
}

function summarize(operations: SyncOperation[]): SyncSummary {
  const summary = emptySummary();
  for (const item of operations) {
    switch (item.kind) {
      case "preserve-local":
        summary.preserveLocal++;
        break;
      case "preserve-deletion":
        summary.preserveDeletion++;
        break;
      case "conflict":
        summary.conflicts++;
        break;
      case "personal-only":
        summary.personalOnly++;
        break;
      case "advance-baseline":
        summary.advanceBaseline++;
        break;
      default:
        summary[item.kind as "add" | "adopt" | "update" | "remove" | "unchanged" | "tombstone"]++;
    }
  }
  return summary;
}

/** Refreshes an entry's on-page display position to match its current place
 * in the source chapter file. Never touches content fields, so a pure
 * reorder of a chapter file never looks like a content edit or conflict.
 */
async function updateEntryPosition(
  tx: Transaction,
  localEntryId: number,
  position: number,
): Promise<void> {
  await tx.execute({
    sql: `UPDATE vocab_entries SET source_position = ? WHERE id = ?`,
    args: [position, localEntryId],
  });
}

function formatLocal(local: LocalEntry): string {
  return `database entry ${local.id} (V${local.volume} Ch${local.chapter}, page ${local.page})`;
}

export async function planVocabSync(db: Client, corpus: CorpusSource): Promise<SyncPlan> {
  await ensureSchema(db);
  const snapshot = await databaseSnapshot(db);
  const records = sourceRecords(corpus);
  const recordsByKey = new Map(records.map((record) => [record.sourceKey, record]));
  const localById = new Map(snapshot.localEntries.map((entry) => [entry.id, entry]));
  const provenanceByKey = new Map(snapshot.provenance.map((row) => [row.sourceKey, row]));
  const localByChapter = new Map<string, LocalEntry[]>();
  for (const local of snapshot.localEntries) {
    const key = chapterKey(local.volume, local.chapter);
    const rows = localByChapter.get(key) ?? [];
    rows.push(local);
    localByChapter.set(key, rows);
  }
  const matchedLocalIds = new Set<number>();
  const operations: SyncOperation[] = [];
  const priorSource = snapshot.sourceRevision !== null || snapshot.provenance.length > 0;

  for (const source of records) {
    const row = provenanceByKey.get(source.sourceKey);
    if (row) {
      if (row.localEntryId !== null) matchedLocalIds.add(row.localEntryId);
      const local = row.localEntryId === null ? undefined : localById.get(row.localEntryId);
      const sourceMatchesBaseline = sameFields(sourceFields(source), provenanceFields(row));

      if (!row.sourcePresent && row.localEntryId === null && !row.localDeleted) {
        operations.push(operation("add", source, { provenance: row }));
        continue;
      }

      if (row.localDeleted) {
        if (sourceMatchesBaseline) {
          operations.push(operation("preserve-deletion", source, { provenance: row }));
        } else {
          operations.push(
            conflict(
              source,
              `${source.sourceKey} was personally deleted, but the shared source also changed; restore or resolve the entry explicitly`,
              { provenance: row },
            ),
          );
        }
        continue;
      }

      if (!local) {
        operations.push(
          conflict(
            source,
            `${source.sourceKey} has provenance but its local row is missing; refusing to duplicate it`,
            { provenance: row },
          ),
        );
        continue;
      }

      const localMatchesBaseline = sameFields(local, provenanceFields(row));
      const localMatchesSource = sameFields(local, sourceFields(source));
      if (localMatchesSource) {
        operations.push(
          operation(sourceMatchesBaseline ? "unchanged" : "advance-baseline", source, {
            provenance: row,
            local,
          }),
        );
      } else if (sourceMatchesBaseline) {
        operations.push(operation("preserve-local", source, { provenance: row, local }));
      } else if (localMatchesBaseline) {
        operations.push(operation("update", source, { provenance: row, local }));
      } else {
        operations.push(
          conflict(
            source,
            `${formatLocal(local)} and ${source.sourceKey} both changed since the last source revision`,
            { provenance: row, local },
          ),
        );
      }
      continue;
    }

    const chapterLocals = localByChapter.get(chapterKey(source.volume, source.chapter)) ?? [];
    const candidates = chapterLocals.filter((local) => sameFields(local, sourceFields(source)));
    if (candidates.length === 1) {
      matchedLocalIds.add(candidates[0].id);
      operations.push(operation("adopt", source, { local: candidates[0] }));
    } else if (candidates.length > 1) {
      operations.push(
        conflict(
          source,
          `${source.sourceKey} matches multiple local rows; an explicit mapping is required before adoption`,
          { local: candidates[0] },
        ),
      );
    } else if (!priorSource && chapterLocals.length > 0) {
      operations.push(
        conflict(
          source,
          `${source.sourceKey} has no exact local match in a pre-migration chapter; refusing to guess whether an existing row was edited`,
        ),
      );
    } else {
      operations.push(operation("add", source));
    }
  }

  for (const row of snapshot.provenance) {
    if (recordsByKey.has(row.sourceKey)) continue;
    if (!row.sourcePresent) continue;
    const local = row.localEntryId === null ? undefined : localById.get(row.localEntryId);
    if (row.localEntryId !== null) matchedLocalIds.add(row.localEntryId);
    if (row.localDeleted) {
      operations.push(operation("tombstone", undefined, { provenance: row }));
    } else if (!local) {
      operations.push(operation("tombstone", undefined, { provenance: row }));
    } else if (sameFields(local, provenanceFields(row))) {
      operations.push(operation("remove", undefined, { provenance: row, local }));
    } else {
      operations.push(
        conflict(
          undefined,
          `${formatLocal(local)} maps to removed source ${row.sourceKey}; refusing to delete a personal edit`,
          {
            sourceKey: row.sourceKey,
            sourceFile: row.sourceFile,
            provenance: row,
            local,
          },
        ),
      );
    }
  }

  const sourceChapters = new Set(
    records.map((record) => chapterKey(record.volume, record.chapter)),
  );
  const unmatchedLocal = snapshot.localEntries.filter((local) => !matchedLocalIds.has(local.id));
  if (!priorSource) {
    for (const local of unmatchedLocal) {
      if (!sourceChapters.has(chapterKey(local.volume, local.chapter))) {
        operations.push(
          conflict(
            undefined,
            `${formatLocal(local)} belongs to an unmapped chapter; review the adoption mapping before synchronization`,
            { local },
          ),
        );
      } else {
        operations.push(
          conflict(
            undefined,
            `${formatLocal(local)} is an unexplained extra row in a pre-migration chapter; review the adoption mapping before synchronization`,
            { local },
          ),
        );
      }
    }
  } else {
    for (const local of unmatchedLocal) {
      operations.push(operation("personal-only", undefined, { local }));
    }
  }

  const conflicts = operations.filter((item) => item.kind === "conflict");
  return {
    sourceRevision: corpusRevision(corpus.chapters),
    databaseFingerprint: snapshot.fingerprint,
    corpus,
    sourceRecords: records,
    operations,
    conflicts,
    summary: summarize(operations),
    priorSourceRevision: snapshot.sourceRevision,
  };
}

async function writeProvenance(
  tx: Transaction,
  source: SyncSourceRecord,
  sourceRevision: string,
  localEntryId: number | null,
  localDeleted = false,
): Promise<void> {
  const args = [
    localEntryId,
    source.volume,
    source.chapter,
    source.sourceOrder,
    source.sourceFile,
    source.sourceHash,
    sourceRevision,
    1,
    localDeleted ? 1 : 0,
    source.entry.kanji,
    source.entry.kana,
    source.entry.english,
    source.entry.page,
    source.entry.notes,
    source.sourceKey,
  ] as (string | number | null)[];
  await tx.execute({
    sql: `UPDATE vocab_source_entries SET
            local_entry_id = ?, volume = ?, chapter = ?, source_order = ?,
            source_file = ?, source_hash = ?, source_revision = ?,
            source_present = ?, local_deleted = ?,
            base_kanji = ?, base_kana = ?, base_english = ?, base_page = ?,
            base_notes = ?
          WHERE source_key = ?`,
    args,
  });
}

async function insertProvenance(
  tx: Transaction,
  source: SyncSourceRecord,
  sourceRevision: string,
  localEntryId: number | null,
  localDeleted = false,
): Promise<void> {
  await tx.execute({
    sql: `INSERT INTO vocab_source_entries (
            source_key, local_entry_id, volume, chapter, source_order, source_file,
            source_hash, source_revision, source_present, local_deleted, base_kanji, base_kana,
            base_english, base_page, base_notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      source.sourceKey,
      localEntryId,
      source.volume,
      source.chapter,
      source.sourceOrder,
      source.sourceFile,
      source.sourceHash,
      sourceRevision,
      1,
      localDeleted ? 1 : 0,
      source.entry.kanji,
      source.entry.kana,
      source.entry.english,
      source.entry.page,
      source.entry.notes,
    ],
  });
}

export async function applyVocabSync(
  db: Client,
  plan: SyncPlan,
  currentCorpus: CorpusSource = plan.corpus,
): Promise<SyncSummary> {
  if (plan.conflicts.length > 0) throw new SyncConflictError(plan.conflicts);
  const currentRevision = corpusRevision(currentCorpus.chapters);
  if (currentRevision !== plan.sourceRevision) {
    throw new StaleSyncPlanError(
      `source changed after planning: expected ${plan.sourceRevision}, found ${currentRevision}`,
    );
  }

  await ensureSchema(db);
  const currentSnapshot = await databaseSnapshot(db);
  if (currentSnapshot.fingerprint !== plan.databaseFingerprint) {
    throw new StaleSyncPlanError(
      "database changed after planning; run a new dry run before applying",
    );
  }

  const tx = await db.transaction("write");
  try {
    for (const item of plan.operations) {
      const source = item.source;
      if (item.kind === "add") {
        if (!source) throw new Error("Add operation is missing its source record");
        const chapterId = await findOrCreateChapterWithExecutor(tx, source.volume, source.chapter);
        const inserted = await tx.execute({
          sql: `INSERT INTO vocab_entries
                  (chapter_id, kanji, kana, english, page, notes, source_position)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                RETURNING id`,
          args: [
            chapterId,
            source.entry.kanji,
            source.entry.kana,
            source.entry.english,
            source.entry.page,
            source.entry.notes,
            source.sourceOrder,
          ],
        });
        const insertedId = numberValue(inserted.rows[0].id);
        if (item.provenance) {
          await writeProvenance(tx, source, plan.sourceRevision, insertedId);
        } else {
          await insertProvenance(tx, source, plan.sourceRevision, insertedId);
        }
      } else if (item.kind === "adopt") {
        if (!source || !item.local) throw new Error("Adoption operation is incomplete");
        await insertProvenance(tx, source, plan.sourceRevision, item.local.id);
        await updateEntryPosition(tx, item.local.id, source.sourceOrder);
      } else if (item.kind === "update") {
        if (!source || !item.local) throw new Error("Update operation is incomplete");
        await tx.execute({
          sql: `UPDATE vocab_entries
                SET kanji = ?, kana = ?, english = ?, page = ?, notes = ?, source_position = ?
                WHERE id = ?`,
          args: [
            source.entry.kanji,
            source.entry.kana,
            source.entry.english,
            source.entry.page,
            source.entry.notes,
            source.sourceOrder,
            item.local.id,
          ],
        });
        await writeProvenance(tx, source, plan.sourceRevision, item.local.id);
      } else if (item.kind === "remove") {
        const row = item.provenance;
        if (!row) throw new Error("Removal operation is missing provenance");
        await tx.execute({
          sql: `DELETE FROM vocab_entries WHERE id = ?`,
          args: [item.local?.id ?? row.localEntryId],
        });
        await tx.execute({
          sql: `UPDATE vocab_source_entries
                SET local_entry_id = NULL, source_revision = ?,
                    source_present = 0, local_deleted = 0
                WHERE source_key = ?`,
          args: [plan.sourceRevision, row.sourceKey],
        });
      } else if (item.kind === "tombstone") {
        const row = item.provenance;
        if (!row) throw new Error("Tombstone operation is missing provenance");
        await tx.execute({
          sql: `UPDATE vocab_source_entries
                SET local_entry_id = NULL, source_revision = ?, source_present = 0
                WHERE source_key = ?`,
          args: [plan.sourceRevision, row.sourceKey],
        });
      } else if (
        item.kind === "preserve-local" ||
        item.kind === "preserve-deletion" ||
        item.kind === "advance-baseline" ||
        item.kind === "unchanged"
      ) {
        if (!source) throw new Error(`${item.kind} operation is missing its source record`);
        const localId = item.provenance?.localEntryId ?? item.local?.id ?? null;
        await writeProvenance(
          tx,
          source,
          plan.sourceRevision,
          localId,
          item.kind === "preserve-deletion",
        );
        if (localId !== null && item.kind !== "preserve-deletion") {
          await updateEntryPosition(tx, localId, source.sourceOrder);
        }
      }
    }
    await tx.execute({
      sql: `INSERT INTO vocab_source_state (id, source_revision, applied_at)
            VALUES (1, ?, ?)
            ON CONFLICT(id) DO UPDATE SET source_revision = excluded.source_revision,
                                          applied_at = excluded.applied_at`,
      args: [plan.sourceRevision, new Date().toISOString()],
    });
    await tx.commit();
  } catch (error) {
    await tx.rollback();
    throw error;
  }
  return plan.summary;
}

export function formatSyncSummary(summary: SyncSummary): string {
  return [
    `add=${summary.add}`,
    `adopt=${summary.adopt}`,
    `update=${summary.update}`,
    `remove=${summary.remove}`,
    `preserve-local=${summary.preserveLocal}`,
    `preserve-deletion=${summary.preserveDeletion}`,
    `advance-baseline=${summary.advanceBaseline}`,
    `unchanged=${summary.unchanged}`,
    `personal-only=${summary.personalOnly}`,
    `tombstone=${summary.tombstone}`,
    `conflicts=${summary.conflicts}`,
  ].join(" ");
}

export function formatSyncPlan(plan: SyncPlan): string {
  const lines = [
    `Source revision: ${plan.sourceRevision}`,
    `Database fingerprint: ${plan.databaseFingerprint}`,
    `Summary: ${formatSyncSummary(plan.summary)}`,
  ];
  for (const item of plan.operations) {
    if (item.kind === "unchanged" || item.kind === "personal-only") continue;
    const location = item.sourceFile
      ? `${item.sourceFile}:${item.sourceLine ?? 1}`
      : (item.sourceKey ?? "<database>");
    lines.push(`- ${item.kind}: ${location}${item.message ? ` — ${item.message}` : ""}`);
  }
  return lines.join("\n");
}
