import { describe, expect, it } from "vitest";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { computeGraphOverlap, endBound, newGraph, node, edge, type GraphStore } from "./crosscheck.js";
import { buildFactIndex, loadRulePack, runRule, type FactIndex } from "./rules.js";
import type { Rule } from "@evidencegraph/domain";

const RULE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../rules/aph-2024-27");
const rules: Rule[] = loadRulePack(RULE_DIR) as Rule[];
const ghostRule = rules.find((r) => r.id === "ghost_faculty_cross_institution") as Rule;
const fdrRule = rules.find((r) => r.id === "fdr_single_pledge") as Rule;

type Employment = { inst: string; person: string; from: string; to: string | null | undefined; session: string };

function employmentGraph(jobs: Employment[]): GraphStore {
  const g = newGraph();
  const insts = [...new Set(jobs.map((j) => j.inst))];
  for (const i of insts) node(g, { id: i, label: "Institution", display: `Institution ${i}`, props: {} });
  for (const p of [...new Set(jobs.map((j) => j.person))]) node(g, { id: `person:${p}`, label: "Person", display: p, props: {} });
  jobs.forEach((j, idx) =>
    edge(g, {
      id: `emp_${idx}`,
      source: j.inst,
      target: `person:${j.person}`,
      type: "EMPLOYS",
      props: { session: j.session, from: j.from, to: j.to as unknown },
    }),
  );
  return g;
}

describe("open-ended date normalisation", () => {
  it("treats null, empty string and a missing key identically", () => {
    expect(endBound(null)).toBe("9999-12-31");
    expect(endBound("")).toBe("9999-12-31");
    expect(endBound(undefined)).toBe("9999-12-31");
    expect(endBound("2026-09-30")).toBe("2026-09-30");
  });

  it("open-ended employment overlaps anything that started after it", () => {
    const open = employmentGraph([
      { inst: "i1", person: "p1", from: "2026-04-01", to: null, session: "s" },
      { inst: "i2", person: "p1", from: "2026-05-15", to: "", session: "s" }, // empty string marshalling
      { inst: "i3", person: "p1", from: "2026-06-01", to: undefined, session: "s" }, // missing "to" on the wire
      { inst: "i0", person: "p1", from: "2026-03-01", to: "2026-03-31", session: "s" }, // ended before all three
    ]);
    const r = computeGraphOverlap(open);
    expect(r.ghostFacultyPairs.filter((p) => p.personId === "person:p1").length).toBe(3);
    // Each of i1/i2/i3 overlaps the other two, but none overlaps i0.
    const members = r.ghostFacultyPairs.flatMap((p) => p.institutionIds);
    expect(members).not.toContain("i0");
  });
});

describe("overlap boundaries (inclusive)", () => {
  const overlap = (a: Employment, b: Employment) =>
    computeGraphOverlap(employmentGraph([a, b])).ghostFacultyPairs.length;

  it("touching ranges count as overlapping", () => {
    expect(
      overlap(
        { inst: "i1", person: "p1", from: "2026-04-01", to: "2026-08-31", session: "s" },
        { inst: "i2", person: "p1", from: "2026-08-31", to: "2026-12-31", session: "s" },
      ),
    ).toBe(1);
  });

  it("nested ranges count as overlapping", () => {
    expect(
      overlap(
        { inst: "i1", person: "p1", from: "2026-01-01", to: "2026-12-31", session: "s" },
        { inst: "i2", person: "p1", from: "2026-06-01", to: "2026-07-01", session: "s" },
      ),
    ).toBe(1);
  });

  it("non-overlapping ranges do not (the clean mid-year move)", () => {
    expect(
      overlap(
        { inst: "i1", person: "p1", from: "2026-04-01", to: "2026-09-30", session: "s" },
        { inst: "i2", person: "p1", from: "2026-10-01", to: null, session: "s" },
      ),
    ).toBe(0);
  });

  it("different sessions never pair", () => {
    expect(
      overlap(
        { inst: "i1", person: "p1", from: "2026-04-01", to: "2026-12-31", session: "s1" },
        { inst: "i2", person: "p1", from: "2026-04-01", to: "2026-12-31", session: "s2" },
      ),
    ).toBe(0);
  });
});

describe("FDR pledge pair boundaries", () => {
  const pledging = (s1: string, s2: string, b2 = "i2") => {
    const g = newGraph();
    node(g, { id: "i1", label: "Institution", display: "I1", props: {} });
    node(g, { id: b2, label: "Institution", display: "I2", props: {} });
    node(g, { id: "fdr:x", label: "FDR", display: "FDR x", props: {} });
    edge(g, { id: "e1", source: "i1", target: "fdr:x", type: "PLEDGED", props: { session: s1 } });
    edge(g, { id: "e2", source: b2, target: "fdr:x", type: "PLEDGED", props: { session: s2 } });
    return computeGraphOverlap(g);
  };

  it("same session pairs; different sessions do not; same institution does not", () => {
    expect(pledging("s", "s").reusedFdrPairs.length).toBe(1);
    expect(pledging("s1", "s2").reusedFdrPairs.length).toBe(0);
    expect(pledging("s", "s", "i1").reusedFdrPairs.length).toBe(0);
  });
});

describe("graph rule scoping (real code path, no test injection)", () => {
  const overlap = computeGraphOverlap(
    employmentGraph([
      { inst: "inst-a", person: "p1", from: "2026-04-01", to: null, session: "s" },
      { inst: "inst-b", person: "p1", from: "2026-05-01", to: null, session: "s" },
    ]),
  );

  const ctxFor = (appId: string): FactIndex => buildFactIndex([], "EOA", "s", appId, overlap);

  it("a member institution gets the finding", () => {
    const res = runRule(ghostRule, ctxFor("inst-a"));
    expect(res.outcome).toBe("fail");
    expect(res.findingClass).toBe("potential_discrepancy");
  });

  it("every other application in the session does not", () => {
    for (const other of ["inst-c", "inst-d", "random-app"]) {
      const res = runRule(ghostRule, ctxFor(other));
      expect(res.outcome, `${other} must be unaffected by a pair between inst-a and inst-b`).toBe("pass");
    }
  });

  it("the FDR rule respects the same scoping", () => {
    const fdrOverlap = computeGraphOverlap((() => {
      const g = newGraph();
      node(g, { id: "inst-a", label: "Institution", display: "A", props: {} });
      node(g, { id: "inst-b", label: "Institution", display: "B", props: {} });
      node(g, { id: "fdr:x", label: "FDR", display: "X", props: {} });
      edge(g, { id: "e1", source: "inst-a", target: "fdr:x", type: "PLEDGED", props: { session: "s" } });
      edge(g, { id: "e2", source: "inst-b", target: "fdr:x", type: "PLEDGED", props: { session: "s" } });
      return g;
    })());
    expect(runRule(fdrRule, buildFactIndex([], "EOA", "s", "inst-a", fdrOverlap)).outcome).toBe("fail");
    expect(runRule(fdrRule, buildFactIndex([], "EOA", "s", "inst-b", fdrOverlap)).outcome).toBe("fail");
    expect(runRule(fdrRule, buildFactIndex([], "EOA", "s", "unrelated", fdrOverlap)).outcome).toBe("pass");
    void ghostRule;
  });
});
