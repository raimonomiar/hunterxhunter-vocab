# Hunter × Hunter Vocab

A personal web app for browsing and adding Japanese vocabulary while reading Hunter × Hunter. The shared, readable corpus lives in [one Markdown file per app chapter](data/vocab-seed/README.md), where readers can identify a stable entry ID and propose a focused correction.

The repository's MIT license covers original project contributions. It does not claim ownership of the manga or other third-party material; review the publication notes in [CONTRIBUTING.md](CONTRIBUTING.md) before adding contextual quotations.

## Getting started

```bash
npm install
npm run seed-vocab     # loads the committed Markdown corpus into local SQLite
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). By default the app uses a local SQLite file at `data/vocab.db` (gitignored).

## Browse and contribute

- [Vocabulary corpus index](data/vocab-seed/README.md) — browse by volume and chapter on GitHub.
- [Contribution guide](CONTRIBUTING.md) — correct a reading or gloss through a focused pull request.
- [Correction pull-request template](.github/PULL_REQUEST_TEMPLATE/correction.md) — capture the entry ID, before/after text, context, and uncertainty.

Markdown is the only maintained shared source. JSON seed files are intentionally not kept in parallel.

## Data & database synchronization

The database layer (`@libsql/client`) runs the same code against local SQLite (dev) or a remote Turso database (production) — just set `DATABASE_URL` and `DATABASE_AUTH_TOKEN` in the environment. Deploying to Vercel/Turso is a separate follow-up; see `AGENTS.md` for architecture notes and `scripts/import-vocab.ts` for the import script's behavior.

The database remains a personal working copy. Source-backed rows carry provenance and the last-applied source baseline, so shared corrections do not overwrite personal edits. Synchronization validates the complete corpus before opening a transaction, reports additions, updates, removals, personal-only rows, and conflicts, and is safe to repeat:

```bash
npm run sync-vocab -- --dry-run
npm run sync-vocab -- --apply
```

Apply refuses unresolved conflicts and refuses a stale plan if the source or database changed after the dry run. A personal deletion is retained as a tombstone and conflicts if the shared entry changes.

## Scripts

- `npm run dev` — start the dev server
- `npm run build` / `npm run start` — production build/serve
- `npm run seed-vocab` — load the canonical Markdown corpus using safe synchronization (`--dry-run` previews only)
- `npm run sync-vocab -- --dry-run|--apply` — preview or apply provenance-aware source updates
- `npm run validate-vocab` — strict Markdown and generated-index validation
- `npm test` — parser, corpus, adoption, and synchronization regression tests
- `npm run import-vocab` — legacy workbook recovery path only; it requires the uncommitted workbook and is not the normal setup path
- `npm run lint` — eslint

The committed corpus currently covers volumes 1–8, including the recovered Volume 1 chapters 1–4 workbook rows.
