"use client";

import { useEffect } from "react";
import { getEntryAnchorId, type PageNavigationItem } from "@/lib/page-navigation";
import { getScrollBehavior } from "@/components/GoToTopButton";

type PageNavigatorProps = {
  items: readonly PageNavigationItem[];
  currentPage: number | null;
  onCurrentPageChange: (page: number) => void;
};

export default function PageNavigator({
  items,
  currentPage,
  onCurrentPageChange,
}: PageNavigatorProps) {
  useEffect(() => {
    function handleScroll() {
      let visiblePage = items[0]?.page;
      const viewportOffset = 160;

      for (const item of items) {
        const entry = document.getElementById(getEntryAnchorId(item.entryId));
        if (entry && entry.getBoundingClientRect().top <= viewportOffset) {
          visiblePage = item.page;
        }
      }

      if (visiblePage !== undefined) onCurrentPageChange(visiblePage);
    }

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [items, onCurrentPageChange]);

  if (items.length === 0) return null;

  function handlePageClick(item: PageNavigationItem) {
    const target = document.getElementById(getEntryAnchorId(item.entryId));
    if (!target) return;

    onCurrentPageChange(item.page);
    target.scrollIntoView({
      behavior: getScrollBehavior(window.matchMedia("(prefers-reduced-motion: reduce)").matches),
      block: "start",
    });
  }

  return (
    <nav
      aria-label="Chapter page navigation"
      className="mb-1 rounded-xl border border-neutral-200 bg-white/95 p-2 shadow-sm backdrop-blur dark:border-neutral-800 dark:bg-neutral-900/95 min-[360px]:fixed min-[360px]:right-2 min-[360px]:top-28 min-[360px]:bottom-20 min-[360px]:z-20 min-[360px]:mb-0 min-[360px]:flex min-[360px]:w-24 min-[360px]:flex-col min-[360px]:overflow-hidden lg:right-4 lg:top-20 lg:bottom-20 lg:w-28"
    >
      <div className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">
        Pages
      </div>
      <ol className="grid grid-cols-3 content-start gap-1 overflow-y-auto min-[360px]:min-h-0 min-[360px]:flex-1">
        {items.map((item) => {
          const isCurrent = item.page === currentPage;
          return (
            <li key={item.page}>
              <button
                type="button"
                aria-current={isCurrent ? "page" : undefined}
                aria-label={`Go to page ${item.page}`}
                onClick={() => handlePageClick(item)}
                className={`flex min-h-9 w-full items-center justify-center rounded-lg px-1 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-700 dark:focus-visible:outline-blue-400 ${
                  isCurrent
                    ? "bg-blue-600 text-white"
                    : "text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
                }`}
              >
                {item.page}
              </button>
            </li>
          );
        })}
      </ol>
      <span className="sr-only" aria-live="polite">
        {currentPage === null ? "" : `Current page ${currentPage}`}
      </span>
    </nav>
  );
}
