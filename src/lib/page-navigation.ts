export type PageNavigationEntry = {
  id: number;
  page: number | null | undefined;
};

export type PageNavigationItem = {
  page: number;
  entryId: number;
};

export function isNavigablePage(page: number | null | undefined): page is number {
  return typeof page === "number" && Number.isSafeInteger(page) && page > 0;
}

/**
 * Returns one navigation target for each page, using the first entry seen for
 * that page. Invalid or missing page values are intentionally omitted.
 */
export function getPageNavigationItems(
  entries: readonly PageNavigationEntry[],
): PageNavigationItem[] {
  const firstEntryByPage = new Map<number, number>();

  for (const entry of entries) {
    if (isNavigablePage(entry.page) && !firstEntryByPage.has(entry.page)) {
      firstEntryByPage.set(entry.page, entry.id);
    }
  }

  return [...firstEntryByPage]
    .sort(([firstPage], [secondPage]) => firstPage - secondPage)
    .map(([page, entryId]) => ({ page, entryId }));
}

export function getEntryAnchorId(entryId: number): string {
  return `vocab-entry-${entryId}`;
}

/**
 * Returns the page that should be highlighted given the current scroll state.
 *
 * When the user is at the bottom of the scrollable content (isAtBottom) the
 * last page is always returned, fixing the off-by-one that occurs because the
 * final anchor can never scroll high enough to cross the viewportOffset line.
 */
export function getActivePageFromScrollState(
  items: readonly PageNavigationItem[],
  getAnchorTop: (entryId: number) => number | null,
  isAtBottom: boolean,
  viewportOffset = 160,
): number | undefined {
  if (items.length === 0) return undefined;
  if (isAtBottom) return items[items.length - 1].page;

  let activePage = items[0].page;
  for (const item of items) {
    const top = getAnchorTop(item.entryId);
    if (top !== null && top <= viewportOffset) {
      activePage = item.page;
    }
  }
  return activePage;
}
