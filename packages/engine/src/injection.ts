/**
 * Doc reader guard (§12): document text is untrusted data. Text that looks
 * like instructions to a model is raised as an anomaly_signal and nothing else
 * changes — the extracting model has no tools in this deployment.
 */
import type { Document } from "@evidencegraph/domain";

const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(all|any|the)\s+(previous|earlier|above)\s+(instructions|rules|prompts)/i,
  /you\s+are\s+(now\s+)?(an?\s+)?(ai|model|agent|assistant|system)/i,
  /(approve|pass|clear)\s+(this|the)\s+(application|document)/i,
  /do\s+not\s+(flag|report|mention|raise)/i,
  /system\s*(prompt|message)\s*[:;]/i,
];

export type InjectionHit = {
  documentId: string;
  applicationId: string;
  matched: string;
  page: number;
  hidden: boolean;
};

export function scanForInjection(docs: Document[]): InjectionHit[] {
  const hits: InjectionHit[] = [];
  const seen = new Set<string>(); // one report per line, even when patterns overlap
  for (const d of docs) {
    for (const p of d.pages) {
      for (const line of p.lines) {
        for (const re of INJECTION_PATTERNS) {
          const m = line.text.match(re);
          if (m) {
            const key = `${d.id}:${p.page}:${line.text}`;
            if (seen.has(key)) continue;
            seen.add(key);
            hits.push({
              documentId: d.id,
              applicationId: d.applicationId,
              matched: m[0] ?? line.text.slice(0, 60),
              page: p.page,
              hidden: !!line.hidden,
            });
          }
        }
      }
    }
  }
  return hits;
}

/** Scan free text (for example a live-uploaded PDF) and return the matched phrases, one per line. */
export function scanTextForInjection(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    for (const re of INJECTION_PATTERNS) {
      const m = line.match(re);
      if (m) {
        out.push(m[0]);
        break;
      }
    }
  }
  return out;
}
