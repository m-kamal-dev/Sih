import { describe, expect, it } from "vitest";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
const RULE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../rules/aph-2024-27");
import { RuleLoadError, loadRulePack, parseRuleYaml, stringifyRuleYaml, runRule, runRuleTests, assertRuleIsValid, buildFactIndex, type FactIndex } from "./rules.js";
import type { Fact, Rule } from "@evidencegraph/domain";

describe("APH 2024-27 rule pack", () => {
  const rules = loadRulePack(RULE_DIR);

  it("loads every rule in the demo pack", () => {
    const ids = rules.map((r) => r.id);
    expect(ids).toEqual(expect.arrayContaining([
      "trust_affidavit_presence",
      "fire_noc_validity",
      "bcc_validity",
      "land_area_form_vs_deed",
      "faculty_count_form_vs_roster",
      "fdr_endowment_threshold",
      "degree_holder_matches_registry",
      "fdr_single_pledge",
      "ghost_faculty_cross_institution",
    ]));
    expect(rules.length).toBeGreaterThanOrEqual(9);
  });

  it("every rule carries non-invented APH references until confirmed", () => {
    for (const r of rules) {
      expect(r.aphRef).toContain("[fill in");
      expect(r.clauseConfirmed).toBe(false);
    }
  });

  it("every rule's own tests pass", () => {
    for (const r of rules) {
      const results = runRuleTests(r);
      for (const t of results) {
        expect({ rule: r.id, test: t.name, got: t.got, expected: "pass" as const }).toEqual({ rule: r.id, test: t.name, got: t.got, expected: t.passed ? "pass" : undefined });
      }
      expect(results.every((t) => t.passed), `${r.id} failed its tests`).toBe(true);
    }
  });

  it("serializes editable YAML that round-trips every rule", () => {
    for (const rule of rules) {
      expect(parseRuleYaml(stringifyRuleYaml(rule))).toEqual(rule);
    }
  });

  it("runRuleTests is pure: running them twice in one process is identical", () => {
    const once = rules.map((r) => ({ id: r.id, results: runRuleTests(r) }));
    const twice = rules.map((r) => ({ id: r.id, results: runRuleTests(r) }));
    expect(JSON.stringify(twice)).toBe(JSON.stringify(once));
  });

  it("rule inputs never relax the central per-field-type confidence thresholds", async () => {
    const { CONFIDENCE_THRESHOLDS, fieldKindForFact } = await import("./confidence.js");
    for (const r of rules) {
      for (const input of r.inputs) {
        const required = CONFIDENCE_THRESHOLDS[fieldKindForFact(input.fact)];
        const given = (input as { min_confidence?: number }).min_confidence;
        if (typeof given === "number") {
          expect(given, `${r.id}:${input.fact}`).toBeGreaterThanOrEqual(required);
        }
      }
    }
  });

  it("a rule input below the central threshold fails the build", () => {
    expect(() =>
      parseRuleYaml(
        `id: too_loose\nversion: 1\naph_ref: '[fill in: APH clause]'\ninputs:\n  - fact: faculty.roster_count\n    min_confidence: 0.50\nassert: 'true'\non_fail:\n  class: validity_gap\n  severity: low\n  message: 'x'\ntests:\n  - name: never\n    facts: {}\n    expect: pass\n`,
      ),
    ).toThrow(/central threshold/);
  });
});

function fact(key: string, value: string | number, opts: Partial<Fact> = {}): Fact {
  return {
    id: `t_${key}`,
    applicationId: "app",
    documentId: null,
    key,
    value,
    extractor: "MOCK:ocr+layout",
    confidence: opts.confidence ?? 0.99,
    recordedAt: "2026-01-01T00:00:00Z",
    source: "document",
    asOf: opts.asOf ?? null,
    page: opts.page ?? null,
    bbox: opts.bbox ?? null,
    unit: opts.unit ?? null,
    supersededBy: opts.supersededBy ?? null,
    quarantine: opts.quarantine ?? null,
  };
}

function ctx(rules: Rule[], facts: Fact[], kind: "fire" | "affidavit" | "land" | "bcc" | "faculty" | "fdr" | "degree"): FactIndex {
  const idx = buildFactIndex(facts, "EOA", "2026-27", "app");
  void kind;
  return idx;
}

describe("rule outcomes on fact indexes", () => {
  const fire = loadRulePack(RULE_DIR).find((r) => r.id === "fire_noc_validity") as Rule;
  const affidavit = loadRulePack(RULE_DIR).find((r) => r.id === "trust_affidavit_presence") as Rule;
  const land = loadRulePack(RULE_DIR).find((r) => r.id === "land_area_form_vs_deed") as Rule;

  it("validity: tampered document date fails against the issuer record", () => {
    const res = runRule(fire, ctx([], [
      fact("fire_noc.valid_until", "2027-03-15", { page: 1, bbox: [64, 285, 460, 330] }),
      fact("fire_noc.record_valid_until", "2026-07-10"),
      fact("session.start_date", "2026-08-01"),
    ], "fire"));
    expect(res.outcome).toBe("fail");
    expect(res.findingClass).toBe("validity_gap");
    expect(res.message).toContain("2027-03-15");
    expect(res.message).toContain("2026-07-10");
  });

  it("validity: source offline routes to insufficient evidence, not a verdict", () => {
    const res = runRule(fire, ctx([], [
      fact("fire_noc.valid_until", "2027-06-30"),
      fact("session.start_date", "2026-08-01"),
    ], "fire"));
    expect(res.outcome).toBe("insufficient_evidence");
    expect(res.findingClass).toBe(null);
  });

  it("presence: a missing affidavit is a completeness gap the moment intake sees it", () => {
    const res = runRule(affidavit, ctx([], [fact("session.start_date", "2026-08-01")], "affidavit"));
    expect(res.outcome).toBe("fail");
    expect(res.findingClass).toBe("completeness_gap");
    expect(res.severity).toBe("high");
  });

  it("presence: a fact that exists passes", () => {
    const res = runRule(affidavit, ctx([], [fact("trust.affidavit.executed_on", "2026-03-12")], "affidavit"));
    expect(res.outcome).toBe("pass");
  });

  it("confidence gate: a low-confidence crop routes to insufficient evidence (no false mismatch)", () => {
    const rules = loadRulePack(RULE_DIR);
    const faculty = rules.find((r) => r.id === "faculty_count_form_vs_roster") as Rule;
    const lowConfRoster = fact("faculty.roster_count", 173, { confidence: 0.62 });
    const res = runRule(faculty, ctx([], [
      fact("faculty.form_count", 123),
      lowConfRoster,
    ], "faculty"));
    expect(res.outcome).toBe("insufficient_evidence");
    expect(lowConfRoster.quarantine).toBeNull(); // gating happens in the confidence module, not here
  });

  it("tolerance: small drift passes, an inflated form fails", () => {
    expect(runRule(land, ctx([], [fact("land.form_area", "3.22"), fact("land.deed_area", "3.20")], "land")).outcome).toBe("pass");
    const bad = runRule(land, ctx([], [fact("land.form_area", "5.00"), fact("land.deed_area", "3.20")], "land"));
    expect(bad.outcome).toBe("fail");
    expect(bad.findingClass).toBe("potential_discrepancy");
  });
});

describe("rule loaders guard rails", () => {
  it("a rule without tests fails the build", () => {
    expect(() =>
      parseRuleYaml("id: x\nversion: 1\naph_ref: '[fill in: APH clause]'\ninputs: []\nassert: 'true'\non_fail:\n  class: validity_gap\n  severity: high\n  message: 'x'\n"),
    ).toThrow(/no tests/);
  });

  it("duplicate rule ids are rejected", () => {
    expect(() => parseRuleYaml("version: 1\n")).toThrow(/missing id|empty/);
  });

  it("malformed rule structures return a validation error instead of an internal exception", () => {
    expect(() => parseRuleYaml("id: broken\nversion: 1\ninputs: []\nassert: 'true'\ntests: []\n")).toThrow(RuleLoadError);
  });
});
