import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { DELETE, PATCH } from "../src/app/api/entries/[id]/route";
import { POST } from "../src/app/api/entries/route";

const pageSource = fs.readFileSync("src/app/page.tsx", "utf8");
const entryRowSource = fs.readFileSync("src/components/EntryRow.tsx", "utf8");

test("viewer has no entry creation or editing affordances", () => {
  assert.doesNotMatch(pageSource, /EntryForm|formState|handleAdd(?:Volume|Chapter)/);
  assert.doesNotMatch(pageSource, /Add (?:first entry|entry|volume|chapter)/);
  assert.doesNotMatch(pageSource, /method:\s*["'](?:POST|PATCH|DELETE)["']/);
  assert.doesNotMatch(entryRowSource, /<button|onClick/);
});

test("entry mutation routes reject writes without touching the database", async () => {
  for (const response of [POST(), PATCH(), DELETE()]) {
    assert.equal(response.status, 405);
    assert.deepEqual(await response.json(), {
      error: "The vocabulary viewer is read-only; update Markdown and sync the database.",
    });
  }
});
