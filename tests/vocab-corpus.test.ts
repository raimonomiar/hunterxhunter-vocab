import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { loadCorpus } from "../src/lib/vocab-corpus";
import { renderCorpusIndex } from "../src/lib/vocab-index";

test("committed corpus has exact coverage and no validation errors", () => {
  const result = loadCorpus();
  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.corpus.chapters.length, 73);
  assert.equal(
    result.corpus.chapters.reduce((total, chapter) => total + chapter.entries.length, 0),
    13871,
  );
  const volume7Chapter6 = result.corpus.chapters.find(
    (chapter) => chapter.volume === 7 && chapter.chapter === 6,
  );
  assert.ok(volume7Chapter6, "Volume 7 Chapter 6 exists");
  assert.equal(volume7Chapter6.entries.length, 190);
  assert.equal(volume7Chapter6.entries[0].page, 107);
  assert.equal(volume7Chapter6.entries.at(-1)?.page, 126);
  assert.equal(volume7Chapter6.entries.filter((entry) => entry.page <= 125).length, 186);
  assert.deepEqual(
    volume7Chapter6.entries.filter((entry) => entry.page === 126).map((entry) => entry.id),
    ["e0082", "e0083", "e0084", "e0085"],
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

test("Volume 8 Chapters 1 and 2 keep story and insert boundaries separate", () => {
  const result = loadCorpus();
  assert.deepEqual(result.diagnostics, []);
  const chapter1 = result.corpus.chapters.find(
    (chapter) => chapter.volume === 8 && chapter.chapter === 1,
  );
  const chapter2 = result.corpus.chapters.find(
    (chapter) => chapter.volume === 8 && chapter.chapter === 2,
  );
  assert.ok(chapter1, "Volume 8 Chapter 1 exists");
  assert.ok(chapter2, "Volume 8 Chapter 2 exists");
  assert.equal(chapter1.entries.length, 173);
  assert.equal(chapter2.entries.length, 179);

  const chapter1StoryEntries = chapter1.entries.filter(
    (entry) => entry.page >= 7 && entry.page <= 21,
  );
  const chapter1TravelogueEntries = chapter1.entries.filter((entry) => entry.page === 22);
  assert.equal(chapter1StoryEntries.length, 160);
  assert.equal(chapter1TravelogueEntries.length, 13);
  assert.ok(chapter1.entries.every((entry) => entry.page >= 7 && entry.page <= 22));

  const chapter2StoryEntries = chapter2.entries.filter(
    (entry) => entry.page >= 23 && entry.page <= 41,
  );
  const chapter2TravelogueEntries = chapter2.entries.filter((entry) => entry.page === 42);
  assert.equal(chapter2StoryEntries.length, 154);
  assert.equal(chapter2TravelogueEntries.length, 25);
  assert.ok(chapter2.entries.every((entry) => entry.page >= 23 && entry.page <= 42));
  assert.deepEqual(
    chapter2TravelogueEntries.map((entry) => entry.id),
    Array.from({ length: 25 }, (_, index) => `e${String(index + 72).padStart(4, "0")}`),
  );
  const originalChapter2Ids = new Set(
    Array.from({ length: 71 }, (_, index) => `e${String(index + 1).padStart(4, "0")}`),
  );
  assert.deepEqual(
    chapter2.entries
      .filter((entry) => originalChapter2Ids.has(entry.id))
      .map((entry) => entry.id)
      .sort(),
    [...originalChapter2Ids].sort(),
  );
  for (let index = 1; index < chapter2.entries.length; index += 1) {
    assert.ok(
      chapter2.entries[index - 1].page <= chapter2.entries[index].page,
      "Volume 8 Chapter 2 entries stay in ascending page order",
    );
  }

  const originalChapter1Ids = new Set(
    Array.from({ length: 94 }, (_, index) => `e${String(index + 1).padStart(4, "0")}`),
  );
  assert.deepEqual(
    chapter1.entries
      .filter((entry) => originalChapter1Ids.has(entry.id))
      .map((entry) => entry.id)
      .sort(),
    [...originalChapter1Ids].sort(),
  );
  assert.deepEqual(
    chapter1TravelogueEntries.map((entry) => entry.id),
    Array.from({ length: 13 }, (_, index) => `e${String(index + 82).padStart(4, "0")}`),
  );
  for (let index = 1; index < chapter1.entries.length; index += 1) {
    assert.ok(
      chapter1.entries[index - 1].page <= chapter1.entries[index].page,
      "Volume 8 Chapter 1 entries stay in ascending page order",
    );
  }
  assert.deepEqual(
    chapter1.entries.filter((entry) => entry.kanji === "帰郷").map((entry) => entry.page),
    [7, 8],
  );
  assert.deepEqual(
    chapter1.entries.filter((entry) => entry.kanji === "親父").map((entry) => entry.page),
    [14, 16, 17, 18, 21],
  );
  assert.deepEqual(
    chapter1.entries.filter((entry) => entry.kanji === "探す").map((entry) => entry.page),
    [14, 16, 17, 20],
  );
  assert.deepEqual(
    chapter1.entries.filter((entry) => entry.kanji === "母親").map((entry) => entry.page),
    [17, 18, 19],
  );
});

test("Volume 7 Chapters 8 and 9 keep No.062, its insert, and No.063 separate", () => {
  const result = loadCorpus();
  assert.deepEqual(result.diagnostics, []);
  const chapter8 = result.corpus.chapters.find(
    (chapter) => chapter.volume === 7 && chapter.chapter === 8,
  );
  const chapter9 = result.corpus.chapters.find(
    (chapter) => chapter.volume === 7 && chapter.chapter === 9,
  );
  assert.ok(chapter8, "Volume 7 Chapter 8 exists");
  assert.ok(chapter9, "Volume 7 Chapter 9 exists");
  assert.equal(chapter8.entries.length, 96);
  assert.equal(chapter9.entries.length, 136);

  const storyEntries = chapter8.entries.filter((entry) => entry.page >= 149 && entry.page <= 167);
  assert.equal(storyEntries.length, 90);
  assert.ok(storyEntries.every((entry) => entry.page >= 149 && entry.page <= 167));
  assert.deepEqual(
    [...new Set(storyEntries.map((entry) => entry.id))].sort(),
    [
      ...Array.from({ length: 46 }, (_, index) => `e${String(index + 1).padStart(4, "0")}`),
      ...Array.from({ length: 44 }, (_, index) => `e${String(index + 121).padStart(4, "0")}`),
    ].sort(),
  );
  for (let index = 1; index < chapter8.entries.length; index += 1) {
    assert.ok(
      chapter8.entries[index - 1].page <= chapter8.entries[index].page,
      "Volume 7 Chapter 8 entries stay in ascending page order",
    );
  }
  assert.deepEqual(
    chapter8.entries.filter((entry) => entry.page === 168).map((entry) => entry.id),
    ["e0047", "e0048", "e0049", "e0050", "e0051", "e0052"],
  );
  assert.ok(
    chapter8.entries.find((entry) => entry.id === "e0047")?.notes?.includes("personality chart"),
    "scan 168 entries retain their original personality-chart note",
  );
  const originalChapter9Ids = new Set(
    Array.from({ length: 68 }, (_, index) => `e${String(index + 53).padStart(4, "0")}`),
  );
  assert.deepEqual(
    chapter9.entries
      .filter((entry) => originalChapter9Ids.has(entry.id))
      .map((entry) => entry.id)
      .sort(),
    [...originalChapter9Ids].sort(),
  );
  assert.ok(chapter9.entries.every((entry) => entry.page >= 169 && entry.page <= 187));
  for (let index = 1; index < chapter9.entries.length; index += 1) {
    assert.ok(
      chapter9.entries[index - 1].page <= chapter9.entries[index].page,
      "Volume 7 Chapter 9 entries stay in ascending page order",
    );
  }
  assert.ok(
    chapter9.entries.some((entry) => entry.page === 179),
    "readable action effects are recorded",
  );
  assert.ok(chapter9.entries.some((entry) => entry.id === "e0186" && entry.page === 187));
  assert.ok(chapter9.entries.some((entry) => entry.id === "e0187" && entry.page === 184));
  assert.ok(chapter9.entries.some((entry) => entry.id === "e0188" && entry.page === 186));
  assert.deepEqual(
    chapter8.entries.filter((entry) => entry.page === 151).map((entry) => entry.id),
    [
      "e0006",
      "e0127",
      "e0128",
      "e0129",
      "e0005",
      "e0004",
      "e0130",
      "e0007",
      "e0008",
      "e0009",
      "e0010",
      "e0011",
      "e0012",
    ],
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
