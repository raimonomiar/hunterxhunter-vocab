"use client";

import type { VocabEntry } from "@/lib/vocab";

export default function EntryRow({
  entry,
  showLocation,
  onClick,
}: {
  entry: VocabEntry;
  showLocation?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 text-left shadow-sm active:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900 dark:active:bg-neutral-800"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-2">
            {entry.kanji && (
              <span className="text-xl font-semibold">{entry.kanji}</span>
            )}
            <span className="text-lg text-neutral-700 dark:text-neutral-300">
              {entry.kana}
            </span>
          </div>
          <div className="mt-0.5 text-base text-neutral-600 dark:text-neutral-400">
            {entry.english}
          </div>
          {entry.notes && (
            <div className="mt-1 text-sm text-neutral-500 dark:text-neutral-500">
              {entry.notes}
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {showLocation && (
            <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
              V{entry.volume} · Ch{entry.chapter}
            </span>
          )}
          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-300">
            p.{entry.page}
          </span>
        </div>
      </div>
    </button>
  );
}
