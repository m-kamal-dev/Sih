/**
 * Confidence gate (§04): fields below a per-type threshold pause the pipeline
 * and wait for an officer. The officer's answer becomes a new fact version with
 * source=human; the original is kept and marked superseded.
 * Identifiers are stricter than names (§04 guardrail).
 */
import type { Fact } from "@evidencegraph/domain";

export const CONFIDENCE_THRESHOLDS = {
  identifier: 0.9,
  count: 0.9,
  date: 0.85,
  amount: 0.85,
  area: 0.85,
  name: 0.75,
  text: 0.75,
} as const;

export type FieldKind = keyof typeof CONFIDENCE_THRESHOLDS;

export function fieldKindForFact(key: string): FieldKind {
  if (/(reg_no|survey_no|fdr|noc_number|cert_no|reference|id$)/i.test(key)) return "identifier";
  if (/(count|strength|intake)/i.test(key)) return "count";
  if (/(date|valid_until|from$|to$|year)/i.test(key)) return "date";
  if (/(amount|fee)/i.test(key)) return "amount";
  if (/(area|acreage)/i.test(key)) return "area";
  if (/(name|holder)/i.test(key)) return "name";
  return "text";
}

export function gateDecision(fact: Fact): { held: boolean; threshold: number; kind: FieldKind } {
  const kind = fieldKindForFact(fact.key);
  const threshold = CONFIDENCE_THRESHOLDS[kind];
  return { held: fact.confidence < threshold, threshold, kind };
}

export type CorrectionInput = { factId: string; correctedValue: string | number; officer: string; at: string };

/**
 * Apply an officer correction: original fact gets supersededBy and the new
 * human fact inherits everything else. Returns both, ready for the store.
 */
export function applyCorrection(
  fact: Fact,
  corrected: { value: string | number; officer: string; at: string },
): { original: Fact; replacement: Fact } {
  const newId = `${fact.id}_h1`;
  return {
    original: { ...fact, supersededBy: newId },
    replacement: {
      ...fact,
      id: newId,
      value: corrected.value,
      confidence: 1,
      extractor: `human:${corrected.officer}`,
      source: "human",
      recordedAt: corrected.at,
      supersededBy: null,
      quarantine: null,
    },
  };
}
