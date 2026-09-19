import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { unified } from "unified";
import remarkParse from "remark-parse";
import type { Content, Heading, List, ListItem, Paragraph, Root, Text } from "mdast";

export const SEED_FILENAME_PATTERN = /^vol([1-9]\d*)-ch(0[1-9]|[1-9]\d+)\.md$/;
export const SOURCE_FIELDS = ["Page", "Kanji", "Kana", "English", "Notes"] as const;

export type SourceField = (typeof SOURCE_FIELDS)[number];

export type SourceEntry = {
  id: string;
  page: number;
  kanji: string | null;
  kana: string;
  english: string;
  notes: string | null;
  /** Location in the source file, populated by the parser. */
  line?: number;
  file?: string;
};

export type ChapterSource = {
  volume: number;
  chapter: number;
  title: string;
  entries: SourceEntry[];
  file?: string;
};

export type CorpusSource = {
  chapters: ChapterSource[];
  revision: string;
};

export type MarkdownDiagnostic = {
  file: string;
  line: number;
  column: number;
  message: string;
};

export type ParseResult = {
  chapter: ChapterSource | null;
  diagnostics: MarkdownDiagnostic[];
};

export class MarkdownValidationError extends Error {
  constructor(public readonly diagnostics: MarkdownDiagnostic[]) {
    super(formatDiagnostics(diagnostics));
    this.name = "MarkdownValidationError";
  }
}

const markdownParser = unified().use(remarkParse);

function positionOf(node: Content | Root): {
  line: number;
  column: number;
} {
  // Parsed mdast nodes carry positions; the fallback protects synthetic nodes.
  /* c8 ignore next 2 */
  return {
    line: node.position?.start.line ?? 1,
    column: node.position?.start.column ?? 1,
  };
}

function addDiagnostic(
  diagnostics: MarkdownDiagnostic[],
  file: string,
  node: Content | Root,
  message: string,
): void {
  const position = positionOf(node);
  diagnostics.push({ file, ...position, message });
}

function plainText(
  node: Content,
  diagnostics: MarkdownDiagnostic[],
  file: string,
  description: string,
): string | null {
  // Callers pass only paragraph and heading nodes from the mdast tree.
  /* c8 ignore next */
  if (node.type !== "paragraph" && node.type !== "heading") {
    addDiagnostic(diagnostics, file, node, `${description} must be plain text`);
    return null;
  }

  if (node.children.length !== 1 || node.children[0].type !== "text") {
    addDiagnostic(
      diagnostics,
      file,
      node,
      `${description} must not contain Markdown formatting, links, HTML, or line breaks`,
    );
    return null;
  }

  return (node.children[0] as Text).value;
}

function fieldValue(
  text: string,
  expectedField: SourceField,
  diagnostics: MarkdownDiagnostic[],
  file: string,
  node: Content,
): string | null {
  const colon = text.indexOf(":");
  const label = colon === -1 ? text : text.slice(0, colon);
  if (!SOURCE_FIELDS.includes(label as SourceField)) {
    addDiagnostic(
      diagnostics,
      file,
      node,
      `unknown field ${JSON.stringify(label)}; expected ${expectedField}`,
    );
    return null;
  }
  if (label !== expectedField) {
    addDiagnostic(
      diagnostics,
      file,
      node,
      `fields must be in order; expected ${expectedField} but found ${label}`,
    );
    return null;
  }

  if (colon === -1) {
    addDiagnostic(
      diagnostics,
      file,
      node,
      `${expectedField} must use the form "${expectedField}: value"`,
    );
    return null;
  }

  const value = text.slice(colon + 1).replace(/^ /, "");
  if (node.position && node.position.start.line !== node.position.end.line) {
    addDiagnostic(
      diagnostics,
      file,
      node,
      `${expectedField} must be one logical line; multiline values are not supported`,
    );
  }
  return value;
}

function parseEntry(
  heading: Heading,
  list: List,
  file: string,
  diagnostics: MarkdownDiagnostic[],
): SourceEntry | null {
  const idText = plainText(heading, diagnostics, file, "entry heading");
  if (idText === null) return null;
  if (!/^e\d{4,}$/.test(idText)) {
    addDiagnostic(
      diagnostics,
      file,
      heading,
      `entry heading must be a stable ID like e0001; found ${JSON.stringify(idText)}`,
    );
  }

  if (list.ordered || list.spread) {
    addDiagnostic(
      diagnostics,
      file,
      list,
      "entry fields must be a compact unordered list with no blank item separators",
    );
  }
  if (list.children.length !== SOURCE_FIELDS.length) {
    addDiagnostic(
      diagnostics,
      file,
      list,
      `entry must contain exactly ${SOURCE_FIELDS.length} fields in the fixed order`,
    );
  }

  const values: Array<string | null> = [];
  for (let index = 0; index < SOURCE_FIELDS.length; index++) {
    const item = list.children[index] as ListItem | undefined;
    if (!item) continue;
    // remark-parse has no task-list extension, so checked is always null here.
    /* c8 ignore next */
    if (item.checked !== null || item.children.length !== 1) {
      addDiagnostic(
        diagnostics,
        file,
        item,
        "each field must be one plain paragraph in an unordered list item",
      );
      continue;
    }
    const paragraph = item.children[0] as Paragraph;
    const text = plainText(paragraph, diagnostics, file, `${SOURCE_FIELDS[index]} field`);
    if (text === null) continue;
    values.push(fieldValue(text, SOURCE_FIELDS[index], diagnostics, file, paragraph));
  }

  if (values.length !== SOURCE_FIELDS.length) return null;

  const [pageText, kanjiText, kanaText, englishText, notesText] = values;
  const page = Number(pageText);
  if (pageText === null || !/^[1-9]\d*$/.test(pageText) || !Number.isSafeInteger(page)) {
    addDiagnostic(diagnostics, file, list.children[0]!, "Page must be a positive integer");
  }
  if (kanaText === null || kanaText.length === 0 || kanaText.trim().length === 0) {
    addDiagnostic(diagnostics, file, list.children[2]!, "Kana must be a nonblank string");
  }
  if (englishText === null || englishText.length === 0 || englishText.trim().length === 0) {
    addDiagnostic(diagnostics, file, list.children[3]!, "English must be a nonblank string");
  }

  return {
    id: idText,
    page,
    kanji: kanjiText === "" ? null : kanjiText,
    kana: kanaText ?? "",
    english: englishText ?? "",
    notes: notesText === "" ? null : notesText,
    line: heading.position?.start.line,
    file,
  };
}

function parseTitle(
  heading: Heading,
  file: string,
  diagnostics: MarkdownDiagnostic[],
): { volume: number; chapter: number; title: string } | null {
  const title = plainText(heading, diagnostics, file, "chapter title");
  if (title === null) return null;
  const match = title.match(/^Volume ([1-9]\d*) · Chapter ([1-9]\d*)$/);
  if (!match) {
    addDiagnostic(
      diagnostics,
      file,
      heading,
      'chapter title must be exactly "Volume <number> · Chapter <number>"',
    );
    return null;
  }
  const volume = Number(match[1]);
  const chapter = Number(match[2]);
  if (!Number.isSafeInteger(volume) || !Number.isSafeInteger(chapter)) {
    addDiagnostic(diagnostics, file, heading, "chapter volume and number must be safe integers");
    return null;
  }
  return { volume, chapter, title };
}

export function parseChapterMarkdown(source: string, file = "<memory>"): ParseResult {
  const diagnostics: MarkdownDiagnostic[] = [];
  let root: Root;
  try {
    root = markdownParser.parse(source) as Root;
    // remark-parse is a non-throwing parser for the supported Markdown grammar.
    /* c8 ignore next */
  } catch (error) {
    diagnostics.push({
      file,
      line: 1,
      column: 1,
      message: `Markdown parser failed: ${String(error)}`,
    });
    return { chapter: null, diagnostics };
  }

  const titleNode = root.children[0];
  if (!titleNode || titleNode.type !== "heading" || titleNode.depth !== 1) {
    addDiagnostic(
      diagnostics,
      file,
      titleNode ?? root,
      "the first block must be a level-one chapter title",
    );
    return { chapter: null, diagnostics };
  }
  const title = parseTitle(titleNode, file, diagnostics);
  if (!title) return { chapter: null, diagnostics };

  const entries: SourceEntry[] = [];
  const seenIds = new Set<string>();
  let index = 1;
  while (index < root.children.length) {
    const headingNode = root.children[index];
    const listNode = root.children[index + 1];
    // The loop bounds guarantee that headingNode exists; retain the guard for malformed ASTs.
    /* c8 ignore next */
    if (!headingNode || headingNode.type !== "heading" || headingNode.depth !== 2) {
      addDiagnostic(
        diagnostics,
        file,
        headingNode ?? root,
        "each entry must be a level-two heading followed by its field list",
      );
      index += 1;
      continue;
    }
    if (!listNode || listNode.type !== "list") {
      addDiagnostic(
        diagnostics,
        file,
        headingNode,
        "each entry heading must be followed by an unordered field list",
      );
      index += 1;
      continue;
    }

    const entry = parseEntry(headingNode, listNode, file, diagnostics);
    if (entry) {
      if (seenIds.has(entry.id)) {
        addDiagnostic(diagnostics, file, headingNode, `duplicate entry ID ${entry.id}`);
      } else {
        seenIds.add(entry.id);
        entries.push(entry);
      }
    }
    index += 2;
  }

  const chapter: ChapterSource = {
    ...title,
    entries,
    file,
  };
  return { chapter, diagnostics };
}

export function parseChapterFile(filePath: string, relativePath = filePath): ParseResult {
  const result = parseChapterMarkdown(fs.readFileSync(filePath, "utf8"), relativePath);
  const match = path.basename(relativePath).match(SEED_FILENAME_PATTERN);
  if (!match) {
    result.diagnostics.push({
      file: relativePath,
      line: 1,
      column: 1,
      message: "chapter source filename must match vol<V>-ch<C>.md",
    });
    return result;
  }
  if (result.chapter) {
    const volume = Number(match[1]);
    const chapter = Number(match[2]);
    if (result.chapter.volume !== volume || result.chapter.chapter !== chapter) {
      result.diagnostics.push({
        file: relativePath,
        line: 1,
        column: 1,
        message: `filename identifies Volume ${volume} Chapter ${chapter}, but the title identifies Volume ${result.chapter.volume} Chapter ${result.chapter.chapter}`,
      });
    }
    result.chapter.file = relativePath;
    for (const entry of result.chapter.entries) entry.file = relativePath;
  }
  return result;
}

function escapeMarkdownText(value: string): string {
  return value.replace(/[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/g, (character) => `\\${character}`);
}

function assertWritableEntry(entry: SourceEntry): void {
  if (!/^e\d{4,}$/.test(entry.id)) {
    throw new Error(`Invalid source entry ID ${entry.id}`);
  }
  if (!Number.isSafeInteger(entry.page) || entry.page < 1) {
    throw new Error(`Invalid page for ${entry.id}`);
  }
  if (!entry.kana || !entry.kana.trim() || !entry.english || !entry.english.trim()) {
    throw new Error(`Kana and English are required for ${entry.id}`);
  }
  for (const [field, value] of [
    ["Kanji", entry.kanji],
    ["Kana", entry.kana],
    ["English", entry.english],
    ["Notes", entry.notes],
  ] as const) {
    if (value !== null && /[\r\n]/.test(value)) {
      throw new Error(`${field} for ${entry.id} must be one logical line`);
    }
  }
}

export function writeChapterMarkdown(chapter: ChapterSource): string {
  if (!Number.isSafeInteger(chapter.volume) || chapter.volume < 1) {
    throw new Error("Chapter volume must be a positive integer");
  }
  if (!Number.isSafeInteger(chapter.chapter) || chapter.chapter < 1) {
    throw new Error("Chapter number must be a positive integer");
  }
  const title = `Volume ${chapter.volume} · Chapter ${chapter.chapter}`;
  const seenIds = new Set<string>();
  const blocks = [`# ${title}`];
  for (const entry of chapter.entries) {
    assertWritableEntry(entry);
    if (seenIds.has(entry.id)) throw new Error(`Duplicate source entry ID ${entry.id}`);
    seenIds.add(entry.id);
    const value = (field: SourceField): string | null => {
      const raw =
        field === "Page"
          ? String(entry.page)
          : field === "Kanji"
            ? entry.kanji
            : field === "Kana"
              ? entry.kana
              : field === "English"
                ? entry.english
                : entry.notes;
      return raw === null ? null : escapeMarkdownText(raw);
    };
    const fieldLine = (field: SourceField): string => {
      const fieldValue = value(field);
      return `- ${field}:${fieldValue === null ? "" : ` ${fieldValue}`}`;
    };
    blocks.push(
      [
        `## ${entry.id}`,
        "",
        fieldLine("Page"),
        fieldLine("Kanji"),
        fieldLine("Kana"),
        fieldLine("English"),
        fieldLine("Notes"),
      ].join("\n"),
    );
  }
  return `${blocks.join("\n\n")}\n`;
}

export function sourceEntryKey(volume: number, chapter: number, id: string): string {
  return `vol${volume}-ch${String(chapter).padStart(2, "0")}/${id}`;
}

export function semanticEntry(entry: SourceEntry): Omit<SourceEntry, "line" | "file"> {
  return {
    id: entry.id,
    page: entry.page,
    kanji: entry.kanji,
    kana: entry.kana,
    english: entry.english,
    notes: entry.notes,
  };
}

export function chapterSemanticHash(chapter: ChapterSource): string {
  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        volume: chapter.volume,
        chapter: chapter.chapter,
        entries: chapter.entries.map(semanticEntry),
      }),
    )
    .digest("hex");
}

export function corpusRevision(chapters: ChapterSource[]): string {
  const ordered = [...chapters]
    .sort((a, b) => a.volume - b.volume || a.chapter - b.chapter)
    .map((chapter) => ({
      file: chapter.file ?? `vol${chapter.volume}-ch${chapter.chapter}.md`,
      hash: chapterSemanticHash(chapter),
    }));
  return crypto.createHash("sha256").update(JSON.stringify(ordered)).digest("hex");
}

export function formatDiagnostics(diagnostics: MarkdownDiagnostic[]): string {
  return diagnostics
    .map(
      (diagnostic) =>
        `${diagnostic.file}:${diagnostic.line}:${diagnostic.column}: ${diagnostic.message}`,
    )
    .join("\n");
}
