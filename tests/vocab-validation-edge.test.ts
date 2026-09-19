import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  chapterSemanticHash,
  corpusRevision,
  formatDiagnostics,
  MarkdownValidationError,
  parseChapterFile,
  parseChapterMarkdown,
  semanticEntry,
  sourceEntryKey,
  writeChapterMarkdown,
  type ChapterSource,
  type SourceEntry,
} from "../src/lib/vocab-markdown";
import {
  assertValidCorpus,
  chapterFilename,
  corpusSummary,
  loadCorpus,
} from "../src/lib/vocab-corpus";

function markdown(fields: string[] = ["1", "語", "ご", "word", ""]): string {
  return [
    "# Volume 1 · Chapter 1",
    "",
    "## e0001",
    "",
    `- Page: ${fields[0]}`,
    `- Kanji: ${fields[1]}`,
    `- Kana: ${fields[2]}`,
    `- English: ${fields[3]}`,
    `- Notes: ${fields[4]}`,
    "",
  ].join("\n");
}

function chapter(volume = 1, chapterNumber = 1, entries: SourceEntry[] = []): ChapterSource {
  return {
    volume,
    chapter: chapterNumber,
    title: `Volume ${volume} · Chapter ${chapterNumber}`,
    entries,
  };
}

function entry(id = "e0001"): SourceEntry {
  return {
    id,
    page: 1,
    kanji: "語",
    kana: "ご",
    english: "word",
    notes: null,
  };
}

test("corpus and markdown utility functions provide stable values and errors", () => {
  const sourceEntry = entry();
  const sourceChapter = chapter(2, 3, [sourceEntry]);
  const reorderedChapter = chapter(1, 9, [entry("e0002")]);

  assert.equal(chapterFilename(2, 3), "vol2-ch03.md");
  assert.equal(sourceEntryKey(2, 3, sourceEntry.id), "vol2-ch03/e0001");
  assert.deepEqual(semanticEntry({ ...sourceEntry, file: "source.md", line: 8 }), sourceEntry);
  assert.match(chapterSemanticHash(sourceChapter), /^[0-9a-f]{64}$/);
  assert.equal(
    corpusRevision([sourceChapter, reorderedChapter]),
    corpusRevision([reorderedChapter, sourceChapter]),
  );

  const diagnostic = { file: "fixture.md", line: 2, column: 3, message: "bad field" };
  assert.equal(formatDiagnostics([diagnostic]), "fixture.md:2:3: bad field");
  assert.equal(formatDiagnostics([]), "");
  const validationError = new MarkdownValidationError([diagnostic]);
  assert.ok(validationError instanceof MarkdownValidationError);
  assert.equal(validationError.name, "MarkdownValidationError");
  assert.deepEqual(validationError.diagnostics, [diagnostic]);

  const valid = {
    ...sourceChapter,
    entries: [sourceEntry],
  };
  const loaded = {
    corpus: { chapters: [valid, reorderedChapter], revision: "revision" },
    diagnostics: [],
    warnings: [],
  };
  assert.strictEqual(assertValidCorpus(loaded), loaded.corpus);
  assert.deepEqual(corpusSummary(loaded.corpus), {
    chapters: 2,
    entries: 2,
    volumes: [1, 2],
  });
  assert.throws(
    () => assertValidCorpus({ ...loaded, diagnostics: [diagnostic] }),
    /fixture\.md:2:3: bad field/,
  );
});

test("markdown parser rejects malformed chapter structures and values", () => {
  const malformedCases = [
    ["missing title", "", /first block must be a level-one chapter title/],
    [
      "wrong title depth",
      "## Volume 1 · Chapter 1",
      /first block must be a level-one chapter title/,
    ],
    ["formatted title", "# **Volume 1 · Chapter 1**", /chapter title must not contain Markdown/],
    ["invalid title", "# Not a chapter", /chapter title must be exactly/],
    [
      "unsafe title",
      "# Volume 9007199254740992 · Chapter 1",
      /chapter volume and number must be safe integers/,
    ],
    [
      "wrong entry heading",
      "# Volume 1 · Chapter 1\n\n### e0001\n\n- Page: 1",
      /each entry must be a level-two heading/,
    ],
    [
      "missing field list",
      "# Volume 1 · Chapter 1\n\n## e0001\n\nparagraph",
      /entry heading must be followed by an unordered field list/,
    ],
    [
      "formatted entry heading",
      "# Volume 1 · Chapter 1\n\n## **e0001**\n\n- Page: 1",
      /entry heading must not contain Markdown/,
    ],
  ] as const;

  for (const [name, source, pattern] of malformedCases) {
    const result = parseChapterMarkdown(source, `${name}.md`);
    assert.ok(
      result.diagnostics.some((item) => pattern.test(item.message)),
      name,
    );
  }

  const invalidEntry = parseChapterMarkdown(
    [
      "# Volume 1 · Chapter 1",
      "",
      "## not-an-id",
      "",
      "- Page: zero",
      "- Kanji: 語",
      "- Kana:",
      "- English:",
      "- Notes: first",
      "",
    ].join("\n"),
    "invalid-entry.md",
  );
  const invalidMessages = invalidEntry.diagnostics.map((item) => item.message).join("\n");
  assert.match(invalidMessages, /stable ID/);
  assert.match(invalidMessages, /Page must be a positive integer/);
  assert.match(invalidMessages, /Kana must be a nonblank string/);
  assert.match(invalidMessages, /English must be a nonblank string/);

  const ordered = parseChapterMarkdown(
    [
      "# Volume 1 · Chapter 1",
      "",
      "## e0001",
      "",
      "1. Page: 1",
      "2. Kanji: 語",
      "3. Kana: ご",
      "4. English: word",
      "5. Notes:",
    ].join("\n"),
    "ordered.md",
  );
  assert.ok(ordered.diagnostics.some((item) => /compact unordered list/.test(item.message)));

  const noColon = parseChapterMarkdown(
    [
      "# Volume 1 · Chapter 1",
      "",
      "## e0001",
      "",
      "- Page",
      "- Kanji: 語",
      "- Kana: ご",
      "- English: word",
      "- Notes:",
    ].join("\n"),
    "no-colon.md",
  );
  assert.ok(noColon.diagnostics.some((item) => /Page must use the form/.test(item.message)));

  const outOfOrder = parseChapterMarkdown(
    [
      "# Volume 1 · Chapter 1",
      "",
      "## e0001",
      "",
      "- Page: 1",
      "- Kana: ご",
      "- Kana: ご",
      "- English: word",
      "- Notes:",
    ].join("\n"),
    "out-of-order.md",
  );
  assert.ok(outOfOrder.diagnostics.some((item) => /fields must be in order/.test(item.message)));

  for (const [field, expected] of [
    ["Kana", ""],
    ["English", ""],
  ] as const) {
    const nullable = parseChapterMarkdown(
      [
        "# Volume 1 · Chapter 1",
        "",
        "## e0001",
        "",
        "- Page: 1",
        "- Kanji: 語",
        `- ${field === "Kana" ? "Unknown" : "Kana"}: ${field === "Kana" ? "bad" : "ご"}`,
        `- ${field === "English" ? "Unknown" : "English"}: ${field === "English" ? "bad" : "word"}`,
        "- Notes:",
      ].join("\n"),
      `nullable-${field}.md`,
    );
    assert.equal(
      nullable.chapter?.entries[0]?.[field.toLowerCase() as "kana" | "english"],
      expected,
    );
  }

  const spread = parseChapterMarkdown(
    [
      "# Volume 1 · Chapter 1",
      "",
      "## e0001",
      "",
      "- Page: 1",
      "",
      "- Kanji: 語",
      "- Kana: ご",
      "- English: word",
      "- Notes:",
    ].join("\n"),
    "spread.md",
  );
  assert.ok(spread.diagnostics.some((item) => /compact unordered list/.test(item.message)));

  const nested = parseChapterMarkdown(
    [
      "# Volume 1 · Chapter 1",
      "",
      "## e0001",
      "",
      "- Page: 1",
      "",
      "  continuation",
      "- Kanji: 語",
      "- Kana: ご",
      "- English: word",
      "- Notes:",
    ].join("\n"),
    "nested.md",
  );
  assert.ok(
    nested.diagnostics.some((item) => /each field must be one plain paragraph/.test(item.message)),
  );
});

test("markdown writer validates chapter and entry invariants", () => {
  assert.throws(() => writeChapterMarkdown(chapter(0)), /Chapter volume/);
  assert.throws(() => writeChapterMarkdown(chapter(1, 0)), /Chapter number/);
  assert.throws(
    () => writeChapterMarkdown(chapter(1, 1, [{ ...entry(), id: "bad" }])),
    /Invalid source entry ID/,
  );
  assert.throws(
    () => writeChapterMarkdown(chapter(1, 1, [{ ...entry(), page: 0 }])),
    /Invalid page/,
  );
  assert.throws(
    () => writeChapterMarkdown(chapter(1, 1, [{ ...entry(), kana: " " }])),
    /Kana and English are required/,
  );
  assert.throws(
    () => writeChapterMarkdown(chapter(1, 1, [{ ...entry(), english: "" }])),
    /Kana and English are required/,
  );
  assert.throws(
    () => writeChapterMarkdown(chapter(1, 1, [{ ...entry(), notes: "line\nbreak" }])),
    /Notes .* one logical line/,
  );
  assert.throws(
    () => writeChapterMarkdown(chapter(1, 1, [entry(), entry()])),
    /Duplicate source entry ID/,
  );
});

test("corpus loader reports source-directory and file-level problems", () => {
  const missing = path.join(os.tmpdir(), `hxh-vocab-missing-${process.pid}`);
  assert.deepEqual(loadCorpus(missing), {
    corpus: { chapters: [], revision: "" },
    diagnostics: [
      {
        file: missing,
        line: 1,
        column: 1,
        message: "vocabulary source directory does not exist",
      },
    ],
    warnings: [],
  });

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "hxh-vocab-corpus-"));
  try {
    fs.writeFileSync(path.join(directory, "README.md"), "# index\n");
    fs.writeFileSync(path.join(directory, "not-a-chapter.md"), "# invalid\n");
    fs.writeFileSync(path.join(directory, "retired.json"), "{}\n");
    fs.writeFileSync(path.join(directory, "vol1-ch01.md"), "# Volume 1 · Chapter 1\n");
    fs.writeFileSync(
      path.join(directory, "vol2-ch02.md"),
      markdown().replace("Volume 1", "Volume 2").replace("Chapter 1", "Chapter 2"),
    );
    fs.writeFileSync(
      path.join(directory, "vol2-ch01.md"),
      markdown().replace("Volume 1", "Volume 2"),
    );
    fs.writeFileSync(
      path.join(directory, "vol3-ch03.md"),
      [
        "# Volume 3 · Chapter 3",
        "",
        "## e0001",
        "",
        "- Page: nope",
        "- Kanji: 語",
        "- Kana: ご",
        "- English: word",
        "- Notes:",
      ].join("\n"),
    );

    const result = loadCorpus(directory);
    assert.equal(result.corpus.chapters.length, 4);
    assert.deepEqual(
      result.corpus.chapters.map((item) => [item.volume, item.chapter]),
      [
        [1, 1],
        [2, 1],
        [2, 2],
        [3, 3],
      ],
    );
    assert.equal(result.warnings.length, 1);
    assert.match(result.warnings[0], /vol1-ch01\.md contains no vocabulary entries/);
    const messages = result.diagnostics.map((item) => item.message).join("\n");
    assert.match(messages, /chapter Markdown filename must match/);
    assert.match(messages, /JSON seed files are no longer maintained/);
    assert.match(messages, /Page must be a positive integer/);
    assert.throws(() => assertValidCorpus(result), /Page must be a positive integer/);
    assert.strictEqual(assertValidCorpus({ ...result, diagnostics: [] }), result.corpus);
    assert.deepEqual(corpusSummary(result.corpus), {
      chapters: 4,
      entries: 3,
      volumes: [1, 2, 3],
    });
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("parseChapterFile validates the filename and annotates source locations", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "hxh-vocab-file-"));
  const validPath = path.join(directory, "vol1-ch01.md");
  const mismatchPath = path.join(directory, "vol2-ch02.md");
  const invalidNamePath = path.join(directory, "chapter.md");
  try {
    fs.writeFileSync(validPath, markdown());
    fs.writeFileSync(
      mismatchPath,
      markdown().replace("Volume 1", "Volume 3").replace("Chapter 1", "Chapter 3"),
    );
    fs.writeFileSync(invalidNamePath, markdown());

    const valid = parseChapterFile(validPath);
    assert.deepEqual(valid.diagnostics, []);
    assert.equal(valid.chapter?.file, validPath);
    assert.equal(valid.chapter?.entries[0].file, validPath);

    const mismatch = parseChapterFile(mismatchPath, "data/vocab-seed/vol2-ch02.md");
    assert.ok(
      mismatch.diagnostics.some((item) =>
        /filename identifies Volume 2 Chapter 2/.test(item.message),
      ),
    );

    const invalidName = parseChapterFile(invalidNamePath, "chapter.md");
    assert.ok(invalidName.diagnostics.some((item) => /filename must match/.test(item.message)));
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
