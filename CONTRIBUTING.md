# Contributing vocabulary corrections

The chapter Markdown files under [`data/vocab-seed/`](data/vocab-seed/README.md) are the canonical shared vocabulary source. GitHub's file view is the public reading surface; you do not need Node.js to suggest a correction through the browser.

## Correct an entry

1. Browse the [corpus index](data/vocab-seed/README.md), open the chapter, and note the permanent entry heading (for example `e0042`) and printed page.
2. Fork the repository or create a branch, edit only the relevant chapter Markdown, and keep the entry ID and unrelated content unchanged. Preview the rendered file before opening the pull request.
3. Use dictionary-form Japanese where appropriate and a concise English gloss. Put scene-specific meaning or reading context in `Notes`; distinguish a literal meaning from an interpretation. Preserve intentional manga readings and do not infer a reading from a scan filename.
4. Open a focused pull request. State the location/entry ID, old meaning → proposed meaning, context/rationale, useful dictionary reference, fields changed, and any uncertainty. The correction template supplies these prompts.
5. A maintainer reviews Japanese reading and contextual sense. CI checks structure and round-trip safety, not translation truth; uncertainty should be discussed rather than presented as proof.

Use the printed page shown in the source material and the app's per-volume chapter path. The app chapter numbering is not the same as the manga-wide printed `No.` numbering.

## Markdown format

Each file is named `vol<V>-ch<two-digit C>.md` and begins with `# Volume V · Chapter C`. Entries are stacked sections with a stable `## eNNNN` heading and exactly these fields, in this order:

```markdown
## e0001

- Page: 106
- Kanji: 建物
- Kana: たてもの
- English: building
- Notes:
- WK level:
```

Keep IDs permanent: do not renumber after a correction, reorder, or deletion. New IDs use the next unused chapter-scoped number. Values are one logical line. Kana and English are required; blank Kanji, Notes, and WK level values represent null. Literal Markdown punctuation must be escaped as shown by the canonical writer. Do not add YAML, tables, HTML, images, links, formatting, executable content, or maintained JSON files.

Run the checks locally when practical:

```bash
npm ci
npm run validate-vocab
npm test
npm run lint
npm run typecheck
```

The pull-request workflow runs these checks with read-only permissions and no database credentials. Do not include manga scans, the original workbook, large dialogue reproductions, personal database files, or secrets.

## Database synchronization for maintainers

Markdown corrections are not silently written into an app database. After reviewing and merging a source correction, take a database backup and preview the change:

```bash
npm run sync-vocab -- --dry-run
npm run sync-vocab -- --apply
```

The dry run must be reviewed by source key and field. Apply validates the whole corpus first, verifies that the database and source revision have not changed since planning, then commits entry and provenance changes atomically. Unchanged local rows receive accepted shared corrections; locally edited rows are preserved when the source is unchanged and reported as conflicts when both sides changed. Personal-only entries remain untouched. Upstream deletions are planned explicitly and never remove a personal edit silently. Repeating synchronization is a no-op.

The first run against a pre-migration database performs exact-match adoption only. It checks all six content fields, including null WK level, and refuses to guess for edited, duplicate, unmapped, or unexplained rows. Resolve those mappings explicitly before applying.

## Licensing and publication boundary

Original code, documentation, schemas, and translation contributions to this repository are accepted under the [MIT License](LICENSE). Contributors should only submit work they have the right to share. The license does not grant rights to third-party manga artwork or text. Do not add scans or reproduce dialogue beyond the concise context needed to explain a correction; ask a maintainer when a proposed note would include more than an isolated vocabulary explanation.
