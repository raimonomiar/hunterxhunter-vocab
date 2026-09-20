import { expect, test } from "@playwright/test";

test("reader can search the corpus and return to the top while writes stay disabled", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "HxH Vocab" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add entry" })).toHaveCount(0);

  const search = page.getByPlaceholder("Search kanji, kana, or English...");
  await search.fill("power");
  await expect(page.getByText("power", { exact: true }).first()).toBeVisible();

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
