/**
 * Similarity lookups (§05 Qdrant, §09): stamps and photos by precomputed
 * perceptual-hash equality. Results marked "precomputed on fixture graph /
 * MOCK" in the UI; the engine never claims a live vector store.
 */
import type { PhotoOrStampEntry } from "./types.js";

export type SimilarityPair = {
  hash: string;
  kind: string;
  applications: string[]; // application ids sharing the content
};

/** Groups of content with the same pHash across *different* institutions. */
export function nearDuplicatePairs(entries: PhotoOrStampEntry[]): SimilarityPair[] {
  const byHash = new Map<string, string[]>();
  for (const e of entries) {
    const list = byHash.get(e.hash) ?? [];
    list.push(e.applicationId);
    byHash.set(e.hash, list);
  }
  const out: SimilarityPair[] = [];
  for (const [hash, apps] of byHash) {
    const unique = [...new Set(apps)];
    if (unique.length < 2) continue;
    const kind = entries.find((e) => e.hash === hash)?.kind ?? "content";
    out.push({ hash, kind, applications: unique });
  }
  return out;
}
