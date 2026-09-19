import fs from "node:fs";
import { assertValidCorpus, loadCorpus } from "../src/lib/vocab-corpus";
import { renderCorpusIndex } from "../src/lib/vocab-index";

const result = loadCorpus();
for (const warning of result.warnings) console.warn(`warning: ${warning}`);
if (result.diagnostics.length > 0) {
  for (const diagnostic of result.diagnostics) {
    console.error(
      `${diagnostic.file}:${diagnostic.line}:${diagnostic.column}: ${diagnostic.message}`,
    );
  }
  process.exit(1);
}

const corpus = assertValidCorpus(result);
const indexPath = "data/vocab-seed/README.md";
if (!fs.existsSync(indexPath)) {
  console.error(`${indexPath}: generated corpus index is missing`);
  process.exit(1);
}
const expectedIndex = renderCorpusIndex(corpus);
const actualIndex = fs.readFileSync(indexPath, "utf8");
if (expectedIndex !== actualIndex) {
  console.error(
    `${indexPath}: generated corpus index is stale; run npm run generate-vocab-index`,
  );
  process.exit(1);
}

const entryCount = corpus.chapters.reduce(
  (total, chapter) => total + chapter.entries.length,
  0,
);
console.log(
  `Vocabulary source is valid: ${corpus.chapters.length} chapter files, ${entryCount} entries, revision ${corpus.revision}`,
);
