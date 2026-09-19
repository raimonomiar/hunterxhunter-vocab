/**
 * Loads the canonical Markdown corpus into the local database through the
 * same conflict-aware transaction used by sync-vocab.
 *
 * Usage:
 *   npm run seed-vocab
 *   npm run seed-vocab -- --dry-run
 *
 * This command applies a clean plan by default for a fresh checkout. It never
 * overwrites personal edits or silently duplicates a pre-migration row.
 */
import { ready } from "../src/lib/db";
import { assertValidCorpus, loadCorpus } from "../src/lib/vocab-corpus";
import {
  applyVocabSync,
  formatSyncPlan,
  formatSyncSummary,
  planVocabSync,
} from "../src/lib/vocab-sync";

async function main(): Promise<void> {
  const result = loadCorpus();
  const corpus = assertValidCorpus(result);
  const db = await ready();
  const plan = await planVocabSync(db, corpus);
  console.log(formatSyncPlan(plan));
  if (process.argv.includes("--dry-run")) {
    if (plan.conflicts.length > 0) process.exitCode = 2;
    return;
  }
  if (plan.conflicts.length > 0) {
    throw new Error(
      "Refusing to seed while conflicts remain; run npm run sync-vocab -- --dry-run and resolve them explicitly",
    );
  }
  console.log(`\nLoaded safely: ${formatSyncSummary(await applyVocabSync(db, plan, corpus))}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
