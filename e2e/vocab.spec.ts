import { expect, test } from "@playwright/test";

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const initialStructure = [{ number: 1, chapters: [{ number: 1 }] }];
const initialEntries = [
  {
    id: 1,
    volume: 1,
    chapter: 1,
    kanji: "建物",
    kana: "たてもの",
    english: "building",
    page: 106,
    notes: null,
  },
];
const searchEntries = [{ ...initialEntries[0], english: "power" }];
const initialEntriesRequest = (url: URL) =>
  url.pathname === "/api/entries" &&
  url.searchParams.get("volume") === "1" &&
  url.searchParams.get("chapter") === "1";
const searchRequest = (url: URL) => url.pathname === "/api/entries" && url.searchParams.has("q");
const browserEntries = Array.from({ length: 16 }, (_, index) => ({
  ...initialEntries[0],
  id: index + 1,
  english: index === 0 ? "power" : `study word ${index + 1}`,
  page: 106 + index,
}));

test.beforeEach(async ({ page }) => {
  await page.route("**/api/structure", (route) => route.fulfill({ json: initialStructure }));
  await page.route(initialEntriesRequest, (route) => route.fulfill({ json: browserEntries }));
  await page.route(searchRequest, (route) => route.fulfill({ json: searchEntries }));
});

test("initial load announces progress immediately and clears after its data arrives", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });

  const structureStarted = deferred<void>();
  const entriesStarted = deferred<void>();
  const releaseStructure = deferred<void>();
  const releaseEntries = deferred<void>();

  await page.route("**/api/structure", async (route) => {
    structureStarted.resolve();
    await releaseStructure.promise;
    await route.fulfill({ json: initialStructure });
  });
  await page.route(initialEntriesRequest, async (route) => {
    entriesStarted.resolve();
    await releaseEntries.promise;
    await route.fulfill({ json: initialEntries });
  });

  try {
    await page.goto("/");
    const status = page.getByRole("status");
    await expect(status).toHaveText("Loading volumes and vocabulary…");
    await Promise.all([structureStarted.promise, entriesStarted.promise]);

    const spinner = status.locator("svg");
    await expect(spinner).toHaveClass(/motion-reduce:animate-none/);
    expect(await spinner.evaluate((element) => getComputedStyle(element).animationName)).toBe(
      "none",
    );

    releaseStructure.resolve();
    releaseEntries.resolve();
    await expect(status).toHaveCount(0);
    await expect(page.getByText("building", { exact: true })).toBeVisible();
  } finally {
    releaseStructure.resolve();
    releaseEntries.resolve();
  }
});

test("initial load errors stop the status and offer retries", async ({ page }) => {
  let structureAttempts = 0;
  let entriesAttempts = 0;
  await page.route("**/api/structure", (route) => {
    structureAttempts += 1;
    return route.fulfill({
      status: structureAttempts === 1 ? 503 : 200,
      json: structureAttempts === 1 ? { error: "Temporary API failure" } : initialStructure,
    });
  });
  await page.route(initialEntriesRequest, (route) => {
    entriesAttempts += 1;
    return route.fulfill({
      status: entriesAttempts === 1 ? 503 : 200,
      json: entriesAttempts === 1 ? { error: "Temporary API failure" } : initialEntries,
    });
  });

  await page.goto("/");
  await expect(page.getByRole("status")).toHaveCount(0);
  await expect(page.getByRole("alert").filter({ hasText: "volumes and chapters" })).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "vocabulary" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry loading volumes" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry loading vocabulary" })).toBeVisible();

  await page.getByRole("button", { name: "Retry loading volumes" }).click();
  await page.getByRole("button", { name: "Retry loading vocabulary" }).click();

  await expect(page.getByRole("button", { name: "1" })).toHaveCount(2);
  await expect(page.getByText("building", { exact: true })).toBeVisible();
  await expect(page.getByRole("status")).toHaveCount(0);
  expect(structureAttempts).toBe(2);
  expect(entriesAttempts).toBe(2);
});

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
