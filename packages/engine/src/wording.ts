/**
 * Wording guard (§12 + prompt §4): never "forged", "fake" or "fraud" in UI copy,
 * findings, letters or fixtures. Neutral alternatives: anomaly signal,
 * potential discrepancy, needs verification.
 */
import { BANNED_WORDS } from "@evidencegraph/domain";

export function containsBannedWord(text: string): { word: string; index: number } | null {
  const lower = text.toLowerCase();
  for (const w of BANNED_WORDS) {
    // word-boundary match so "fake" in "fakeout" is not a hit but "fake:" is
    const re = new RegExp(`\\b${w}\\b`, "i");
    const m = re.exec(lower);
    if (m) return { word: w, index: lower.search(re) };
  }
  return null;
}

/** Guard a generated string: throws when a banned word slips in. */
export function assertNeutral(text: string, context: string): string {
  const hit = containsBannedWord(text);
  if (hit) {
    throw new Error(
      `Banned wording "${hit.word}" in ${context}. Use "anomaly signal", "potential discrepancy" or "needs verification".`,
    );
  }
  return text;
}
