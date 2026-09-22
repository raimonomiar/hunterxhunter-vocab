import assert from "node:assert/strict";
import test from "node:test";
import {
  getActivePageFromScrollState,
  getEntryAnchorId,
  getPageNavigationItems,
  type PageNavigationItem,
} from "../src/lib/page-navigation";

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

// Regression test for issue #23: last-page highlight off-by-one.
// At maximum scroll the last anchor cannot reach the viewportOffset threshold,
// so without the isAtBottom guard the highlight lands on the second-to-last page.
test("getActivePageFromScrollState highlights the last page when at bottom of scroll", () => {
  const items: PageNavigationItem[] = [
    { page: 1, entryId: 10 },
    { page: 2, entryId: 20 },
    { page: 3, entryId: 30 },
  ];

  // Simulate: pages 1 and 2 have scrolled past; page 3 anchor is below the
  // 160px offset (document cannot scroll any further to bring it up).
  const anchorTops: Record<number, number> = { 10: -800, 20: 50, 30: 300 };
  const getAnchorTop = (entryId: number) => anchorTops[entryId] ?? null;

  // Not at bottom: page 2 is the last one whose anchor crosses the offset.
  assert.equal(getActivePageFromScrollState(items, getAnchorTop, false), 2);

  // At bottom: must return the last page regardless of anchor positions.
  assert.equal(getActivePageFromScrollState(items, getAnchorTop, true), 3);
});

test("getActivePageFromScrollState selects first page when nothing has scrolled past offset", () => {
  const items: PageNavigationItem[] = [
    { page: 1, entryId: 1 },
    { page: 2, entryId: 2 },
  ];
  // Both anchors below viewport offset — only page 1 (the default) should be selected.
  const getAnchorTop = () => 400;
  assert.equal(getActivePageFromScrollState(items, getAnchorTop, false), 1);
});

test("getActivePageFromScrollState returns undefined for empty items", () => {
  assert.equal(getActivePageFromScrollState([], () => null, false), undefined);
  assert.equal(getActivePageFromScrollState([], () => null, true), undefined);
});
