import { expect, test } from "@playwright/test";

test("reader can search the corpus and return to the top while writes stay disabled", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "HxH Vocab" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add entry" })).toHaveCount(0);

  const supportLink = page.getByRole("link", {
    name: "Support HxH Vocab on Buy Me a Coffee (opens in a new tab)",
  });
  await expect(supportLink).toBeVisible();
  await expect(supportLink).toHaveAttribute("href", "https://buymeacoffee.com/ayushkarki");
  await expect(supportLink).toHaveAttribute("target", "_blank");
  await expect(supportLink).toHaveAttribute("rel", "noopener noreferrer");
  const supportIcon = supportLink.locator("svg");
  await expect(supportIcon).toHaveAttribute("aria-hidden", "true");
  await expect(supportIcon).toHaveAttribute("focusable", "false");

  const search = page.getByPlaceholder("Search kanji, kana, or English...");
  await search.fill("power");
  await expect(page.getByText("power", { exact: true }).first()).toBeVisible();
  await expect(supportLink).toBeVisible();

  const writeResponse = await page.request.patch("/api/entries/1", {
    data: { english: "should remain read-only" },
  });
  expect(writeResponse.status()).toBe(405);

  await search.fill("");
  await expect(page.getByRole("button", { name: "Go to top" })).toBeHidden();
  await page.evaluate(() => window.scrollTo(0, 500));
  const goToTop = page.getByRole("button", { name: "Go to top" });
  await expect(goToTop).toBeVisible();
  await goToTop.click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await expect(page.locator("#page-top")).toBeFocused();
});

test("support link fits the narrow reader layout", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/");

  const supportLink = page.getByRole("link", {
    name: "Support HxH Vocab on Buy Me a Coffee (opens in a new tab)",
  });
  await expect(supportLink).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
});

test("chapter page navigation jumps to the first entry for a page", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  const navigation = page.getByRole("navigation", { name: "Chapter page navigation" });
  await expect(navigation).toBeVisible();
  const pageButtons = navigation.getByRole("button");
  await expect(pageButtons.nth(1)).toBeVisible();
  await expect(pageButtons.first()).toHaveAttribute("aria-current", "page");

  await pageButtons.nth(1).click();
  await expect(pageButtons.nth(1)).toHaveAttribute("aria-current", "page");
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
});

// Regression test for issue #23: clicking or scrolling to the last page must
// highlight the last page button, not the second-to-last.
test("chapter page navigation highlights the last page when scrolled to document bottom", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  const navigation = page.getByRole("navigation", { name: "Chapter page navigation" });
  await expect(navigation).toBeVisible();
  const pageButtons = navigation.getByRole("button");
  const count = await pageButtons.count();
  expect(count).toBeGreaterThan(1);

  const lastButton = pageButtons.last();

  // Click the last page button and confirm it becomes highlighted.
  await lastButton.click();
  await expect(lastButton).toHaveAttribute("aria-current", "page");

  // Also verify by scrolling all the way to the bottom directly.
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(lastButton).toHaveAttribute("aria-current", "page");
});
