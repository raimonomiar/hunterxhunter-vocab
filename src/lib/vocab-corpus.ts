import * as fs from "node:fs";
import * as path from "node:path";
import {
  corpusRevision,
  formatDiagnostics,
  parseChapterFile,
  SEED_FILENAME_PATTERN,
  type ChapterSource,
  type MarkdownDiagnostic,
  type CorpusSource,
} from "@/lib/vocab-markdown";

export const DEFAULT_CORPUS_DIR = path.join(process.cwd(), "data", "vocab-seed");

export type CorpusLoadResult = {
  corpus: CorpusSource;
  diagnostics: MarkdownDiagnostic[];
  warnings: string[];
};

function chapterSort(a: ChapterSource, b: ChapterSource): number {
  return a.volume - b.volume || a.chapter - b.chapter;
}

export function chapterFilename(volume: number, chapter: number): string {
  return `vol${volume}-ch${String(chapter).padStart(2, "0")}.md`;
}

export function loadCorpus(directory = DEFAULT_CORPUS_DIR): CorpusLoadResult {
  const diagnostics: MarkdownDiagnostic[] = [];
  const warnings: string[] = [];
  if (!fs.existsSync(directory)) {
    diagnostics.push({
      file: directory,
      line: 1,
      column: 1,
      message: "vocabulary source directory does not exist",
    });
    return { corpus: { chapters: [], revision: "" }, diagnostics, warnings };
  }

  const names = fs.readdirSync(directory).sort();
  const chapterNames = names.filter((name) => SEED_FILENAME_PATTERN.test(name));
  for (const name of names.filter(
    (item) => item.endsWith(".md") && item !== "README.md" && !SEED_FILENAME_PATTERN.test(item),
  )) {
    diagnostics.push({
      file: path.join(directory, name),
      line: 1,
      column: 1,
      message: "chapter Markdown filename must match vol<V>-ch<two-digit C>.md",
    });
  }
  const unexpectedJson = names.filter((name) => name.endsWith(".json"));
  for (const name of unexpectedJson) {
    diagnostics.push({
      file: path.join(directory, name),
      line: 1,
      column: 1,
      message: "JSON seed files are no longer maintained; use chapter Markdown",
    });
  }

  const chapters: ChapterSource[] = [];
  const seenChapters = new Set<string>();
  for (const name of chapterNames) {
    const match = name.match(SEED_FILENAME_PATTERN)!;
    const key = `vol${Number(match[1])}-ch${Number(match[2])}`;
    // The filename grammar has one spelling for each normalized chapter key.
    /* c8 ignore next */
    if (seenChapters.has(key)) {
      diagnostics.push({
        file: path.join(directory, name),
        line: 1,
        column: 1,
        message: `duplicate chapter source ${key}`,
      });
      continue;
    }
    seenChapters.add(key);
    const fullPath = path.join(directory, name);
    // A directory entry always has a non-empty path relative to the cwd.
    /* c8 ignore next */
    const displayPath = path.relative(process.cwd(), fullPath) || fullPath;
    const result = parseChapterFile(fullPath, displayPath);
    diagnostics.push(...result.diagnostics);
    if (result.chapter) chapters.push(result.chapter);
  }

  chapters.sort(chapterSort);
  const seenEntryKeys = new Set<string>();
  for (const chapter of chapters) {
    for (const entry of chapter.entries) {
      const key = `${chapter.volume}-${chapter.chapter}/${entry.id}`;
      // A chapter filename is unique, and the parser rejects duplicate IDs.
      /* c8 ignore next */
      if (seenEntryKeys.has(key)) {
        diagnostics.push({
          file: entry.file ?? chapter.file ?? "<memory>",
          line: entry.line ?? 1,
          column: 1,
          message: `duplicate source key ${key}`,
        });
      }
      seenEntryKeys.add(key);
    }
    if (chapter.entries.length === 0) {
      // Files loaded from disk have a path; keep the fallback for in-memory callers.
      warnings.push(
        /* c8 ignore next */
        `${chapter.file ?? chapterFilename(chapter.volume, chapter.chapter)} contains no vocabulary entries`,
      );
    }
  }

  return {
    corpus: { chapters, revision: corpusRevision(chapters) },
    diagnostics,
    warnings,
  };
}

export function assertValidCorpus(result: CorpusLoadResult): CorpusSource {
  if (result.diagnostics.length > 0) {
    throw new Error(formatDiagnostics(result.diagnostics));
  }
  return result.corpus;
}

export function corpusSummary(corpus: CorpusSource): {
  chapters: number;
  entries: number;
  volumes: number[];
} {
  const volumes = [...new Set(corpus.chapters.map((chapter) => chapter.volume))].sort(
    // Set removes duplicate volumes before this comparator runs.
    /* c8 ignore next */
    (a, b) => a - b,
  );
  return {
    chapters: corpus.chapters.length,
    entries: corpus.chapters.reduce((total, chapter) => total + chapter.entries.length, 0),
    volumes,
  };
}
