import fs from "node:fs";
import { assertValidCorpus, loadCorpus } from "../src/lib/vocab-corpus";
import { renderCorpusIndex } from "../src/lib/vocab-index";

const result = loadCorpus();
if (result.diagnostics.length > 0) {
  for (const diagnostic of result.diagnostics) {
    console.error(
      `${diagnostic.file}:${diagnostic.line}:${diagnostic.column}: ${diagnostic.message}`,
    );
  }
  process.exit(1);
}
const corpus = assertValidCorpus(result);
const output = "data/vocab-seed/README.md";
fs.writeFileSync(output, renderCorpusIndex(corpus));
console.log(`Wrote ${output} for ${corpus.chapters.length} chapters.`);
