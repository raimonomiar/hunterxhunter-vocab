/**
 * Verify a mechanical conversion against a legacy JSON checkout and record a
 * compact parity manifest. This is intentionally a migration-era utility;
 * maintained corpus validation never reads JSON.
 *
 * Usage:
 *   npm run verify-vocab-parity -- <legacy-json-dir> [manifest-path]
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { parseChapterFile, type SourceEntry } from "../src/lib/vocab-markdown";

const legacyDir = process.argv[2];
const manifestPath =
  process.argv[3] ?? path.join(process.cwd(), "docs", "vocab-migration-parity.md");
const JSON_FILENAME_PATTERN = /^vol(\d+)-ch(\d+)\.json$/;

if (!legacyDir) throw new Error("A legacy JSON directory is required");

function semantic(entry: SourceEntry): Record<string, unknown> {
  return {
    id: entry.id,
    page: entry.page,
    kanji: entry.kanji,
    kana: entry.kana,
    english: entry.english,
    notes: entry.notes,
    wkLevel: entry.wkLevel,
  };
}

const rows: { file: string; entries: number; hash: string }[] = [];
let total = 0;
for (const file of fs
  .readdirSync(legacyDir)
  .filter((name) => JSON_FILENAME_PATTERN.test(name))
  .sort()) {
  const match = file.match(JSON_FILENAME_PATTERN)!;
  const volume = Number(match[1]);
  const chapter = Number(match[2]);
  const legacy = JSON.parse(fs.readFileSync(path.join(legacyDir, file), "utf8")) as Array<{
    kanji: string | null;
    kana: string;
    english: string;
    page: number;
    notes: string | null;
  }>;
  const expected = legacy.map((entry, index) => ({
    id: `e${String(index + 1).padStart(4, "0")}`,
    page: entry.page,
    kanji: entry.kanji,
    kana: entry.kana,
    english: entry.english,
    notes: entry.notes,
    wkLevel: null,
  }));
  const markdownPath = path.join(
    process.cwd(),
    "data",
    "vocab-seed",
    file.replace(/\.json$/, ".md"),
  );
  const parsed = parseChapterFile(markdownPath, `data/vocab-seed/${path.basename(markdownPath)}`);
  if (parsed.diagnostics.length > 0 || !parsed.chapter) {
    throw new Error(
      `${file} Markdown parse failed:\n${parsed.diagnostics
        .map((diagnostic) => `${diagnostic.file}:${diagnostic.line}: ${diagnostic.message}`)
        .join("\n")}`,
    );
  }
  const actual = parsed.chapter.entries.map(semantic);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${file} did not preserve every field and array position`);
  }
  const hash = crypto
    .createHash("sha256")
    .update(JSON.stringify({ volume, chapter, entries: expected }))
    .digest("hex");
  rows.push({ file: file.replace(/\.json$/, ".md"), entries: expected.length, hash });
  total += expected.length;
}

if (rows.length !== 68 || total !== 5321) {
  throw new Error(`Expected 68 chapters and 5,321 entries; found ${rows.length} and ${total}`);
}

const overallHash = crypto
  .createHash("sha256")
  .update(JSON.stringify(rows))
  .digest("hex");
const lines = [
  "# JSON → Markdown migration parity",
  "",
  "This manifest records the mechanical conversion proof for the initial corpus. The legacy JSON was read only during migration; the Markdown files are now the maintained source.",
  "",
  `- Chapter files: ${rows.length}`,
  `- Entries: ${total}`,
  `- Intentional schema addition: every entry has ` +
    "`WK level: null` because the legacy seed files did not carry that field.",
  `- Overall semantic manifest SHA-256: \`${overallHash}\``,
  "",
  "| Chapter file | Entries | Semantic SHA-256 |",
  "| --- | ---: | --- |",
  ...rows.map((row) => `| [${row.file}](../data/vocab-seed/${row.file}) | ${row.entries} | \`${row.hash}\` |`),
  "",
  "The comparison covered page, kanji, kana, English, notes, null values, and original array order. It did not silently sort the three source files with existing page-order inversions.",
  "",
];
fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
fs.writeFileSync(manifestPath, lines.join("\n"));
console.log(`Parity verified: ${rows.length} files, ${total} entries`);
console.log(`Wrote ${manifestPath}`);
