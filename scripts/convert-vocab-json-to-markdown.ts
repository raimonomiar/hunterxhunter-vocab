/**
 * One-time mechanical conversion of the legacy chapter JSON into the
 * canonical Markdown source. It intentionally preserves array order and all
 * Markdown source fields; stable IDs are allocated once from that original
 * order. Legacy WK metadata is validated for a readable error but is
 * intentionally not carried forward.
 *
 * Usage:
 *   npm run convert-vocab-json -- [json-dir] [markdown-dir]
 */
import fs from "node:fs";
import path from "node:path";
import {
  SEED_FILENAME_PATTERN,
  writeChapterMarkdown,
  type ChapterSource,
  type SourceEntry,
} from "../src/lib/vocab-markdown";

const inputDir = process.argv[2] ?? path.join(process.cwd(), "data", "vocab-seed");
const outputDir = process.argv[3] ?? inputDir;
const JSON_FILENAME_PATTERN = /^vol(\d+)-ch(\d+)\.json$/;

type LegacyEntry = {
  kanji: string | null;
  kana: string;
  english: string;
  page: number;
  notes: string | null;
  /** Accepted only while reading legacy JSON; never emitted to Markdown. */
  wkLevel?: string | null;
};

function readEntries(file: string): LegacyEntry[] {
  const parsed: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!Array.isArray(parsed)) throw new Error(`${file} must contain an array`);
  return parsed.map((value, index) => {
    if (typeof value !== "object" || value === null) {
      throw new Error(`${file} entry ${index + 1} must be an object`);
    }
    const entry = value as Record<string, unknown>;
    if (
      (entry.kanji !== null && typeof entry.kanji !== "string") ||
      typeof entry.kana !== "string" ||
      typeof entry.english !== "string" ||
      typeof entry.page !== "number" ||
      !Number.isSafeInteger(entry.page) ||
      (entry.notes !== null && typeof entry.notes !== "string") ||
      (entry.wkLevel !== undefined && entry.wkLevel !== null && typeof entry.wkLevel !== "string")
    ) {
      throw new Error(`${file} entry ${index + 1} has an invalid legacy shape`);
    }
    return {
      kanji: entry.kanji as string | null,
      kana: entry.kana,
      english: entry.english,
      page: entry.page,
      notes: entry.notes as string | null,
    };
  });
}

function convertFile(file: string): void {
  const match = path.basename(file).match(JSON_FILENAME_PATTERN);
  if (!match) throw new Error(`Unexpected legacy source filename: ${file}`);
  const volume = Number(match[1]);
  const chapter = Number(match[2]);
  const entries: SourceEntry[] = readEntries(file).map((entry, index) => ({
    id: `e${String(index + 1).padStart(4, "0")}`,
    ...entry,
  }));
  const chapterSource: ChapterSource = {
    volume,
    chapter,
    title: `Volume ${volume} · Chapter ${chapter}`,
    entries,
    file: `data/vocab-seed/vol${volume}-ch${chapter}.md`,
  };
  const outputName = path.basename(file).replace(/\.json$/, ".md");
  fs.writeFileSync(path.join(outputDir, outputName), writeChapterMarkdown(chapterSource));
  if (!SEED_FILENAME_PATTERN.test(outputName)) {
    throw new Error(`Converted filename is not a chapter Markdown filename: ${outputName}`);
  }
  console.log(`${outputName}: ${entries.length} entries`);
}

fs.mkdirSync(outputDir, { recursive: true });
const files = fs
  .readdirSync(inputDir)
  .filter((name) => JSON_FILENAME_PATTERN.test(name))
  .sort();
if (files.length === 0) throw new Error(`No legacy JSON files found in ${inputDir}`);
for (const file of files) convertFile(path.join(inputDir, file));
console.log(`Converted ${files.length} chapter files.`);
