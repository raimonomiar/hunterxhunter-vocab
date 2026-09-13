<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

- What this is: a personal, single-user Next.js app that replaces `sample/Hunter × Hunter Vocab.xlsx` as the way the captain looks up and records vocab while reading Hunter x Hunter in Japanese. No auth — it's meant for one person.
- Data model (`src/lib/db.ts`, `src/lib/vocab.ts`): `volumes` -> `chapters` -> `vocab_entries`, one-to-many each way. A chapter's entries are just ordered by page; the old spreadsheet's week/part tabs have no equivalent here. `kana`, `english`, and `page` are required; `kanji`, `notes`, `wk_level` are nullable.
- Volumes 1-8 are seeded on schema init (`ready()` in `src/lib/db.ts`) because the captain owns those 8 physical books today. Chapters are **not** pre-seeded beyond what the import script found in the spreadsheet (volume 1, chapters 1-8) — a chapter for any other volume is created on demand via find-or-create the first time an entry is added to it (`findOrCreateChapter` in `src/lib/vocab.ts`). The volume/chapter pickers in `src/app/page.tsx` let you jump to a not-yet-existing chapter/volume number; it only persists once you actually save an entry there.
- DB layer is `@libsql/client`, chosen so the same code runs against a local SQLite file in dev and a remote Turso database in production via env vars alone: `DATABASE_URL` (default `file:./data/vocab.db`) and `DATABASE_AUTH_TOKEN`. No migration tool — `ready()` runs idempotent `CREATE TABLE IF NOT EXISTS` on first use per process. The local dev DB file is gitignored; delete `data/vocab.db` to reset it.
- One-time spreadsheet import: `npm run import-vocab` (`scripts/import-vocab.ts`). It's chapter-idempotent — it skips any chapter that already has rows, so re-running it after the app has real data is a no-op rather than a duplicate import. It targets `sample/Hunter × Hunter Vocab.xlsx` by default; pass a different path as `argv[2]`. It skips the `Guidelines` tab, discards fully-empty formatting rows, forward-fills a missing page number from the previous row in the same sheet (the spreadsheet's contributors left repeated page numbers blank rather than retype them), and drops the handful of rows missing a required field (kana or english) rather than inventing data — see its module comment for the exact rules.
- Vocab beyond the spreadsheet's real data (which stops at volume 1 chapter 4) ships as committed JSON, not by hand-entry through the UI: one file per chapter at `data/vocab-seed/vol<V>-ch<C>.json` (array of `NewEntryInput`-shaped objects, no `volume`/`chapter` fields — those come from the filename). Load every seed file with `npm run seed-vocab` (`scripts/load-vocab-seed.ts`); it's chapter-idempotent the same way `import-vocab` is, so re-running after pulling new chapters only loads what's new. Deriving a new chapter's entries means reading the actual manga scan locally (never commit those images — see the `.gitignore` rule for the exact scan path) and writing dictionary-form, Jisho-style entries at roughly the density of the spreadsheet's more mature chapters (volume 1 chapter 4 is the calibration reference: ~7 entries/page on text-heavy pages, 0 on art-only or title-splash pages), not literally every word on the page. Sharp edge: that `.gitignore` rule has a trailing slash, so it only matches a real directory — when the scan folder is provisioned as a symlink (e.g. into a worktree), it is *not* actually ignored (`git check-ignore` returns nothing). Always `git add` the specific seed file by path; never `git add -A`/`git add .` while the scan folder is present.
- `next.config.ts` sets `devIndicators: false` because the dev-mode build badge is fixed bottom-left and overlapped the entry form's Delete button on phone-width viewports, which matters here since one-handed phone use next to the physical book is this app's primary use case.
- Explicitly out of scope per the original brief (ask before building any of these): user accounts/auth, spaced-repetition/flashcard/quiz mode, "mark as known" tracking, CSV/spreadsheet export, furigana-rendering helpers, and any actual Vercel/Turso deployment.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
