/**
 * Loads committed vocab seed files into the database.
 *
 * Usage:
 *   npm run seed-vocab
 *
 * Reads every data/vocab-seed/vol<V>-ch<C>.json file (each an array of
 * { kanji, kana, english, page, notes } objects, matching NewEntryInput in
 * src/lib/vocab.ts) and inserts its entries via the same findOrCreateChapter
 * path scripts/import-vocab.ts uses. Chapter-idempotent exactly like that
 * script: a chapter that already has rows is left untouched, so re-running
 * after pulling new seed files only loads the chapters that are new.
 *
 * This is how future chapter/volume vocab work ships: as a committed JSON
 * file under data/vocab-seed/, loaded with this one command, rather than
 * retyped into the running app by hand.
 */
import fs from "node:fs";
import path from "node:path";
import { ready } from "../src/lib/db";
import { findOrCreateChapter } from "../src/lib/vocab";

const SEED_DIR = path.join(process.cwd(), "data", "vocab-seed");
const FILENAME_PATTERN = /^vol(\d+)-ch(\d+)\.json$/;

type SeedEntry = {
  kanji: string | null;
  kana: string;
  english: string;
  page: number;
  notes: string | null;
};

function isSeedEntry(value: unknown): value is SeedEntry {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    (v.kanji === null || typeof v.kanji === "string") &&
    typeof v.kana === "string" &&
    typeof v.english === "string" &&
    typeof v.page === "number" &&
    (v.notes === null || typeof v.notes === "string")
  );
}

async function main() {
  const db = await ready();

  if (!fs.existsSync(SEED_DIR)) {
    console.log(`No seed directory at ${SEED_DIR}; nothing to load.`);
    return;
  }

  const files = fs
    .readdirSync(SEED_DIR)
    .filter((f) => FILENAME_PATTERN.test(f))
    .sort();

  let totalInserted = 0;

  for (const file of files) {
    const match = file.match(FILENAME_PATTERN)!;
    const volume = Number(match[1]);
    const chapter = Number(match[2]);

    const raw = JSON.parse(
      fs.readFileSync(path.join(SEED_DIR, file), "utf-8"),
    );
    if (!Array.isArray(raw) || !raw.every(isSeedEntry)) {
      console.warn(
        `Skipping ${file}: does not match the expected seed entry shape.`,
      );
      continue;
    }
    const entries = raw as SeedEntry[];

    const chapterId = await findOrCreateChapter(volume, chapter);

    const existingCount = await db.execute({
      sql: `SELECT COUNT(*) as c FROM vocab_entries WHERE chapter_id = ?`,
      args: [chapterId],
    });
    if (Number(existingCount.rows[0].c) > 0) {
      console.log(
        `Volume ${volume} Chapter ${chapter}: already has entries, skipping ${file}.`,
      );
      continue;
    }

    for (const entry of entries) {
      await db.execute({
        sql: `INSERT INTO vocab_entries (chapter_id, kanji, kana, english, page, notes, wk_level)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [
          chapterId,
          entry.kanji,
          entry.kana,
          entry.english,
          entry.page,
          entry.notes,
          null,
        ],
      });
    }
    console.log(
      `Volume ${volume} Chapter ${chapter}: loaded ${entries.length} entries from ${file}.`,
    );
    totalInserted += entries.length;
  }

  console.log(
    `\nDone. Loaded ${totalInserted} entries across ${files.length} seed file(s).`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
