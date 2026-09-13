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

const SCHEMA_STATEMENTS = [
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
];

// The captain currently owns physical volumes 1-8, so these are seeded up
// front to keep the volume selector populated ahead of any data existing.
// Volumes beyond this are created on demand when an entry is first added.
const OWNED_VOLUMES = 8;

async function ensureSchema(client: Client): Promise<void> {
  for (const statement of SCHEMA_STATEMENTS) {
    await client.execute(statement);
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
