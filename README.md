# Hunter x Hunter Vocab

A personal web app for browsing and adding Japanese vocab while reading Hunter x Hunter, replacing the old shared spreadsheet (`sample/Hunter × Hunter Vocab.xlsx`).

## Getting started

```bash
npm install
npm run import-vocab   # one-time: loads the legacy spreadsheet into a local SQLite db
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). By default the app uses a local SQLite file at `data/vocab.db` (gitignored).

## Data & deployment

The database layer (`@libsql/client`) runs the same code against local SQLite (dev) or a remote Turso database (production) — just set `DATABASE_URL` and `DATABASE_AUTH_TOKEN` in the environment. Deploying to Vercel/Turso is a separate follow-up; see `AGENTS.md` for architecture notes and `scripts/import-vocab.ts` for the import script's behavior.

## Scripts

- `npm run dev` — start the dev server
- `npm run build` / `npm run start` — production build/serve
- `npm run import-vocab` — (re-)import the spreadsheet; safe to re-run, it skips chapters that already have data
- `npm run lint` — eslint
