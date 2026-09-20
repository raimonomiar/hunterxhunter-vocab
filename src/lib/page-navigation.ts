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
