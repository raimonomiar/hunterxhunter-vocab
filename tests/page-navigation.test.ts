import assert from "node:assert/strict";
import test from "node:test";
import { getEntryAnchorId, getPageNavigationItems } from "../src/lib/page-navigation";

test("page navigation groups entries by page and targets the first entry", () => {
  assert.deepEqual(
    getPageNavigationItems([
      { id: 42, page: 12 },
      { id: 43, page: 12 },
      { id: 44, page: 15 },
      { id: 45, page: 14 },
    ]),
    [
      { page: 12, entryId: 42 },
      { page: 14, entryId: 45 },
      { page: 15, entryId: 44 },
    ],
  );
});

test("page navigation skips entries without usable page data", () => {
  assert.deepEqual(
    getPageNavigationItems([
      { id: 1, page: null },
      { id: 2, page: 0 },
      { id: 3, page: Number.NaN },
      { id: 4, page: 7 },
    ]),
    [{ page: 7, entryId: 4 }],
  );
});

test("page navigation targets use stable entry anchors", () => {
  assert.equal(getEntryAnchorId(42), "vocab-entry-42");
});
