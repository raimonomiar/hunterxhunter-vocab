import type { CorpusSource } from "@/lib/vocab-markdown";

export function renderCorpusIndex(corpus: CorpusSource): string {
  const lines = [
    "# Hunter × Hunter vocabulary corpus",
    "",
    "These chapter files are the canonical, readable source for the shared vocabulary. GitHub renders them directly so a reader can find an entry ID, page, Japanese form, and English gloss without running the app.",
    "",
    "## Coverage",
    "",
    `- ${corpus.chapters.length} app chapters`,
    `- ${corpus.chapters.reduce((total, chapter) => total + chapter.entries.length, 0).toLocaleString("en-US")} entries`,
    `- Volumes ${[...new Set(corpus.chapters.map((chapter) => chapter.volume))].sort((a, b) => a - b).join(", ")}`,
    "",
    "## Chapter index",
    "",
  ];
  const volumes = [...new Set(corpus.chapters.map((chapter) => chapter.volume))].sort(
    (a, b) => a - b,
  );
  for (const volume of volumes) {
    lines.push(`### Volume ${volume}`, "");
    for (const chapter of corpus.chapters.filter((item) => item.volume === volume)) {
      const filename = `vol${chapter.volume}-ch${String(chapter.chapter).padStart(2, "0")}.md`;
      lines.push(
        `- [Chapter ${chapter.chapter}](./${filename}) — ${chapter.entries.length} entries`,
      );
    }
    lines.push("");
  }
  lines.push(
    "## Format",
    "",
    "Each entry keeps a permanent heading such as `e0001`. Edit the five labeled fields in place; keep the ID and unrelated entries unchanged. Blank Kanji and Notes fields mean null. See the repository [contribution guide](../../CONTRIBUTING.md) for correction workflow and validation rules.",
    "",
    `Corpus semantic revision: \`${corpus.revision}\``,
    "",
  );
  return lines.join("\n");
}
