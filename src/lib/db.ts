import fs from "node:fs";
import path from "node:path";
import { createClient, type Client } from "@libsql/client";

declare global {
  var __hxhDb: Client | undefined;
  var __hxhSchemaReady: Promise<void> | undefined;
}

const LOCAL_FILE_PREFIX = "file:";

function createDb(): Client {
  const url = process.env.DATABASE_URL || "file:./data/vocab.db";
  const authToken = process.env.DATABASE_AUTH_TOKEN;

  // libsql does not create the parent directory of a local db file, so a
  // fresh checkout fails on first run unless we do it ourselves.
  if (url.startsWith(LOCAL_FILE_PREFIX)) {
    const filePath = url.slice(LOCAL_FILE_PREFIX.length);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
  }

  return createClient({ url, authToken });
}

const BASE_SCHEMA_STATEMENTS = [
  `PRAGMA foreign_keys = ON`,
  `CREATE TABLE IF NOT EXISTS volumes (
    id INTEGER PRIMARY KEY,
    number INTEGER NOT NULL UNIQUE
  )`,
  `CREATE TABLE IF NOT EXISTS chapters (
    id INTEGER PRIMARY KEY,
    volume_id INTEGER NOT NULL REFERENCES volumes(id) ON DELETE CASCADE,
    number INTEGER NOT NULL,
    UNIQUE(volume_id, number)
  )`,
  `CREATE TABLE IF NOT EXISTS vocab_entries (
    id INTEGER PRIMARY KEY,
    chapter_id INTEGER NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
    kanji TEXT,
    kana TEXT NOT NULL,
    english TEXT NOT NULL,
    page INTEGER NOT NULL,
    notes TEXT,
    wk_level TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_chapters_volume ON chapters(volume_id)`,
  `CREATE INDEX IF NOT EXISTS idx_entries_chapter_page ON vocab_entries(chapter_id, page)`,
  `CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL
  )`,
];

const PROVENANCE_MIGRATION_VERSION = 1;
const PROVENANCE_MIGRATION_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS vocab_source_entries (
    source_key TEXT PRIMARY KEY,
    local_entry_id INTEGER UNIQUE REFERENCES vocab_entries(id) ON DELETE SET NULL,
    volume INTEGER NOT NULL,
    chapter INTEGER NOT NULL,
    source_order INTEGER NOT NULL,
    source_file TEXT NOT NULL,
    source_hash TEXT NOT NULL,
    source_revision TEXT NOT NULL,
    source_present INTEGER NOT NULL DEFAULT 1,
    local_deleted INTEGER NOT NULL DEFAULT 0,
    base_kanji TEXT,
    base_kana TEXT NOT NULL,
    base_english TEXT NOT NULL,
    base_page INTEGER NOT NULL,
    base_notes TEXT,
    base_wk_level TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_vocab_source_local_entry
    ON vocab_source_entries(local_entry_id)`,
  `CREATE INDEX IF NOT EXISTS idx_vocab_source_chapter
    ON vocab_source_entries(volume, chapter)`,
  `CREATE TABLE IF NOT EXISTS vocab_source_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    source_revision TEXT NOT NULL,
    applied_at TEXT NOT NULL
  )`,
];

// The captain currently owns physical volumes 1-8, so these are seeded up
// front to keep the volume selector populated ahead of any data existing.
// Volumes beyond this are created on demand when an entry is first added.
const OWNED_VOLUMES = 8;

export async function ensureSchema(client: Client): Promise<void> {
  for (const statement of BASE_SCHEMA_STATEMENTS) {
    await client.execute(statement);
  }
  const migration = await client.execute({
    sql: `SELECT version FROM schema_migrations WHERE version = ?`,
    args: [PROVENANCE_MIGRATION_VERSION],
  });
  if (migration.rows.length === 0) {
    const now = new Date().toISOString();
    await client.batch(
      [
        ...PROVENANCE_MIGRATION_STATEMENTS,
        {
          sql: `INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)`,
          args: [PROVENANCE_MIGRATION_VERSION, now],
        },
      ],
      "write",
    );
  }
  for (let number = 1; number <= OWNED_VOLUMES; number++) {
    await client.execute({
      sql: `INSERT INTO volumes (number) VALUES (?) ON CONFLICT(number) DO NOTHING`,
      args: [number],
    });
  }
}

export function getDb(): Client {
  if (!global.__hxhDb) {
    global.__hxhDb = createDb();
  }
  return global.__hxhDb;
}

export async function ready(): Promise<Client> {
  const client = getDb();
  if (!global.__hxhSchemaReady) {
    global.__hxhSchemaReady = ensureSchema(client);
  }
  await global.__hxhSchemaReady;
  return client;
}
