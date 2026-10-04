"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { VocabEntry, VolumeSummary } from "@/lib/vocab";
import { getPageNavigationItems } from "@/lib/page-navigation";
import EntryRow from "@/components/EntryRow";
import GoToTopButton from "@/components/GoToTopButton";
import PageNavigator from "@/components/PageNavigator";

const SUPPORT_URL = "https://buymeacoffee.com/ayushkarki";

async function fetchJson<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error || `Request failed (${res.status})`);
  }
  return res.json();
}

export default function Home() {
  const [structure, setStructure] = useState<VolumeSummary[] | null>(null);
  const [structureLoading, setStructureLoading] = useState(true);
  const [structureError, setStructureError] = useState<string | null>(null);
  const [selectedVolume, setSelectedVolume] = useState(1);
  const [selectedChapter, setSelectedChapter] = useState(1);

  const [chapterEntries, setChapterEntries] = useState<VocabEntry[]>([]);
  const [chapterLoading, setChapterLoading] = useState(true);
  const [chapterError, setChapterError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState<number | null>(null);

  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<VocabEntry[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);

  const [searchError, setSearchError] = useState<string | null>(null);

  const loadStructure = useCallback(async () => {
    setStructureLoading(true);
    setStructureError(null);
    try {
      const data = await fetchJson<VolumeSummary[]>("/api/structure");
      setStructure(data);
    } catch (err) {
      setStructureError(err instanceof Error ? err.message : "Failed to load chapters");
    } finally {
      setStructureLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStructure();
  }, [loadStructure]);

  const loadChapterEntries = useCallback(async (volume: number, chapter: number) => {
    setChapterLoading(true);
    setChapterError(null);
    setCurrentPage(null);
    try {
      const data = await fetchJson<VocabEntry[]>(
        `/api/entries?volume=${volume}&chapter=${chapter}`,
      );
      setChapterEntries(data);
    } catch (err) {
      setChapterError(err instanceof Error ? err.message : "Failed to load entries");
    } finally {
      setChapterLoading(false);
    }
  }, []);

  useEffect(() => {
    loadChapterEntries(selectedVolume, selectedChapter);
  }, [selectedVolume, selectedChapter, loadChapterEntries]);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      setSearchResults(null);
      return;
    }
    setSearchLoading(true);
    setSearchError(null);
    const handle = setTimeout(() => {
      fetchJson<VocabEntry[]>(`/api/entries?q=${encodeURIComponent(trimmed)}`)
        .then((data) => setSearchResults(data))
        .catch((err) => setSearchError(err instanceof Error ? err.message : "Search failed"))
        .finally(() => setSearchLoading(false));
    }, 250);
    return () => clearTimeout(handle);
  }, [query]);

  const currentVolumeChapters = useMemo(
    () => structure?.find((v) => v.number === selectedVolume)?.chapters ?? [],
    [structure, selectedVolume],
  );

  const chapterOptions = useMemo(() => {
    return currentVolumeChapters.map((c) => c.number).sort((a, b) => a - b);
  }, [currentVolumeChapters]);

  const volumeOptions = useMemo(
    () => (structure ?? []).map((v) => v.number).sort((a, b) => a - b),
    [structure],
  );

  const pageNavigationItems = useMemo(
    () => getPageNavigationItems(chapterEntries),
    [chapterEntries],
  );

  function handleSelectVolume(volume: number) {
    setSelectedVolume(volume);
    const chapters = structure?.find((v) => v.number === volume)?.chapters ?? [];
    setSelectedChapter(chapters[0]?.number ?? 1);
  }

  const handleCurrentPageChange = useCallback((page: number) => {
    setCurrentPage((current) => (current === page ? current : page));
  }, []);

  const isSearching = query.trim().length > 0;
  const loadingStatus = structureLoading
    ? chapterLoading
      ? "Loading volumes and vocabulary…"
      : "Loading volumes…"
    : chapterLoading
      ? "Loading vocabulary…"
      : null;

  return (
    <main
      id="page-top"
      tabIndex={-1}
      aria-labelledby="page-title"
      aria-busy={!isSearching && loadingStatus !== null}
      className="mx-auto flex min-h-screen w-full max-w-2xl flex-col px-4 pb-28 outline-none min-[360px]:pr-28 sm:px-6 lg:pr-0"
    >
      <header className="sticky top-0 z-10 -mx-4 bg-white/90 px-4 pt-4 pb-3 backdrop-blur sm:-mx-6 sm:px-6 dark:bg-neutral-950/90">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h1 id="page-title" className="text-xl font-bold">
            HxH Vocab
          </h1>
          <a
            href={SUPPORT_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Support HxH Vocab on Buy Me a Coffee (opens in a new tab)"
            className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium text-blue-700 hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 dark:text-blue-300 dark:hover:bg-blue-950 dark:focus-visible:outline-blue-400"
          >
            <svg
              aria-hidden="true"
              focusable="false"
              viewBox="0 0 24 24"
              className="size-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 8h10v5a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4V8Z" />
              <path d="M15 10h1.5a2.5 2.5 0 0 1 0 5H15" />
              <path d="M8 4.5c0 1 .75 1 .75 2M11.5 4.5c0 1 .75 1 .75 2M4 20h14" />
            </svg>
            <span className="sm:hidden">Support</span>
            <span className="hidden sm:inline">Buy me a coffee</span>
          </a>
        </div>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search kanji, kana, or English..."
          className="w-full rounded-xl border border-neutral-300 px-4 py-3 text-base dark:border-neutral-700 dark:bg-neutral-900"
        />
      </header>

      {!isSearching && loadingStatus && (
        <p
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="mb-3 flex items-center gap-2 px-1 text-sm text-neutral-500"
        >
          <svg
            aria-hidden="true"
            focusable="false"
            viewBox="0 0 24 24"
            className="size-4 shrink-0 animate-spin motion-reduce:animate-none"
            fill="none"
          >
            <circle
              cx="12"
              cy="12"
              r="9"
              stroke="currentColor"
              strokeOpacity="0.25"
              strokeWidth="3"
            />
            <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" />
          </svg>
          <span>{loadingStatus}</span>
        </p>
      )}

      {searchError && (
        <div className="mb-3 flex items-center justify-between rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          <span>{searchError}</span>
          <button onClick={() => setSearchError(null)} className="font-medium">
            Dismiss
          </button>
        </div>
      )}

      {structureError && (
        <div
          role="alert"
          className="mb-3 flex items-center justify-between gap-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300"
        >
          <span>Couldn’t load volumes and chapters: {structureError}</span>
          <button onClick={() => void loadStructure()} className="shrink-0 font-medium underline">
            Retry loading volumes
          </button>
        </div>
      )}

      {isSearching ? (
        <section className="flex flex-col gap-2">
          <p className="text-sm text-neutral-500">
            {searchLoading
              ? "Searching..."
              : `${searchResults?.length ?? 0} result${searchResults?.length === 1 ? "" : "s"}`}
          </p>
          {(searchResults ?? []).map((entry) => (
            <EntryRow key={entry.id} entry={entry} showLocation />
          ))}
        </section>
      ) : (
        <section className="flex flex-col gap-4">
          <div>
            <div className="mb-1 text-sm font-medium text-neutral-500">Volume</div>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Volume">
              {volumeOptions.map((v) => (
                <button
                  key={v}
                  onClick={() => handleSelectVolume(v)}
                  className={`min-w-11 rounded-full px-4 py-2 text-base font-medium ${
                    v === selectedVolume
                      ? "bg-blue-600 text-white"
                      : "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-1 text-sm font-medium text-neutral-500">Chapter</div>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Chapter">
              {chapterOptions.length === 0 && !structureLoading && !structureError && (
                <span className="py-2 text-sm text-neutral-400">No chapters yet</span>
              )}
              {chapterOptions.map((c) => (
                <button
                  key={c}
                  onClick={() => {
                    setSelectedChapter(c);
                  }}
                  className={`min-w-11 rounded-full px-4 py-2 text-base font-medium ${
                    c === selectedChapter
                      ? "bg-blue-600 text-white"
                      : "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            {chapterError ? (
              <div
                role="alert"
                className="flex items-center justify-between gap-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300"
              >
                <span>Couldn’t load vocabulary: {chapterError}</span>
                <button
                  onClick={() => void loadChapterEntries(selectedVolume, selectedChapter)}
                  className="shrink-0 font-medium underline"
                >
                  Retry loading vocabulary
                </button>
              </div>
            ) : chapterLoading ? null : chapterEntries.length === 0 ? (
              <div className="rounded-xl border border-dashed border-neutral-300 px-4 py-8 text-center text-neutral-500 dark:border-neutral-700">
                <p>
                  No entries in Volume {selectedVolume} Chapter {selectedChapter}.
                </p>
              </div>
            ) : (
              <>
                <PageNavigator
                  items={pageNavigationItems}
                  currentPage={currentPage}
                  onCurrentPageChange={handleCurrentPageChange}
                />
                {chapterEntries.map((entry) => (
                  <EntryRow key={entry.id} entry={entry} />
                ))}
              </>
            )}
          </div>
        </section>
      )}

      <GoToTopButton />
    </main>
  );
}
