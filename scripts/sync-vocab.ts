import { ready } from "../src/lib/db";
import { assertValidCorpus, loadCorpus } from "../src/lib/vocab-corpus";
import {
  applyVocabSync,
  formatSyncPlan,
  formatSyncSummary,
  planVocabSync,
} from "../src/lib/vocab-sync";

function sourceDirectory(): string | undefined {
  const value = process.argv.find((argument) => argument.startsWith("--source-dir="));
  return value?.slice("--source-dir=".length);
}

async function main(): Promise<void> {
  const wantsApply = process.argv.includes("--apply");
  const wantsDryRun = process.argv.includes("--dry-run");
  if (wantsApply && wantsDryRun) {
    throw new Error("Choose exactly one of --dry-run or --apply");
  }
  const result = loadCorpus(sourceDirectory());
  const corpus = assertValidCorpus(result);
  const db = await ready();
  const plan = await planVocabSync(db, corpus);
  console.log(formatSyncPlan(plan));
  if (!wantsApply) {
    console.log("\nDry run only. Re-run with --apply after reviewing the plan.");
    if (plan.conflicts.length > 0) process.exitCode = 2;
    return;
  }
  if (plan.conflicts.length > 0) {
    throw new Error("Refusing --apply while synchronization conflicts remain");
  }
  const summary = await applyVocabSync(db, plan, corpus);
  console.log(`\nApplied safely: ${formatSyncSummary(summary)}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
