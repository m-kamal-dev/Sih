/**
 * Triage score (§04 Reporter): computed from open findings and signal
 * strengths (strong / medium / weak). Weak signals alone can never raise
 * severity above low (§10 guardrail). Always returns listed reasons.
 */
import type { Finding, SignalStrength } from "@evidencegraph/domain";

const CLASS_WEIGHT = {
  completeness_gap: 10,
  validity_gap: 14,
  potential_discrepancy: 16,
  anomaly_signal: 12,
  confirmed_violation: 30,
} as const;

const SEVERITY_MULTIPLIER = { low: 0.4, medium: 1, high: 1.6 } as const;

/** Trap: a weak anomaly_signal can only ever count as low severity. */
export function effectiveSeverity(f: Finding, signalStrength?: SignalStrength): "low" | "medium" | "high" {
  const s = f.severity;
  if (f.findingClass === "anomaly_signal" && signalStrength === "weak" && (s === "high" || s === "medium")) {
    return "low";
  }
  return s;
}

export type TriageResult = { score: number; reasons: string[]; topReasons: string[] };

export function computeTriage(
  findings: Finding[],
  signalStrengths: Record<string, SignalStrength>,
): TriageResult {
  let score = 0;
  const counts = new Map<string, number>();
  const reasons: string[] = [];

  for (const f of findings) {
    if (f.status === "dismissed") continue;
    const strength = signalStrengths[f.id];
    const sev = effectiveSeverity(f, strength);
    const base = CLASS_WEIGHT[f.findingClass] ?? 8;
    const weight = base * SEVERITY_MULTIPLIER[sev];
    // Cross-application (graph) findings are the highest-value reasons.
    const bump = f.crossApplication ? 1.5 : 1;
    score += weight * bump;
    const label =
      f.findingClass === "anomaly_signal" && strength
        ? `${strength} anomaly signal`
        : classLabel(f.findingClass);
    counts.set(label, (counts.get(label) ?? 0) + 1);
    if (f.crossApplication) reasons.unshift(`${label} (also reported by another institution)`);
    else reasons.push(`${label}${sev !== "low" && sev !== "medium" ? " — high severity" : ""}`);
  }

  score = Math.min(100, Math.round(score));

  const ordered = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([label, n]) => `${n} ${n > 1 ? pluraliseLabel(label) : label}`);

  // Top 3 reasons get shown in the queue.
  const ranked = findings
    .filter((f) => f.status !== "dismissed")
    .sort((a, b) => {
      const sa = weightOf(a, signalStrengths);
      const sb = weightOf(b, signalStrengths);
      return sb - sa;
    })
    .slice(0, 3)
    .map((f) => shortReason(f, signalStrengths));

  return { score, reasons: ordered.length ? ordered : ["no open findings"], topReasons: ranked };
}

function weightOf(f: Finding, signalStrengths: Record<string, SignalStrength>): number {
  const sev = effectiveSeverity(f, signalStrengths[f.id]);
  return (CLASS_WEIGHT[f.findingClass] ?? 8) * SEVERITY_MULTIPLIER[sev] * (f.crossApplication ? 1.5 : 1);
}

export function shortReason(f: Finding, signalStrengths: Record<string, SignalStrength>): string {
  const strength = signalStrengths[f.id];
  const sev = effectiveSeverity(f, strength);
  return `${classLabel(f.findingClass)} (${sev}${f.crossApplication ? ", shared" : ""}): ${f.summary}`;
}

export function classLabel(c: string): string {
  return c.replace(/_/g, " ");
}

/** Plural forms for label classes shown in the queue; default adds an s. */
const PLURAL_FORMS: Record<string, string> = {
  "potential discrepancy": "potential discrepancies",
  "weak anomaly signal": "weak anomaly signals",
};

/** Returns the full plural phrase (not a suffix) so callers never double-print the noun. */
export function pluraliseLabel(label: string): string {
  return PLURAL_FORMS[label] ?? `${label}s`;
}
