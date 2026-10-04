import assert from "node:assert/strict";
import test from "node:test";
import { getStructureWithExecutor } from "../src/lib/vocab";

test("chapter structure skips unused vocabulary counts and keeps empty volumes", async () => {
  let query = "";
  const db = {
    execute: async (statement: string) => {
      query = statement;
      return {
        rows: [
          { volume_number: 1, chapter_number: null },
          { volume_number: 1, chapter_number: 1 },
          { volume_number: 1, chapter_number: 2 },
          { volume_number: 2, chapter_number: 1 },
        ],
      };
    },
  } as unknown as Parameters<typeof getStructureWithExecutor>[0];

  const structure = await getStructureWithExecutor(db);

  assert.doesNotMatch(query, /vocab_entries|COUNT\s*\(/i);
  assert.deepEqual(structure, [
    { number: 1, chapters: [{ number: 1 }, { number: 2 }] },
    { number: 2, chapters: [{ number: 1 }] },
  ]);
});
