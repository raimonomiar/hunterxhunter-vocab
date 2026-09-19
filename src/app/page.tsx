"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { VocabEntry, VolumeSummary } from "@/lib/vocab";
import EntryForm, { type EntryFormValues } from "@/components/EntryForm";
import EntryRow from "@/components/EntryRow";

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
  const [selectedVolume, setSelectedVolume] = useState(1);
  const [selectedChapter, setSelectedChapter] = useState(1);
  const [newChapterDraft, setNewChapterDraft] = useState<string | null>(null);

  const [chapterEntries, setChapterEntries] = useState<VocabEntry[]>([]);
  const [chapterLoading, setChapterLoading] = useState(true);

  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<VocabEntry[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);

  const [formState, setFormState] = useState<
    | { mode: "add" }
    | { mode: "edit"; entry: VocabEntry }
    | null
  >(null);

  const [error, setError] = useState<string | null>(null);

  const loadStructure = useCallback(async () => {
    const data = await fetchJson<VolumeSummary[]>("/api/structure");
    setStructure(data);
    return data;
  }, []);

  useEffect(() => {
    loadStructure().catch((err) => setError(err.message));
  }, [loadStructure]);

  const loadChapterEntries = useCallback(async (volume: number, chapter: number) => {
    setChapterLoading(true);
    try {
      const data = await fetchJson<VocabEntry[]>(
        `/api/entries?volume=${volume}&chapter=${chapter}`,
      );
      setChapterEntries(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load entries");
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
    const handle = setTimeout(() => {
      fetchJson<VocabEntry[]>(`/api/entries?q=${encodeURIComponent(trimmed)}`)
        .then((data) => setSearchResults(data))
        .catch((err) => setError(err instanceof Error ? err.message : "Search failed"))
        .finally(() => setSearchLoading(false));
    }, 250);
    return () => clearTimeout(handle);
  }, [query]);

  const currentVolumeChapters = useMemo(
    () => structure?.find((v) => v.number === selectedVolume)?.chapters ?? [],
    [structure, selectedVolume],
  );

  const chapterOptions = useMemo(() => {
    const nums = currentVolumeChapters.map((c) => c.number);
    if (newChapterDraft) {
      const n = Number(newChapterDraft);
      if (Number.isInteger(n) && !nums.includes(n)) nums.push(n);
    }
    return nums.sort((a, b) => a - b);
  }, [currentVolumeChapters, newChapterDraft]);

  const volumeOptions = useMemo(
    () => (structure ?? []).map((v) => v.number).sort((a, b) => a - b),
    [structure],
  );

  function handleSelectVolume(volume: number) {
    setSelectedVolume(volume);
    setNewChapterDraft(null);
    const chapters = structure?.find((v) => v.number === volume)?.chapters ?? [];
    setSelectedChapter(chapters[0]?.number ?? 1);
  }

  function handleAddChapter() {
    const suggested = String(
      Math.max(0, ...currentVolumeChapters.map((c) => c.number)) + 1,
    );
    const input = window.prompt("New chapter number:", suggested);
    if (!input) return;
    const num = Number(input);
    if (!Number.isInteger(num) || num < 1) {
      setError("Chapter number must be a positive whole number.");
      return;
    }
    setNewChapterDraft(String(num));
    setSelectedChapter(num);
  }

  function handleAddVolume() {
    const suggested = String(Math.max(0, ...volumeOptions) + 1);
    const input = window.prompt("New volume number:", suggested);
    if (!input) return;
    const num = Number(input);
    if (!Number.isInteger(num) || num < 1) {
      setError("Volume number must be a positive whole number.");
      return;
    }
    setSelectedVolume(num);
    setSelectedChapter(1);
  }

  async function refreshAfterMutation() {
    await Promise.all([
      loadStructure(),
      loadChapterEntries(selectedVolume, selectedChapter),
    ]);
    setNewChapterDraft(null);
    const trimmed = query.trim();
    if (trimmed.length > 0) {
      const data = await fetchJson<VocabEntry[]>(
        `/api/entries?q=${encodeURIComponent(trimmed)}`,
      );
      setSearchResults(data);
    }
  }

  async function handleCreate(values: EntryFormValues) {
    await fetchJson("/api/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        volume: values.volume,
        chapter: values.chapter,
        kanji: values.kanji,
        kana: values.kana,
        english: values.english,
        page: Number(values.page),
        notes: values.notes,
      }),
    });
    setSelectedVolume(values.volume);
    setSelectedChapter(values.chapter);
    setFormState(null);
    await refreshAfterMutation();
  }

  async function handleUpdate(id: number, values: EntryFormValues) {
    await fetchJson(`/api/entries/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        volume: values.volume,
        chapter: values.chapter,
        kanji: values.kanji,
        kana: values.kana,
        english: values.english,
        page: Number(values.page),
        notes: values.notes,
      }),
    });
    setSelectedVolume(values.volume);
    setSelectedChapter(values.chapter);
    setFormState(null);
    await refreshAfterMutation();
  }

  async function handleDelete(id: number) {
    await fetchJson(`/api/entries/${id}`, { method: "DELETE" });
    setFormState(null);
    await refreshAfterMutation();
  }

  const isSearching = query.trim().length > 0;
  const lastPageInChapter = chapterEntries.at(-1)?.page;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col px-4 pb-28 sm:px-6">
      <header className="sticky top-0 z-10 -mx-4 bg-white/90 px-4 pt-4 pb-3 backdrop-blur sm:-mx-6 sm:px-6 dark:bg-neutral-950/90">
        <h1 className="mb-3 text-xl font-bold">HxH Vocab</h1>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search kanji, kana, or English..."
          className="w-full rounded-xl border border-neutral-300 px-4 py-3 text-base dark:border-neutral-700 dark:bg-neutral-900"
        />
      </header>

      {error && (
        <div className="mb-3 flex items-center justify-between rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="font-medium">
            Dismiss
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
            <EntryRow
              key={entry.id}
              entry={entry}
              showLocation
              onClick={() => setFormState({ mode: "edit", entry })}
            />
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
              <button
                onClick={handleAddVolume}
                className="min-w-11 rounded-full bg-neutral-100 px-4 py-2 text-base font-medium text-neutral-500 dark:bg-neutral-800"
                aria-label="Add volume"
              >
                +
              </button>
            </div>
          </div>

          <div>
            <div className="mb-1 text-sm font-medium text-neutral-500">Chapter</div>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Chapter">
              {chapterOptions.length === 0 && (
                <span className="py-2 text-sm text-neutral-400">
                  No chapters yet
                </span>
              )}
              {chapterOptions.map((c) => (
                <button
                  key={c}
                  onClick={() => {
                    setSelectedChapter(c);
                    setNewChapterDraft(null);
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
              <button
                onClick={handleAddChapter}
                className="min-w-11 rounded-full bg-neutral-100 px-4 py-2 text-base font-medium text-neutral-500 dark:bg-neutral-800"
                aria-label="Add chapter"
              >
                +
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            {chapterLoading ? (
              <p className="text-sm text-neutral-500">Loading...</p>
            ) : chapterEntries.length === 0 ? (
              <div className="rounded-xl border border-dashed border-neutral-300 px-4 py-8 text-center text-neutral-500 dark:border-neutral-700">
                <p className="mb-3">
                  No entries yet in Volume {selectedVolume} Chapter {selectedChapter}.
                </p>
                <button
                  onClick={() => setFormState({ mode: "add" })}
                  className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white"
                >
                  Add first entry
                </button>
              </div>
            ) : (
              chapterEntries.map((entry) => (
                <EntryRow
                  key={entry.id}
                  entry={entry}
                  onClick={() => setFormState({ mode: "edit", entry })}
                />
              ))
            )}
          </div>
        </section>
      )}

      <button
        onClick={() => setFormState({ mode: "add" })}
        className="fixed right-5 bottom-6 z-20 flex h-16 w-16 items-center justify-center rounded-full bg-blue-600 text-3xl font-light text-white shadow-lg active:bg-blue-700"
        aria-label="Add entry"
      >
        +
      </button>

      {formState?.mode === "add" && (
        <EntryForm
          volume={selectedVolume}
          chapter={selectedChapter}
          defaultPage={lastPageInChapter}
          onCancel={() => setFormState(null)}
          onSubmit={handleCreate}
        />
      )}
      {formState?.mode === "edit" && (
        <EntryForm
          volume={formState.entry.volume}
          chapter={formState.entry.chapter}
          entry={formState.entry}
          onCancel={() => setFormState(null)}
          onSubmit={(values) => handleUpdate(formState.entry.id, values)}
          onDelete={() => handleDelete(formState.entry.id)}
        />
      )}
    </div>
  );
}
