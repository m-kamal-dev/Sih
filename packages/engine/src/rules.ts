/**
 * Rule engine (§08): load YAML rule packs, evaluate `assert` with the safe
 * expression evaluator, map outcomes to findings, and run every rule's
 * `tests:` block. A rule without tests fails the build.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import YAML from "yaml";
import type { Fact, FindingClass, Rule, RuleResult, Severity, ApplicationCategory } from "@evidencegraph/domain";
import { CHECKLIST_VERSION } from "@evidencegraph/domain";
import { evalExpr, MissingFactError, ExprError, validateExpr } from "./expr.js";
import { CONFIDENCE_THRESHOLDS, fieldKindForFact } from "./confidence.js";

/* ---------------- Load ---------------- */

function hydrateRule(raw: Record<string, unknown>): Rule {
  const aphRef = String(raw.aph_ref ?? "");
  return {
    id: String(raw.id),
    version: Number(raw.version ?? 1),
    aphRef,
    categories: (raw.applies_to && (raw.applies_to as Record<string, string[]>).categories
      ? (raw.applies_to as Record<string, string[]>).categories
      : ["EOA", "INTAKE_INCREASE", "NEW_PROGRAMME"]) as ApplicationCategory[],
    sessions: ((raw.applies_to as Record<string, string[]> | undefined)?.sessions ?? ["2026-27"]) as string[],
    inputs: (raw.inputs ?? []) as Rule["inputs"],
    assert: String(raw.assert),
    checklistItem: raw.checklist_item
      ? {
          slot: String((raw.checklist_item as Record<string, unknown>).slot ?? ""),
          docType: String((raw.checklist_item as Record<string, unknown>).doc_type ?? ""),
        }
      : undefined,
    graphQuery: raw.graph_query ? String(raw.graph_query) : undefined,
    onFail: {
      class: ((raw.on_fail as Record<string, string> | undefined)?.class ?? "") as FindingClass,
      severity: ((raw.on_fail as Record<string, string> | undefined)?.severity ?? "") as Severity,
      message: ((raw.on_fail as Record<string, string> | undefined)?.message ?? "") as string,
    },
    onInsufficientEvidence: raw.on_insufficient_evidence
      ? {
          route: ((raw.on_insufficient_evidence as Record<string, string>).route ?? "field_review") as
            | "field_review"
            | "manual_queue"
            | "drop",
          message: (raw.on_insufficient_evidence as Record<string, string> | undefined)?.message,
        }
      : undefined,
    tests: ((raw.tests ?? []) as Rule["tests"]).map((t) => ({
      name: String(t.name),
      facts: t.facts as Rule["tests"][number]["facts"],
      expect: t.expect as Rule["tests"][number]["expect"],
    })),
    kind: raw.kind === "graph" ? "graph" : "facts",
    clauseConfirmed: !aphRef.includes("[fill in"),
  };
}

export function parseRuleYaml(text: string, file?: string): Rule {
  let doc: unknown;
  try {
    doc = YAML.parse(text);
  } catch (e) {
    throw new RuleLoadError(`${file ?? "rule"}: YAML parse error: ${String(e)}`);
  }
  if (!doc || typeof doc !== "object") throw new RuleLoadError(`${file ?? "rule"}: empty document`);
  const docObj = doc as Record<string, unknown>;
  if (typeof docObj.id !== "string" || docObj.id.trim() === "") {
    throw new RuleLoadError(`${file ?? "rule"}: missing id`);
  }
  const rule = hydrateRule(docObj);
  assertRuleIsValid(rule, file);
  return rule;
}

/** Serialise a rule back to editable YAML (the Rules editor round-trips this). */
export function stringifyRuleYaml(rule: Rule): string {
  return YAML.stringify({
    id: rule.id,
    version: rule.version,
    aph_ref: rule.aphRef,
    applies_to: { categories: rule.categories, sessions: rule.sessions },
    inputs: rule.inputs.map((input) => ({
      fact: input.fact,
      ...(input.min_confidence !== undefined ? { min_confidence: input.min_confidence } : {}),
      ...(input.required !== undefined ? { required: input.required } : {}),
    })),
    assert: rule.assert,
    ...(rule.checklistItem
      ? { checklist_item: { slot: rule.checklistItem.slot, doc_type: rule.checklistItem.docType } }
      : {}),
    ...(rule.graphQuery ? { graph_query: rule.graphQuery } : {}),
    on_fail: {
      class: rule.onFail.class,
      severity: rule.onFail.severity,
      message: rule.onFail.message,
    },
    ...(rule.onInsufficientEvidence
      ? {
          on_insufficient_evidence: {
            route: rule.onInsufficientEvidence.route,
            ...(rule.onInsufficientEvidence.message ? { message: rule.onInsufficientEvidence.message } : {}),
          },
        }
      : {}),
    ...(rule.kind === "graph" ? { kind: "graph" } : {}),
    tests: rule.tests.map((test) => ({
      name: test.name,
      facts: test.facts,
      expect: test.expect,
    })),
  }, { lineWidth: 0 });
}

export class RuleLoadError extends Error {}

export function assertRuleIsValid(rule: Rule, file?: string): void {
  const where = file ?? rule.id;
  if (!rule.id) throw new RuleLoadError(`${where}: missing id`);
  if (rule.tests.length === 0) {
    throw new RuleLoadError(`${where}: rule has no tests — a rule without tests fails the build`);
  }
  const check = validateExpr(rule.assert);
  if (!check.ok) {
    throw new RuleLoadError(`${where}: assert does not parse: ${check.error}`);
  }
  if (!rule.onFail.class) throw new RuleLoadError(`${where}: on_fail.class missing`);
  /* Confidence config is centralised (confidence.ts): a rule input never
   * relaxes the central per-field-type threshold. */
  for (const input of rule.inputs) {
    const required = CONFIDENCE_THRESHOLDS[fieldKindForFact(input.fact)];
    const given = (input as { min_confidence?: number }).min_confidence;
    if (typeof given === "number" && given < required) {
      throw new RuleLoadError(`${where}: input ${input.fact} sets min_confidence ${given} below the central threshold ${required} for its field type`);
    }
  }
}

/** Load every `*.yaml` in a rule-pack directory. Throws when any file is unwell. */
export function loadRulePack(dir: string): Rule[] {
  if (!fs.existsSync(dir)) throw new RuleLoadError(`rule pack directory missing: ${dir}`);
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
    .sort();
  if (files.length === 0) throw new RuleLoadError(`no YAML rules found in ${dir}`);
  const rules: Rule[] = [];
  for (const f of files) {
    rules.push(parseRuleYaml(fs.readFileSync(path.join(dir, f), "utf8"), path.join(dir, f)));
  }
  // Unique ids across the pack.
  const seen = new Map<string, number>();
  for (const r of rules) {
    if (seen.has(r.id)) throw new RuleLoadError(`duplicate rule id ${r.id}`);
    seen.set(r.id, 1);
  }
  return rules;
}

/* ---------------- Run ---------------- */

export type FactIndex = {
  /** latest, non-superseded facts keyed by fact key */
  byKey: Map<string, Fact[]>;
  /** all facts (incl. superseded) for evidence lineage */
  all: Map<string, Fact>;
  graphOverlap?: GraphOverlap;
  session: string;
  category: ApplicationCategory;
  applicationId: string;
  /** deterministic intake-check timestamp used on absence receipts */
  intakeAt: string;
};

/** result of the in-memory graph queries, shared with graph-type rules */
export type GraphOverlap = {
  ghostFacultyPairs: Array<{ personId: string; display: string; institutions: string[]; institutionIds: string[]; sourceDocs: string[] }>;
  recycledLandPairs: Array<{ parcelId: string; display: string; institutions: string[]; institutionIds: string[] }>;
  reusedFdrPairs: Array<{ fdrId: string; display: string; institutions: string[]; institutionIds: string[] }>;
};

export function buildFactIndex(
  facts: Fact[],
  category: ApplicationCategory,
  session: string,
  applicationId: string,
  graphOverlap?: GraphOverlap,
): FactIndex {
  const byKey = new Map<string, Fact[]>();
  for (const f of facts) {
    if (f.supersededBy) continue;
    const list = byKey.get(f.key) ?? [];
    list.push(f);
    byKey.set(f.key, list);
  }
  const all = new Map(facts.map((f) => [f.id, f]));
  return { byKey, all, graphOverlap, session, category, applicationId, intakeAt: "2026-01-01T00:00:00Z" };
}

/** Resolve an input fact: latest recorded value for the key (optionally confidence-gated). */
export function resolveInput(
  ctx: FactIndex,
  key: string,
  minConfidence?: number,
): { value: unknown; fact?: Fact; insufficient: boolean } {
  const list = ctx.byKey.get(key) ?? [];
  const fact = list.sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))[0];
  if (!fact) return { value: null, insufficient: true };
  if (minConfidence != null && fact.confidence < minConfidence) return { value: fact.value, fact, insufficient: true };
  if (fact.quarantine) return { value: fact.value, fact, insufficient: true };
  return { value: fact.value, fact, insufficient: false };
}

function template(msg: string, ctx: FactIndex, used: Fact[]): string {
  return msg.replace(/\{([a-z0-9_.]+)\}/gi, (_m, key: string) => {
    if (key.toLowerCase().includes("session")) return ctx.session;
    const fact = used.find((f) => f.key === key);
    if (!fact) return key;
    return `${fact.value}${fact.unit ? " " + fact.unit : ""}`;
  });
}

/** Mint a typed absence receipt; only rules that declare their checklist item may. */
function absenceReceipt(rule: Rule, ctx: FactIndex): RuleResult["evidence"][number] | null {
  if (!rule.checklistItem) return null;
  return {
    kind: "absence_receipt",
    checklist_slot: rule.checklistItem.slot,
    expected_doc_type: rule.checklistItem.docType,
    checklist_version: CHECKLIST_VERSION,
    checked_at: ctx.intakeAt,
  };
}

export function runRule(rule: Rule, ctx: FactIndex): RuleResult {
  const base = {
    ruleId: rule.id,
    ruleVersion: rule.version,
    category: ctx.category,
    sessionId: ctx.session,
    aphRef: rule.aphRef,
  };
  if (rule.kind === "graph") return runGraphRule(rule, ctx, base);

  const used: Fact[] = [];
  const vars: Record<string, string | number | boolean | null> = {};
  let insufficient = false;
  for (const input of rule.inputs) {
    const r = resolveInput(ctx, input.fact, input.min_confidence);
    if (r.insufficient) {
      const factMissing = !r.fact;
      if (factMissing && input.required) {
        // presence rule: the item is missing → on_fail (not mere insufficiency)
        return {
          ...base,
          outcome: "fail",
          message: template(rule.onFail.message, ctx, used),
          findingClass: rule.onFail.class,
          severity: rule.onFail.severity,
          evidence: [],
        };
      }
      if (factMissing && /present|has_fact|required\(/.test(rule.assert) && rule.onFail.class === "completeness_gap") {
        // Typed absence receipt — validity is checked by the Critic against the
        // checklist definition and the documents filed in that slot.
        const receipt = absenceReceipt(rule, ctx);
        if (receipt) {
          return {
            ...base,
            outcome: "fail",
            message: template(rule.onFail.message, ctx, used),
            findingClass: rule.onFail.class,
            severity: rule.onFail.severity,
            evidence: [receipt],
          };
        }
      }
      insufficient = true;
    }
    if (r.fact) used.push(r.fact);
    vars[input.fact] = (r.value as string | number | boolean | null) ?? null;
  }
  if (insufficient) {
    return {
      ...base,
      outcome: "insufficient_evidence",
      message: rule.onInsufficientEvidence?.message ?? "Insufficient evidence — routed to field review",
      findingClass: null,
      severity: null,
      evidence: used.map((f) => ({ kind: "fact_ref" as const, factId: f.id, page: f.page ?? null, bbox: f.bbox ?? null, cropKey: null, role: "input" })),
    };
  }
  let outcome: boolean | "missing";
  try {
    outcome = Boolean(evalExpr(rule.assert, vars));
  } catch (e) {
    if (e instanceof MissingFactError) {
      // `required(key == value)` style presence checks land here
      return {
        ...base,
        outcome: "fail",
        message: template(rule.onFail.message, ctx, used),
        findingClass: rule.onFail.class,
        severity: rule.onFail.severity,
        evidence: used.map((f) => ({ kind: "fact_ref" as const, factId: f.id, page: f.page ?? null, bbox: f.bbox ?? null, cropKey: null, role: "input" })),
      };
    }
    if (e instanceof ExprError && /Cannot order null/.test(e.message)) {
      return {
        ...base,
        outcome: "insufficient_evidence",
        message: "Input missing — routed to field review",
        findingClass: null,
        severity: null,
        evidence: used.map((f) => ({ kind: "fact_ref" as const, factId: f.id, page: f.page ?? null, bbox: f.bbox ?? null, cropKey: null, role: "input" })),
      };
    }
    // The rule itself raised during evaluation: treat as insufficiency,
    // never as a finding.
    return {
      ...base,
      outcome: "insufficient_evidence",
      message: `Rule evaluation error: ${e instanceof Error ? e.message : String(e)}`,
      findingClass: null,
      severity: null,
      evidence: [],
    };
  }
  if (outcome) {
    return { ...base, outcome: "pass", message: null, findingClass: null, severity: null, evidence: [] };
  }
  return {
    ...base,
    outcome: "fail",
    message: template(rule.onFail.message, ctx, used),
    findingClass: rule.onFail.class,
    severity: rule.onFail.severity,
    evidence: used.map((f) => ({
      kind: "fact_ref" as const,
      factId: f.id,
      page: f.page ?? null,
      bbox: f.bbox ?? null,
      cropKey: f.id ? `crops/${f.id}.png` : null,
      role: "input",
    })),
  };
}

/** Graph rules assert over the number of cross-institution overlap pairs. */
function runGraphRule(
  rule: Rule,
  ctx: FactIndex,
  base: Omit<RuleResult, "outcome" | "message" | "findingClass" | "severity" | "evidence">,
): RuleResult {
  const overlap = ctx.graphOverlap;
  let pairs: number;
  let evidence: RuleResult["evidence"] = [];
  let detail = "";
  // Pairs are session-wide; a pair is only THIS application's fault when the
  // app is one of the two member institutions.
  const scoped = <T extends { institutionIds: string[] }>(pairsIn: T[]): T[] =>
    (pairsIn ?? []).filter((p) => p.institutionIds.includes(ctx.applicationId));
  if (/SINGLE_PLEDGE|FDR/i.test(rule.id)) {
    pairs = scoped(overlap?.reusedFdrPairs ?? []).length;
    detail = pairs ? scoped(overlap!.reusedFdrPairs).map((p) => p.display).join(" · ") : "";
  } else if (/FACULTY|GHOST/i.test(rule.id)) {
    pairs = scoped(overlap?.ghostFacultyPairs ?? []).length;
    detail = pairs ? scoped(overlap!.ghostFacultyPairs).map((p) => p.display).join(" · ") : "";
  } else if (/LAND/i.test(rule.id)) {
    pairs = scoped(overlap?.recycledLandPairs ?? []).length;
    detail = pairs ? scoped(overlap!.recycledLandPairs).map((p) => p.display).join(" · ") : "";
  } else {
    pairs = 0;
  }
  const vars = { pairs_count: pairs, session: ctx.session };
  let outcome = false;
  try {
    outcome = Boolean(evalExpr(rule.assert, vars));
  } catch {
    outcome = false;
  }
  if (pairs === 0 || outcome) {
    return { ...base, outcome: "pass", message: null, findingClass: null, severity: null, evidence: [] };
  }
  return {
    ...base,
    outcome: "fail",
    message: template(rule.onFail.message, ctx, []).replace("{pairs}", detail),
    findingClass: rule.onFail.class,
    severity: rule.onFail.severity,
    evidence,
  };
}

/* ---------------- Test runner ---------------- */

export function runRuleTests(rule: Rule): { name: string; passed: boolean; got?: string }[] {
  const results: { name: string; passed: boolean; got?: string }[] = [];
  for (const t of rule.tests) {
    // Work on a copy: callers may re-run a rule's tests (replay), and the
    // graph-pair injection below must not mutate the loaded rule.
    const factsIn = { ...t.facts } as Record<string, string | number>;
    const ctx: FactIndex = {
      byKey: new Map(),
      all: new Map(),
      session: String(factsIn["session"] ?? "2026-27"),
      category: "EOA",
      applicationId: "test",
      intakeAt: "2026-06-01T00:00:00Z",
    };
    let i = 0;
    const factIds = new Map<string, string>();
    for (const [k, v] of Object.entries(factsIn)) {
      const fact: Fact = {
        id: `t_${rule.id}_${i}`,
        applicationId: "test",
        documentId: null,
        key: k,
        value: v as string | number,
        extractor: "test",
        confidence: 0.99,
        recordedAt: "2026-01-01T00:00:00Z",
        source: "document",
      };
      factIds.set(k, fact.id);
      ctx.byKey.set(k, [fact]);
      ctx.all.set(fact.id, fact);
      i++;
    }
    // A `<fact-key>_confidence` entry sets the confidence of that fact
    // (the convention blurred-field tests use) instead of becoming a fact.
    for (const [k, v] of Object.entries(factsIn)) {
      const m = /^(.*)_confidence$/.exec(k);
      if (!m || !Number.isFinite(Number(v))) continue;
      const base = ctx.byKey.get(String(m[1]));
      if (base && base.length > 0) {
        base[0]!.confidence = Number(v);
        ctx.byKey.delete(k);
        const delId = factIds.get(k);
        if (delId) ctx.all.delete(delId);
      }
    }
    // Graph-rule support in tests: a `__<pair>_pairs` fact key injects overlap pairs.
    const overlap: GraphOverlap = { ghostFacultyPairs: [], recycledLandPairs: [], reusedFdrPairs: [] };
    for (const [k, v] of Object.entries(factsIn)) {
      const m = /^__(\w+)_pairs$/.exec(k);
      const n = Number(v);
      if (m && Number.isFinite(n) && Number.isInteger(n) && n >= 0 && n <= 20) {
        // The injected pair must name the test application as a member so the
        // app-scoping filter keeps it.
        if (m[1] === "fdr") {
          for (let p = 0; p < n; p++) overlap.reusedFdrPairs.push({ fdrId: `t${p}`, display: "Synthetic shared FDR", institutions: ["A", "B"], institutionIds: ["test", "A"] });
        } else if (m[1] === "ghost_faculty") {
          for (let p = 0; p < n; p++) overlap.ghostFacultyPairs.push({ personId: `p${p}`, display: "Synthetic ghost faculty", institutions: ["A", "B"], institutionIds: ["test", "A"], sourceDocs: ["d1", "d2"] });
        } else if (m[1] === "recycled_land") {
          for (let p = 0; p < n; p++) overlap.recycledLandPairs.push({ parcelId: `p${p}`, display: "Synthetic recycled parcel", institutions: ["A", "B"], institutionIds: ["test", "A"] });
        }
        delete factsIn[k];
      }
    }
    if (overlap.reusedFdrPairs.length || overlap.ghostFacultyPairs.length || overlap.recycledLandPairs.length) {
      ctx.graphOverlap = overlap;
    }
    const res = runRule(rule, ctx);
    const got = res.outcome === "pass" ? "pass" : res.outcome === "fail" ? (res.findingClass ? "fail" : "insufficient_evidence") : "insufficient_evidence";
    results.push({ name: t.name, passed: got === t.expect, got });
  }
  return results;
}
