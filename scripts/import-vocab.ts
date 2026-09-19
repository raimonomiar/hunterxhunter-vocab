/**
 * One-time (repeatable) import of the legacy spreadsheet into the database.
 *
 * Usage:
 *   npx tsx scripts/import-vocab.ts [path-to-xlsx]
 *
 * Reads DATABASE_URL / DATABASE_AUTH_TOKEN from the environment the same way
 * the app does (see src/lib/db.ts), so it can target either the local
 * SQLite file or a remote Turso database by swapping env vars.
 *
 * Every sheet except "Guidelines" is treated as vocab data for volume 1
 * (the only volume the spreadsheet covers). The sheet name must contain
 * "Chapter <n>"; all sheets for the same chapter are merged in sheet order.
 * Rows missing kana or english (required fields) are skipped and reported,
 * since the app's data model has no way to represent them. A missing page
 * number is forward-filled from the previous row in the same sheet, which
 * matches how the spreadsheet's contributors left repeated page numbers
 * blank rather than retyping them. The workbook's legacy sixth WK column is
 * intentionally ignored because it is not part of the canonical source.
 */
import path from "node:path";
import ExcelJS from "exceljs";
import { ready } from "../src/lib/db";
import { findOrCreateChapter } from "../src/lib/vocab";

const VOLUME = 1;
const GUIDELINES_SHEET = "Guidelines";

type ParsedRow = {
  kanji: string | null;
  kana: string;
  english: string;
  page: number;
  notes: string | null;
};

function cellToString(value: ExcelJS.CellValue): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "object" && "richText" in value) {
    const richText = value as { richText: { text: string }[] };
    return richText.richText.map((t) => t.text).join("");
  }
  const str = String(value).trim();
  return str.length === 0 ? null : str;
}

function parseChapterNumber(sheetName: string): number | null {
  const match = sheetName.match(/Chapter\s+(\d+)/i);
  return match ? Number(match[1]) : null;
}

function parseSheet(worksheet: ExcelJS.Worksheet): {
  rows: ParsedRow[];
  skipped: { row: number; reason: string }[];
} {
  const rows: ParsedRow[] = [];
  const skipped: { row: number; reason: string }[] = [];
  let lastPage: number | null = null;

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // header

    const kanji = cellToString(row.getCell(1).value);
    const kana = cellToString(row.getCell(2).value);
    const english = cellToString(row.getCell(3).value);
    const pageRaw = row.getCell(4).value;
    const notes = cellToString(row.getCell(5).value);

    const isFullyEmpty = !kanji && !kana && !english && pageRaw == null && !notes;
    if (isFullyEmpty) return; // formatting-only row Excel leaves behind

    if (!kana || !english) {
      skipped.push({
        row: rowNumber,
        reason:
          !kana && !english
            ? "missing kana and english"
            : !kana
              ? "missing kana"
              : "missing english",
      });
      return;
    }

    let page: number;
    if (typeof pageRaw === "number") {
      page = Math.round(pageRaw);
      lastPage = page;
    } else if (lastPage !== null) {
      page = lastPage;
    } else {
      skipped.push({ row: rowNumber, reason: "missing page with no prior page to inherit" });
      return;
    }

    rows.push({ kanji, kana, english, page, notes });
  });

  return { rows, skipped };
}

async function main() {
  const filePath =
    process.argv[2] ?? path.join(process.cwd(), "sample", "Hunter × Hunter Vocab.xlsx");

  const db = await ready();

  console.log(`Reading workbook: ${filePath}`);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const chapterSheets = new Map<number, ExcelJS.Worksheet[]>();
  for (const worksheet of workbook.worksheets) {
    if (worksheet.name === GUIDELINES_SHEET) continue;
    const chapter = parseChapterNumber(worksheet.name);
    if (chapter === null) {
      console.warn(`Skipping sheet with no recognizable chapter number: "${worksheet.name}"`);
      continue;
    }
    if (!chapterSheets.has(chapter)) chapterSheets.set(chapter, []);
    chapterSheets.get(chapter)!.push(worksheet);
  }

  const chapterNumbers = [...chapterSheets.keys()].sort((a, b) => a - b);
  let totalInserted = 0;
  let totalSkipped = 0;

  for (const chapterNumber of chapterNumbers) {
    const chapterId = await findOrCreateChapter(VOLUME, chapterNumber);

    const existingCount = await db.execute({
      sql: `SELECT COUNT(*) as c FROM vocab_entries WHERE chapter_id = ?`,
      args: [chapterId],
    });
    if (Number(existingCount.rows[0].c) > 0) {
      console.log(
        `Volume ${VOLUME} Chapter ${chapterNumber}: already has entries, skipping re-import.`,
      );
      continue;
    }

    let chapterInserted = 0;
    for (const worksheet of chapterSheets.get(chapterNumber)!) {
      const { rows, skipped } = parseSheet(worksheet);
      for (const entry of rows) {
        await db.execute({
          sql: `INSERT INTO vocab_entries (chapter_id, kanji, kana, english, page, notes)
                VALUES (?, ?, ?, ?, ?, ?)`,
          args: [chapterId, entry.kanji, entry.kana, entry.english, entry.page, entry.notes],
        });
      }
      chapterInserted += rows.length;
      totalSkipped += skipped.length;
      for (const s of skipped) {
        console.warn(`  Sheet "${worksheet.name}" row ${s.row}: skipped (${s.reason})`);
      }
    }
    console.log(`Volume ${VOLUME} Chapter ${chapterNumber}: imported ${chapterInserted} entries.`);
    totalInserted += chapterInserted;
  }

  console.log(
    `\nDone. Imported ${totalInserted} entries across ${chapterNumbers.length} chapters. Skipped ${totalSkipped} incomplete rows.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
