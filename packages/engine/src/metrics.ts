/**
 * Metrics (§17) — computed from the fixture dataset at runtime; honest numbers,
 * shown including the bad ones. No figure here is hard-coded.
 */
import type { Fact, MetricBoard, VerificationAttempt, Finding, RunEvent, Institution, Document } from "@evidencegraph/domain";

export type MetricsInput = {
  institutions: Institution[];
  documents: Document[];
  facts: Fact[];
  findings: Finding[];
  verifications: VerificationAttempt[];
  runs: Record<string, RunEvent[]>;
};

/** Ground-truth extraction pairs are recorded with the fact (extractor ground_truth_*). */
export function computeMetrics(input: MetricsInput): MetricBoard {
  const { institutions, documents, facts, findings, verifications, runs } = input;

  /* field extraction accuracy per doc type: facts carry GT twins with key gt.<key> */
  const perType = new Map<string, { ok: number; total: number }>();
  for (const doc of documents) {
    const docFacts = facts.filter((f) => f.documentId === doc.id && !f.supersededBy);
    for (const f of docFacts) {
      const gt = facts.find((g) => g.key === `gt.${f.key}` && g.documentId === doc.id);
      if (!gt) continue;
      const bucket = perType.get(doc.docType) ?? { ok: 0, total: 0 };
      bucket.total += 1;
      if (String(gt.value) === String(f.value)) bucket.ok += 1;
      else bucket.ok += partialCredit(String(f.value), String(gt.value));
      perType.set(doc.docType, bucket);
    }
  }

  /* discrepancy precision/recall vs planted list: seed marks plants via fact key fault.planted.<n> */
  const planted = facts.filter((f) => /^fault\.planted\./.test(f.key));
  const plantedApplications = new Set(planted.map((f) => f.applicationId));
  const flaggedApplications = new Set(
    findings
      .filter((f) => f.findingClass === "potential_discrepancy" || f.findingClass === "anomaly_signal")
      .map((f) => f.applicationId),
  );
  const tp = [...plantedApplications].filter((id) => flaggedApplications.has(id)).length;
  const fp = findings.filter(
    (f) =>
      (f.findingClass === "potential_discrepancy" || f.findingClass === "anomaly_signal") &&
      !plantedApplications.has(f.applicationId) &&
      !f.applicationId.endsWith("CLEAN"),
  ).length;
  const precision = tp + fp === 0 ? 1 : tp / (tp + fp);
  const recall = plantedApplications.size === 0 ? 1 : tp / plantedApplications.size;

  /* false-positive rate on clean controls: high-severity findings on controls */
  const controlIds = new Set(institutions.filter((i) => i.controls).map((i) => i.id));
  const highOnControls = findings.filter((f) => controlIds.has(f.applicationId) && f.severity === "high").length;
  const controlCount = controlIds.size || 1;

  /* verification coverage: share of documents with at least one runnable check */
  const verifiable = new Set(verifications.map((v) => v.documentId));
  let covered = 0;
  for (const doc of documents) {
    if (verifiable.has(doc.id)) covered += 1;
  }

  /* explainability coverage came from the critic */
  const explainable = findings.filter((f) => f.status !== "dismissed" && f.evidence.length > 0 && f.ruleId).length;
  const explainability = findings.length === 0 ? 1 : explainable / findings.length;

  /* time per application and alert latency from run timelines */
  const times: number[] = [];
  const alertLatencies: number[] = [];
  for (const [appId, events] of Object.entries(runs)) {
    const inst = institutions.find((i) => i.id === appId);
    if (!inst) continue;
    if (events.length >= 2) {
      const t0 = Date.parse(events[0]!.startedAt);
      const t1 = Date.parse(events[events.length - 1]!.endedAt);
      times.push((t1 - t0) / 60000);
    }
    const firstCompleteness = events.find((e) => e.node === "intake");
    if (firstCompleteness) {
      alertLatencies.push((Date.parse(firstCompleteness.endedAt) - Date.parse(inst.submittedAt)) / 1000);
    }
  }

  return {
    fieldAccuracyPerDocType: [...perType.entries()].map(([docType, v]) => ({
      docType,
      accuracy: v.total === 0 ? 0 : v.ok / v.total,
      samples: v.total,
    })),
    discrepancyPrecision: round2(precision),
    discrepancyRecall: round2(recall),
    falsePositiveRate: round2(highOnControls / controlCount),
    verificationCoverage: documents.length === 0 ? 0 : covered / documents.length,
    explainabilityCoverage: round2(explainability),
    avgTimePerApplicationMinutes: times.length === 0 ? 0 : times.reduce((a, b) => a + b, 0) / times.length,
    alertLatencySeconds: {
      median: median(alertLatencies),
      p90: p90(alertLatencies),
    },
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m! - 1]! + s[m]!) / 2;
}

function p90(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.ceil(0.9 * s.length) - 1);
  return s[idx]!;
}

function partialCredit(extracted: string, truth: string): number {
  const a = extracted.toLowerCase().replace(/[^a-z0-9.]/g, "");
  const b = truth.toLowerCase().replace(/[^a-z0-9.]/g, "");
  if (a === b) return 1;
  const longer = Math.max(a.length, b.length) || 1;
  const common = [...a].filter((c, i) => c === (b[i] ?? null)).length;
  return common / longer;
}
