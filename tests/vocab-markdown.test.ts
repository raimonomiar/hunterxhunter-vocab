import assert from "node:assert/strict";
import test from "node:test";
import {
  parseChapterMarkdown,
  writeChapterMarkdown,
  type ChapterSource,
} from "../src/lib/vocab-markdown";

function fixture(): ChapterSource {
  return {
    volume: 1,
    chapter: 99,
    title: "Volume 1 · Chapter 99",
    entries: [
      {
        id: "e0001",
        page: 12,
        kanji: null,
        kana: "かな・カナ",
        english: "literal *asterisk* | pipe & entity",
        notes: 'A [note] with \\slashes\\ and "quotes"',
      },
    ],
  };
}

test("canonical writer round-trips escaped punctuation, Unicode, and nulls", () => {
  const source = fixture();
  const markdown = writeChapterMarkdown(source);
  assert.match(markdown, /English: literal \\\*asterisk\\\\\* \\\\| pipe \\& entity/);
  const parsed = parseChapterMarkdown(markdown, "fixture.md");
  assert.deepEqual(parsed.diagnostics, []);
  assert.deepEqual(
    parsed.chapter?.entries.map((entry) => ({
      id: entry.id,
      page: entry.page,
      kanji: entry.kanji,
      kana: entry.kana,
      english: entry.english,
      notes: entry.notes,
    })),
    source.entries,
  );
  assert.doesNotMatch(markdown, /WK level/i);
});

test("parser decodes a supported entity but rejects formatting nodes", () => {
  const valid = parseChapterMarkdown(
    [
      "# Volume 1 · Chapter 1",
      "",
      "## e0001",
      "",
      "- Page: 1",
      "- Kanji: &amp;",
      "- Kana: かな",
      "- English: word",
      "- Notes:",
      "",
    ].join("\n"),
    "entity.md",
  );
  assert.deepEqual(valid.diagnostics, []);
  assert.equal(valid.chapter?.entries[0].kanji, "&");

  const invalid = parseChapterMarkdown(
    [
      "# Volume 1 · Chapter 1",
      "",
      "## e0001",
      "",
      "- Page: 1",
      "- Kanji: **formatted**",
      "- Kana: かな",
      "- English: word",
      "- Notes:",
    ].join("\n"),
    "formatting.md",
  );
  assert.ok(invalid.diagnostics.some((item) => item.file === "formatting.md"));
  assert.ok(invalid.diagnostics.some((item) => item.line === 6));
});

test("parser reports duplicate IDs, unknown fields, invalid pages, and multiline values", () => {
  const result = parseChapterMarkdown(
    [
      "# Volume 1 · Chapter 1",
      "",
      "## e0001",
      "",
      "- Page: zero",
      "- Kanji: test",
      "- Kana: かな",
      "- English: word",
      "- Notes: first",
      "",
      "## e0001",
      "",
      "- Page: 2",
      "- Unknown: field",
      "- Kana: かな",
      "- English: word",
      "- Notes: wraps",
      "  onto a second line",
      "- WK level:",
    ].join("\n"),
    "malformed.md",
  );
  const messages = result.diagnostics.map((item) => item.message).join("\n");
  assert.match(messages, /positive integer/);
  assert.match(messages, /unknown field/);
  assert.match(messages, /exactly 5 fields/);
  assert.match(messages, /duplicate entry ID/);
  assert.match(messages, /multiline values/);
  assert.ok(result.diagnostics.every((item) => item.file === "malformed.md"));
});

test("parser exposes the chapter mapping from the title", () => {
  const result = parseChapterMarkdown(
    "# Volume 2 · Chapter 3\n\n## e0001\n\n- Page: 1\n- Kanji:\n- Kana: かな\n- English: word\n- Notes:\n",
    "data/vocab-seed/vol1-ch01.md",
  );
  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.chapter?.volume, 2);
  assert.equal(result.chapter?.chapter, 3);
});
