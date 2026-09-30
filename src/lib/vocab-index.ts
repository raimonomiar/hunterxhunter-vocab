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
    if (volume === 7) {
      lines.push(
        "Volume 7 boundaries: Chapter 8 contains No.062 story entries for folios 149–167. Entries e0047–e0052 are preserved separately for Hisoka’s personality-chart insert on scan 168 and are not No.062 or No.063 story content. Chapter 9 contains No.063 story entries for folios 169–187.",
        "",
      );
    }
    if (volume === 8) {
      lines.push(
        "Volume 8 boundaries: Chapter 1 contains No.064 story entries for folios 7–21. Entries e0082–e0094 are preserved separately for the えじぷと旅行記その① prose insert on scan 022 and are not No.064 or No.065 story vocabulary. Chapter 2 contains No.065 story entries for folios 23–41. Entries e0072–e0096 are preserved separately for the えじぷと旅行記その② prose insert on scan 042 and are not No.065 or No.066 story vocabulary. Chapter 3 contains No.066 story entries for folios 43–61. Chapter 4 contains No.067 story entries for folios 63–75. Entries e0090–e0113 remain separate for the えじぷと旅行記その④ prose insert on scan 076. Chapter 5 contains No.068 story entries for folios 77–95. Entries e0131–e0141 remain separate for Togashi’s note about drawing card illustrations on scan 096; No.069 begins on folio 97.",
        "",
      );
    }
  }
  lines.push(
    "## Format",
    "",
    "Each entry keeps a permanent heading such as `e0001`. Edit the five labeled fields in place; keep the ID unchanged. Entry order within a page follows that page's own reading order, so a section may move to match it without changing its ID or fields. Blank Kanji and Notes fields mean null. See the repository [contribution guide](../../CONTRIBUTING.md) for correction workflow and validation rules.",
    "",
    `Corpus semantic revision: \`${corpus.revision}\``,
    "",
  );
  return lines.join("\n");
}
