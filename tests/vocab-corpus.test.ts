import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { loadCorpus } from "../src/lib/vocab-corpus";
import { renderCorpusIndex } from "../src/lib/vocab-index";

test("committed corpus has exact coverage and no validation errors", () => {
  const result = loadCorpus();
  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.corpus.chapters.length, 72);
  assert.equal(
    result.corpus.chapters.reduce((total, chapter) => total + chapter.entries.length, 0),
    12383,
  );
  assert.deepEqual(
    result.corpus.chapters.map((chapter) => `${chapter.volume}-${chapter.chapter}`),
    result.corpus.chapters
      .map((chapter) => `${chapter.volume}-${chapter.chapter}`)
      .sort((a, b) => {
        const [av, ac] = a.split("-").map(Number);
        const [bv, bc] = b.split("-").map(Number);
        return av - bv || ac - bc;
      }),
  );
});
test("Volume 2 Chapters 7–9 stay within their printed chapter pages", () => {
  const result = loadCorpus();
  const pageRanges = [
    { chapter: 7, first: 127, last: 146 },
    { chapter: 8, first: 147, last: 166 },
    { chapter: 9, first: 167, last: 185 },
  ];
  for (const { chapter: chapterNumber, first, last } of pageRanges) {
    const chapter = result.corpus.chapters.find(
      (item) => item.volume === 2 && item.chapter === chapterNumber,
    );
    assert.ok(chapter, `Volume 2 Chapter ${chapterNumber} exists`);
    assert.ok(chapter.entries.length > 0);
    assert.ok(
      chapter.entries.every((entry) => entry.page >= first && entry.page <= last),
      `Volume 2 Chapter ${chapterNumber} entries must stay on pages ${first}–${last}`,
    );
  }
});
test("Volume 4 Chapter 1 stays within the printed No.027 chapter pages", () => {
  const result = loadCorpus();
  const chapter = result.corpus.chapters.find((item) => item.volume === 4 && item.chapter === 1);
  assert.ok(chapter, "Volume 4 Chapter 1 exists");
  assert.ok(chapter.entries.length > 0);
  assert.ok(
    chapter.entries.every((entry) => entry.page >= 7 && entry.page <= 26),
    "Volume 4 Chapter 1 entries must stay on printed pages 7–26",
  );
});
test("Volume 4 Chapter 2 stays within the printed No.028 chapter pages", () => {
  const result = loadCorpus();
  const chapter = result.corpus.chapters.find((item) => item.volume === 4 && item.chapter === 2);
  assert.ok(chapter, "Volume 4 Chapter 2 exists");
  assert.ok(chapter.entries.length > 0);
  assert.ok(
    chapter.entries.every((entry) => entry.page >= 27 && entry.page <= 46),
    "Volume 4 Chapter 2 entries must stay on printed pages 27–46",
  );
});
test("Volume 4 Chapter 5 covers printed No.031 pages 87–106", () => {
  const result = loadCorpus();
  const chapter = result.corpus.chapters.find((item) => item.volume === 4 && item.chapter === 5);
  assert.ok(chapter, "Volume 4 Chapter 5 exists");
  assert.equal(chapter.entries.length, 143);
  assert.equal(chapter.entries[0].page, 87);
  assert.equal(chapter.entries.at(-1)?.page, 105);
  assert.ok(
    chapter.entries.every((entry) => entry.page >= 87 && entry.page <= 106),
    "Volume 4 Chapter 5 entries must stay within printed pages 87–106",
  );
});
test("Volume 4 Chapter 6 covers printed No.032 pages 107–126", () => {
  const result = loadCorpus();
  const chapter = result.corpus.chapters.find((item) => item.volume === 4 && item.chapter === 6);
  assert.ok(chapter, "Volume 4 Chapter 6 exists");
  assert.equal(chapter.entries.length, 199);
  assert.equal(chapter.entries[0].page, 107);
  assert.equal(chapter.entries.at(-1)?.page, 125);
  assert.ok(
    chapter.entries.every((entry) => entry.page >= 107 && entry.page <= 126),
    "Volume 4 Chapter 6 entries must stay within printed pages 107–126",
  );
});
test("Volume 4 Chapter 7 covers printed No.033 pages 127–146", () => {
  const result = loadCorpus();
  const chapter = result.corpus.chapters.find((item) => item.volume === 4 && item.chapter === 7);
  assert.ok(chapter, "Volume 4 Chapter 7 exists");
  assert.equal(chapter.entries.length, 260);
  assert.equal(chapter.entries[0].page, 127);
  assert.equal(chapter.entries.at(-1)?.page, 145);
  assert.ok(
    chapter.entries.every((entry) => entry.page >= 127 && entry.page <= 146),
    "Volume 4 Chapter 7 entries must stay within printed pages 127–146",
  );
});
test("recovered Volume 1 chapters retain workbook row counts and canonical fields", () => {
  const result = loadCorpus();
  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(
    result.corpus.chapters
      .filter((chapter) => chapter.volume === 1 && chapter.chapter <= 4)
      .map((chapter) => [chapter.chapter, chapter.entries.length]),
    [
      [1, 291],
      [2, 386],
      [3, 274],
      [4, 90],
    ],
  );
  const chapter1 = result.corpus.chapters.find(
    (chapter) => chapter.volume === 1 && chapter.chapter === 1,
  );
  assert.ok(chapter1);
  const firstEntry = chapter1.entries[0];
  assert.deepEqual(
    {
      id: firstEntry.id,
      page: firstEntry.page,
      kanji: firstEntry.kanji,
      kana: firstEntry.kana,
      english: firstEntry.english,
      notes: firstEntry.notes,
    },
    {
      id: "e0001",
      page: 5,
      kanji: "力",
      kana: "ちから",
      english: "power",
      notes: null,
    },
  );
  assert.equal(chapter1.entries.at(-1)?.id, "e0291");
  assert.equal(
    chapter1.entries[4].notes,
    'Here it\'s most likely just a derogatory replacement for "people"',
  );
  assert.equal("wkLevel" in firstEntry, false);
});
test("generated index is deterministic after corpus recovery", () => {
  const result = loadCorpus();
  assert.deepEqual(result.diagnostics, []);
  assert.equal(
    fs.readFileSync("data/vocab-seed/README.md", "utf8"),
    renderCorpusIndex(result.corpus),
  );
});
