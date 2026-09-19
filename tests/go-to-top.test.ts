import assert from "node:assert/strict";
import test from "node:test";
import {
  getScrollBehavior,
  GO_TO_TOP_THRESHOLD,
  shouldShowGoToTop,
} from "../src/components/GoToTopButton";

test("go-to-top visibility waits until the page has meaningfully scrolled", () => {
  assert.equal(shouldShowGoToTop(GO_TO_TOP_THRESHOLD), false);
  assert.equal(shouldShowGoToTop(GO_TO_TOP_THRESHOLD + 1), true);
});

test("go-to-top honors reduced-motion preferences", () => {
  assert.equal(getScrollBehavior(false), "smooth");
  assert.equal(getScrollBehavior(true), "auto");
});
