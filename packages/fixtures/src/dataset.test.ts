import { describe, expect, it } from "vitest";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { INSTITUTIONS, FAULT_MATRIX } from "./institutions.js";
import { loadRulePack } from "../../engine/src/rules.js";
import { matchNames } from "../../engine/src/crosscheck.js";
import { computeGraphOverlap } from "../../engine/src/crosscheck.js";
import { assembleDataset, CHECKLIST } from "./assemble.js";
import { containsBannedWord } from "../../engine/src/wording.js";
import type { Rule, Finding } from "@evidencegraph/domain";
import type { Dataset } from "./assemble.js";

const RULE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../rules/aph-2024-27");
const rules: Rule[] = loadRulePack(RULE_DIR) as Rule[];
const dataset = assembleDataset(rules);

const byApp = (app: string, list: Finding[]) => list.filter((f) => f.applicationId === app);
const instIds = INSTITUTIONS.map((i) => i.id);
const faultApps: string[] = Array.from(new Set<string>(FAULT_MATRIX.flatMap((f) => f.institutions as readonly string[])));
const controlApps = instIds.filter((id) => !faultApps.includes(id));

describe("dataset assembly", () => {
  it("builds every application, document, fact and verification", () => {
    expect(dataset.institutions.length).toBe(12);
    expect(dataset.documents.length).toBeGreaterThan(60);
    expect(dataset.facts.length).toBeGreaterThan(120);
    expect(dataset.verifications.length).toBeGreaterThan(24);
    expect(dataset.rules.length).toBe(rules.length);
  });

  it("is deterministic: assembling twice yields byte-identical JSON", () => {
    const again = assembleDataset(loadRulePack(RULE_DIR) as Rule[]);
    void again;
    const a = JSON.stringify(stripLatency(dataset));
    const b = JSON.stringify(stripLatency(assembleDataset(loadRulePack(RULE_DIR) as Rule[])));
    expect(b).toBe(a);
  });

  it("every YAML presence rule names a real checklist slot and document type", () => {
    const absent = rules.filter((rule) => rule.checklistItem && !CHECKLIST.some(
      (item) => item.expectedSlot === rule.checklistItem?.slot && item.docType === rule.checklistItem?.docType,
    ));
    expect(absent.map((rule) => rule.id)).toEqual([]);
  });
});

function stripLatency(ds: Dataset): unknown {
  // latencyMs is a scheduled MOCK latency, deterministic per ref but the two
  // assemblies must not be allowed to differ only by that; they do not.
  return JSON.parse(JSON.stringify(ds));
}

describe("the 13 planted faults are all observable", () => {
  const cases: Array<{ n: number; app: string; match: (f: Finding, ds: Dataset) => boolean }> = [
    { n: 1, app: "EOA-2026-0142", match: (f) => f.ruleId === "FORENSICS.PDF_STRUCTURE" && f.findingClass === "anomaly_signal" },
    { n: 2, app: "EOA-2026-0142", match: (f) => f.ruleId === "land_area_form_vs_deed" && f.findingClass === "potential_discrepancy" },
    { n: 3, app: "EOA-2026-0117", match: (f) => f.ruleId === "ghost_faculty_cross_institution" && f.findingClass === "potential_discrepancy" },
    { n: 3, app: "INTK-2026-0208", match: (f) => f.ruleId === "ghost_faculty_cross_institution" && f.findingClass === "potential_discrepancy" },
    { n: 4, app: "EOA-2026-0117", match: (f) => f.ruleId === "fdr_single_pledge" && f.findingClass === "potential_discrepancy" && f.crossApplication },
    { n: 4, app: "NEW-2026-0031", match: (f) => f.ruleId === "fdr_single_pledge" && f.findingClass === "potential_discrepancy" },
    { n: 5, app: "EOA-2026-0187", match: (f) => f.findingClass === "anomaly_signal" && /classroom|photo/i.test(f.ruleId + f.summary) },
    { n: 6, app: "INTK-2026-0208", match: (f) => f.findingClass === "anomaly_signal" && /seal/i.test(f.summary) },
    { n: 7, app: "INTK-2026-0229", match: (f) => f.ruleId === "trust_affidavit_presence" && f.findingClass === "completeness_gap" },
    { n: 8, app: "NEW-2026-0058", match: (f) => f.ruleId === "bcc_validity" && f.findingClass === "validity_gap" },
    { n: 9, app: "INTK-2026-0208", match: (f) => f.ruleId === "degree_holder_matches_registry" },
    { n: 10, app: "NEW-2026-0031", match: (f) => f.ruleId === "FORENSICS.PDF_STRUCTURE" && f.findingClass === "anomaly_signal" },
    { n: 11, app: "EOA-2026-0117", match: () => true }, // confidence gate failure is an event; asserted below
    { n: 12, app: "NEW-2026-0058", match: (f) => f.findingClass === "anomaly_signal" && /instruction|injection|hidden/i.test(f.ruleId + f.summary) },
    // Fault 13 surfaces as the connector staying source_unavailable (circuit breaker), not as a finding.
    { n: 13, app: "NEW-2026-0058", match: (_f, ds) => ds.verifications.some((v) => v.connector === "fire_department" && v.applicationId === "NEW-2026-0058" && v.status === "source_unavailable" && v.isMock) },
  ];

  for (const c of cases) {
    it(`fault ${c.n} (${c.app}) surfaces in the expected way`, () => {
      const found = byApp(c.app, dataset.findings).some((f) => c.match(f, dataset));
      expect(found, `fault ${c.n} on ${c.app}: findings=${JSON.stringify(dataset.findings.map((f) => ({ app: f.applicationId, rule: f.ruleId, cls: f.findingClass })))}`).toBe(true);
    });
  }

  it("fault 11 (blurred roster) is held at the confidence gate, never a mismatch", () => {
    const held = dataset.facts.filter((f) => f.applicationId === "EOA-2026-0117" && f.key === "faculty.roster_count" && f.quarantine);
    expect(held.length).toBe(1);
    const mismatch = dataset.findings.filter((f) => f.applicationId === "EOA-2026-0117" && f.ruleId === "faculty_count_form_vs_roster");
    expect(mismatch).toEqual([]);
  });

  it("fault 7 is raised at intake with a checklist-backed absence receipt", () => {
    const finding = byApp("INTK-2026-0229", dataset.findings).find((item) => item.ruleId === "trust_affidavit_presence");
    expect(finding).toBeDefined();
    expect(finding?.evidence).toEqual([expect.objectContaining({
      kind: "absence_receipt",
      checklist_slot: "trust_documents",
      expected_doc_type: "trust_affidavit",
      checklist_version: "aph-2024-27",
    })]);
    const docReader = dataset.runs["INTK-2026-0229"]?.find((event) => event.node === "doc_reader");
    expect(Date.parse(finding?.createdAt ?? "9999-12-31")).toBeLessThan(Date.parse(docReader?.startedAt ?? "0000-01-01"));
  });

  it("fault 13 (fire department offline) records source_unavailable after retries with a MOCK circuit breaker", () => {
    const noAnswer = dataset.verifications.filter((v) => v.applicationId === "NEW-2026-0058" && v.connector === "fire_department");
    expect(noAnswer.length).toBe(1);
    expect(noAnswer[0]?.status).toBe("source_unavailable");
    expect(noAnswer[0]?.isMock).toBe(true);
    expect(noAnswer[0]?.attempts).toBe(3);
    expect(noAnswer[0]?.retryDelaysMs).toEqual([250, 500]);
    expect(noAnswer[0]?.circuitBreaker).toBe(true);
    expect(noAnswer[0]?.manualRequest).toMatchObject({ status: "queued", request: expect.stringContaining("Confirm fire NOC") });
  });

  it("fault 9 shows a verification mismatch against the record", () => {
    const v = dataset.verifications.filter((x) => x.applicationId === "INTK-2026-0208" && x.connector === "digilocker_nad");
    expect(v.length).toBeGreaterThanOrEqual(1);
    // The certificate's holder disagrees with the NAD record — that IS the fault.
    expect(v[0]?.status).toBe("mismatch");
  });

  it("declarative fault matrix matches each expected rule, class, severity and connector status", () => {
    for (const fault of FAULT_MATRIX) {
      for (const appId of fault.institutions) {
        for (const expected of fault.expectedFindings) {
          const found = byApp(appId, dataset.findings).filter((finding) => finding.ruleId === expected.ruleId);
          expect(found, `fault ${fault.n} on ${appId} should have exactly one ${expected.ruleId} finding`).toHaveLength(1);
          expect(found[0]).toMatchObject({ findingClass: expected.findingClass, severity: expected.severity });
          expect(found[0]?.evidence.length, `fault ${fault.n} finding must retain evidence`).toBeGreaterThan(0);
        }
        if (fault.verificationStatus) {
          const connector = fault.verificationStatus === "mismatch" ? "digilocker_nad" : "fire_department";
          const attempts = dataset.verifications.filter((attempt) => attempt.applicationId === appId && attempt.connector === connector);
          expect(attempts, `fault ${fault.n} connector attempt on ${appId}`).toHaveLength(1);
          expect(attempts[0]?.status).toBe(fault.verificationStatus);
          if (fault.n === 13) expect(attempts[0]?.manualRequest?.status).toBe("queued");
        }
        if (fault.n === 11) {
          expect(byApp(appId, dataset.findings).filter((finding) => finding.ruleId === "faculty_count_form_vs_roster")).toEqual([]);
        }
      }
    }
  });

  it("fault 12 changes only the anomaly signal when its hidden text is removed", () => {
    const withoutHiddenText = assembleDataset(rules, { includePromptInjection: false });
    const appId = "NEW-2026-0058";
    const withInjection = byApp(appId, dataset.findings);
    const withoutInjection = byApp(appId, withoutHiddenText.findings);
    const signal = withInjection.filter((finding) => finding.ruleId === "DOCREADER.INJECTION");
    expect(signal).toHaveLength(1);
    expect(signal[0]?.findingClass).toBe("anomaly_signal");
    expect(withInjection.filter((finding) => finding.ruleId !== "DOCREADER.INJECTION")).toEqual(withoutInjection);
    expect(withoutInjection.some((finding) => finding.ruleId === "DOCREADER.INJECTION")).toBe(false);
  });
});

describe("fault 3 and 4 evidence anchors", () => {
  it("cross-institution findings appear on both members and no other application", () => {
    const members = ["INTK-2026-0208", "EOA-2026-0117"];
    for (const inst of instIds) {
      const has = byApp(inst, dataset.findings).some((f) => f.ruleId === "ghost_faculty_cross_institution");
      expect(has, `${inst} ghost-faculty finding presence`).toBe(members.includes(inst));
    }
    const fdrMembers = ["EOA-2026-0117", "NEW-2026-0031"];
    for (const inst of instIds) {
      const has = byApp(inst, dataset.findings).some((f) => f.ruleId === "fdr_single_pledge");
      expect(has, `${inst} reused-FDR finding presence`).toBe(fdrMembers.includes(inst));
    }
    // The counterpart link is set on both members ("Also on <id>").
    for (const f of dataset.findings.filter((x) => x.ruleId === "ghost_faculty_cross_institution" || x.ruleId === "fdr_single_pledge")) {
      expect(f.crossApplication, `${f.id} must be marked crossApplication`).toBe(true);
      expect(f.relatedApplicationIds.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("ghost-faculty findings cite the roster-entry facts of BOTH member rosters", () => {
    for (const app of ["INTK-2026-0208", "EOA-2026-0117"]) {
      const ghost = byApp(app, dataset.findings).filter((f) => f.ruleId === "ghost_faculty_cross_institution");
      expect(ghost.length).toBeGreaterThanOrEqual(1);
      for (const f of ghost) {
        expect(f.evidence.length).toBeGreaterThanOrEqual(2);
        const factsById = new Map(dataset.facts.map((x) => [x.id, x]));
        for (const e of f.evidence) {
          const fact = e.kind === "fact_ref" ? factsById.get(e.factId) : undefined;
          expect(fact, `${e.kind} pointer ${"factId" in e ? e.factId : e.kind} must resolve`).toBeDefined();
          if (!fact) continue;
          expect(fact.key).toBe("faculty.roster_entry");
          expect(["INTK-2026-0208", "EOA-2026-0117"]).toContain(fact.applicationId);
          expect(fact.documentId, "roster entry must come from a stored document").not.toBeNull();
          expect(fact.page).not.toBeNull();
          expect(fact.bbox).not.toBeNull();
        }
      }
    }
  });

  it("reused-FDR findings cite the FDR facts with their crops on both members", () => {
    for (const app of ["EOA-2026-0117", "NEW-2026-0031"]) {
      const reuse = byApp(app, dataset.findings).filter((f) => f.ruleId === "fdr_single_pledge");
      expect(reuse.length).toBeGreaterThanOrEqual(1);
      for (const f of reuse) {
        expect(f.evidence.length).toBeGreaterThanOrEqual(2);
        const factsById = new Map(dataset.facts.map((x) => [x.id, x]));
        for (const e of f.evidence) {
          const fact = e.kind === "fact_ref" ? factsById.get(e.factId) : undefined;
          expect(fact).toBeDefined();
          if (!fact) continue;
          expect(fact.key).toBe("fdr.ref");
          expect(["EOA-2026-0117", "NEW-2026-0031"]).toContain(fact.applicationId);
          expect(fact.page).not.toBeNull();
          expect(fact.bbox).not.toBeNull();
        }
        expect(f.crossApplication).toBe(true);
      }
    }
  });
});

describe("five clean controls", () => {
  it("have zero high-severity findings", () => {
    const highs = controlApps.flatMap((id) => byApp(id, dataset.findings)).filter((f) => f.severity === "high");
    expect(highs.map((f) => ({ app: f.applicationId, rule: f.ruleId, summary: f.summary }))).toEqual([]);
  });

  it("each control exercises its documented legitimate variation", () => {
    // Camford: abbreviated / case-variant name must still resolve to the
    // institution through abbreviation-aware normalisation (matched, or at
    // worst ambiguous-to-review — never a false "unmatched").
    const camford = dataset.institutions.find((i) => i.id === "EOA-2026-0163");
    expect(camford).toBeDefined();
    expect(camford!.nameVariants.length).toBeGreaterThanOrEqual(1);
    for (const variant of camford!.nameVariants) {
      const res = matchNames(variant, camford!.name);
      expect(res.kind, `${variant} vs ${camford!.name}`).not.toBe("unmatched");
    }
    // Tiruvalla: degraded scans — every page carries poor-scan render params.
    const tiruvalla = dataset.documents.filter((d) => d.applicationId === "INTK-2026-0233");
    expect(tiruvalla.length).toBeGreaterThanOrEqual(8);
    const poor = tiruvalla.filter((d) => d.pages.some((p) => (p.blur ?? 0) >= 0.6));
    expect(poor.length).toBeGreaterThanOrEqual(1);
    // Mid-year move: both rosters cite the moving faculty member's entry, yet
    // the overlap check correctly clears the non-overlapping dates — no
    // ghost-faculty finding may involve emp-81004 on either application.
    for (const app of ["EOA-2026-0199", "EOA-2026-0163"]) {
      const entryFacts = dataset.facts.filter((f) => f.applicationId === app && f.key === "faculty.roster_entry" && f.value === "emp-81004");
      expect(entryFacts.length, `${app} renders the moved faculty member's roster entry`).toBe(1);
    }
    const moveHits = dataset.findings.filter(
      (f) => f.ruleId === "ghost_faculty_cross_institution" && f.evidence.some((e) => e.kind === "fact_ref" && e.factId.includes("emp-81004")),
    );
    expect(moveHits).toEqual([]);
    const controlGraph = { nodes: new Map(dataset.graphNodes.map((item) => [item.id, item])), edges: dataset.graphEdges };
    const evaluatedPairs = computeGraphOverlap(controlGraph).ghostFacultyPairs.filter((pair) => pair.personId === "person:emp-81004");
    expect(evaluatedPairs, "the mid-year move was evaluated by the graph and cleared because its dates do not overlap").toEqual([]);
    // Bhiwadi mis-slot control: exactly one low-severity completeness gap.
    const mis = byApp("EOA-2026-0199", dataset.findings).filter((f) => f.ruleId === "INTAKE.SLOT");
    expect(mis.map((f) => f.severity)).toEqual(["low"]);
  });

  it("every application carries evidence-backed findings with resolvable pointers", () => {
    const factIds = new Set(dataset.facts.map((f) => f.id));
    const orphans = dataset.findings.flatMap((f) =>
      f.evidence.flatMap((e) => (e.kind !== "fact_ref" || e.factId === "none" ? [] : factIds.has(e.factId) ? [] : [{ finding: f.id, evidence: e.factId }])),
    );
    expect(orphans).toEqual([]);
  });

  it("generated findings, letters, rules and fixture page text pass the wording gate", () => {
    const strings = [
      ...dataset.findings.flatMap((finding) => [finding.summary, finding.detail ?? "", finding.suggestedAction ?? ""]),
      ...dataset.letters.map((letter) => letter.body),
      ...dataset.rules.flatMap((rule) => [rule.aphRef, rule.onFail.message, rule.onInsufficientEvidence?.message ?? ""]),
      ...dataset.documents.flatMap((doc) => doc.pages.flatMap((page) => page.lines.map((line) => line.text))),
    ];
    expect(strings.flatMap((text) => containsBannedWord(text) ? [text] : [])).toEqual([]);
  });
});
