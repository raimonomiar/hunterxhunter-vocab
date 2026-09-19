import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { loadCorpus } from "../src/lib/vocab-corpus";
import { renderCorpusIndex } from "../src/lib/vocab-index";

test("committed corpus has exact initial coverage and no validation errors", () => {
  const result = loadCorpus();
  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.corpus.chapters.length, 68);
  assert.equal(
    result.corpus.chapters.reduce((total, chapter) => total + chapter.entries.length, 0),
    5321,
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
  assert.ok(result.corpus.chapters.every((chapter) =>
    chapter.entries.every((entry) => entry.wkLevel === null),
  ));
});
test("generated index is deterministic and the initial parity manifest is recorded", () => {
  const result = loadCorpus();
  assert.deepEqual(result.diagnostics, []);
  assert.equal(
    fs.readFileSync("data/vocab-seed/README.md", "utf8"),
    renderCorpusIndex(result.corpus),
  );
  const manifest = fs.readFileSync("docs/vocab-migration-parity.md", "utf8");
  assert.match(manifest, /Chapter files: 68/);
  assert.match(manifest, /Entries: 5321/);
  assert.match(manifest, /vol8-ch10\.md/);
});
