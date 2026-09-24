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
    7392,
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
