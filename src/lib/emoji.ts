export function cleanEmoji(raw: unknown, fallback: string): string {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return fallback;
  try {
    const seg = new Intl.Segmenter("pt", { granularity: "grapheme" });
    for (const { segment } of seg.segment(s)) {
      if (/\p{Extended_Pictographic}/u.test(segment)) return segment;
      break;
    }
  } catch {
    const m = s.match(/\p{Extended_Pictographic}/u);
    if (m) return m[0];
  }
  return fallback;
}
