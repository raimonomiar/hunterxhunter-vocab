"use client";

import { FormEvent, useEffect, useId, useState } from "react";
import type { VocabEntry } from "@/lib/vocab";

export type EntryFormValues = {
  volume: number;
  chapter: number;
  kanji: string;
  kana: string;
  english: string;
  page: string;
  notes: string;
};

function toFormValues(
  volume: number,
  chapter: number,
  entry?: VocabEntry | null,
  defaultPage?: number,
): EntryFormValues {
  return {
    volume,
    chapter,
    kanji: entry?.kanji ?? "",
    kana: entry?.kana ?? "",
    english: entry?.english ?? "",
    page: entry ? String(entry.page) : defaultPage ? String(defaultPage) : "",
    notes: entry?.notes ?? "",
  };
}

export default function EntryForm({
  volume,
  chapter,
  entry,
  defaultPage,
  onCancel,
  onSubmit,
  onDelete,
}: {
  volume: number;
  chapter: number;
  entry?: VocabEntry | null;
  defaultPage?: number;
  onCancel: () => void;
  onSubmit: (values: EntryFormValues) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const [values, setValues] = useState<EntryFormValues>(() =>
    toFormValues(volume, chapter, entry, defaultPage),
  );
  const [showMore, setShowMore] = useState(
    Boolean(entry?.notes),
  );
  const [submitting, setSubmitting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formId = useId();

  useEffect(() => {
    setValues(toFormValues(volume, chapter, entry, defaultPage));
    setShowMore(Boolean(entry?.notes));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry?.id]);

  function set<K extends keyof EntryFormValues>(key: K, value: EntryFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (values.kana.trim().length === 0) {
      setError("Kana is required.");
      return;
    }
    if (values.english.trim().length === 0) {
      setError("English is required.");
      return;
    }
    const pageNum = Number(values.page);
    if (!Number.isInteger(pageNum) || pageNum < 1) {
      setError("Page must be a positive number.");
      return;
    }
    if (!Number.isInteger(values.volume) || values.volume < 1) {
      setError("Volume must be a positive number.");
      return;
    }
    if (!Number.isInteger(values.chapter) || values.chapter < 1) {
      setError("Chapter must be a positive number.");
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit(values);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4">
      <form
        onSubmit={handleSubmit}
        className="flex max-h-[92vh] w-full flex-col overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:max-w-md sm:rounded-2xl dark:bg-neutral-900"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            {entry ? "Edit entry" : "Add entry"}
          </h2>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close"
            className="rounded-full p-2 text-2xl leading-none text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            &times;
          </button>
        </div>

        <div className="mb-3 grid grid-cols-2 gap-3">
          <div>
            <label htmlFor={`${formId}-volume`} className="mb-1 block text-sm font-medium text-neutral-600 dark:text-neutral-300">
              Volume
            </label>
            <input
              id={`${formId}-volume`}
              type="number"
              inputMode="numeric"
              min={1}
              value={values.volume}
              onChange={(e) => set("volume", Number(e.target.value))}
              className="w-full rounded-lg border border-neutral-300 px-3 py-3 text-base dark:border-neutral-700 dark:bg-neutral-800"
            />
          </div>
          <div>
            <label htmlFor={`${formId}-chapter`} className="mb-1 block text-sm font-medium text-neutral-600 dark:text-neutral-300">
              Chapter
            </label>
            <input
              id={`${formId}-chapter`}
              type="number"
              inputMode="numeric"
              min={1}
              value={values.chapter}
              onChange={(e) => set("chapter", Number(e.target.value))}
              className="w-full rounded-lg border border-neutral-300 px-3 py-3 text-base dark:border-neutral-700 dark:bg-neutral-800"
            />
          </div>
        </div>

        <div className="mb-3">
          <label htmlFor={`${formId}-kanji`} className="mb-1 block text-sm font-medium text-neutral-600 dark:text-neutral-300">
            Kanji <span className="font-normal text-neutral-400">(optional)</span>
          </label>
          <input
            id={`${formId}-kanji`}
            type="text"
            autoFocus
            value={values.kanji}
            onChange={(e) => set("kanji", e.target.value)}
            className="w-full rounded-lg border border-neutral-300 px-3 py-3 text-lg dark:border-neutral-700 dark:bg-neutral-800"
            placeholder="力"
          />
        </div>

        <div className="mb-3">
          <label htmlFor={`${formId}-kana`} className="mb-1 block text-sm font-medium text-neutral-600 dark:text-neutral-300">
            Kana <span className="text-red-500">*</span>
          </label>
          <input
            id={`${formId}-kana`}
            type="text"
            required
            value={values.kana}
            onChange={(e) => set("kana", e.target.value)}
            className="w-full rounded-lg border border-neutral-300 px-3 py-3 text-lg dark:border-neutral-700 dark:bg-neutral-800"
            placeholder="ちから"
          />
        </div>

        <div className="mb-3">
          <label htmlFor={`${formId}-english`} className="mb-1 block text-sm font-medium text-neutral-600 dark:text-neutral-300">
            English <span className="text-red-500">*</span>
          </label>
          <input
            id={`${formId}-english`}
            type="text"
            required
            value={values.english}
            onChange={(e) => set("english", e.target.value)}
            className="w-full rounded-lg border border-neutral-300 px-3 py-3 text-lg dark:border-neutral-700 dark:bg-neutral-800"
            placeholder="power"
          />
        </div>

        <div className="mb-3">
          <label htmlFor={`${formId}-page`} className="mb-1 block text-sm font-medium text-neutral-600 dark:text-neutral-300">
            Page <span className="text-red-500">*</span>
          </label>
          <input
            id={`${formId}-page`}
            type="number"
            inputMode="numeric"
            required
            min={1}
            value={values.page}
            onChange={(e) => set("page", e.target.value)}
            className="w-full rounded-lg border border-neutral-300 px-3 py-3 text-lg dark:border-neutral-700 dark:bg-neutral-800"
            placeholder="5"
          />
        </div>

        {!showMore && (
          <button
            type="button"
            onClick={() => setShowMore(true)}
            className="mb-3 self-start text-sm font-medium text-blue-600 dark:text-blue-400"
          >
            + Notes
          </button>
        )}

        {showMore && (
          <>
            <div className="mb-3">
              <label htmlFor={`${formId}-notes`} className="mb-1 block text-sm font-medium text-neutral-600 dark:text-neutral-300">
                Notes <span className="font-normal text-neutral-400">(optional)</span>
              </label>
              <textarea
                id={`${formId}-notes`}
                value={values.notes}
                onChange={(e) => set("notes", e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-base dark:border-neutral-700 dark:bg-neutral-800"
              />
            </div>
          </>
        )}

        {error && (
          <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {error}
          </p>
        )}

        <div className="mt-2 flex gap-2">
          {entry && onDelete && !confirmingDelete && (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="rounded-lg px-4 py-3 text-base font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
            >
              Delete
            </button>
          )}
          {entry && onDelete && confirmingDelete && (
            <button
              type="button"
              disabled={submitting}
              onClick={async () => {
                setSubmitting(true);
                try {
                  await onDelete();
                } finally {
                  setSubmitting(false);
                }
              }}
              className="rounded-lg bg-red-600 px-4 py-3 text-base font-medium text-white disabled:opacity-50"
            >
              Confirm delete
            </button>
          )}
          <div className="flex-1" />
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg px-4 py-3 text-base font-medium text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-blue-600 px-6 py-3 text-base font-semibold text-white disabled:opacity-50"
          >
            {entry ? "Save" : "Add"}
          </button>
        </div>
      </form>
    </div>
  );
}
