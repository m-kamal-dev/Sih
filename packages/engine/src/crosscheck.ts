/**
 * Cross-check (§04 Cross-check agent, §05 graph, §09 cross-institution patterns).
 * In-memory mirror of the Neo4j model with the same query semantics; the real
 * Cypher text is exported verbatim for the UI Cypher drawer.
 */
import type { Fact, GraphEdge, GraphNode, Finding, Severity } from "@evidencegraph/domain";
import type { FactIndex, GraphOverlap } from "./rules.js";

export const CYPHER_GHOST_FACULTY = `// Ghost faculty: same person, two institutions, overlapping employment in a session
MATCH (p:Person)<-[e1:EMPLOYS]-(i1:Institution),
      (p)<-[e2:EMPLOYS]-(i2:Institution)
WHERE i1.aicte_id < i2.aicte_id AND e1.session = e2.session
  AND e1.from <= coalesce(e2.to, date()) AND e2.from <= coalesce(e1.to, date())
RETURN p.faculty_id, i1.aicte_id, i2.aicte_id, e1.source_doc, e2.source_doc`;

export const CYPHER_RECYCLED_LAND = `// Recycled land parcel
MATCH (l:LandParcel)<-[:OWNS|LEASES]-(t1:Trust), (l)<-[:OWNS|LEASES]-(t2:Trust)
WHERE t1.reg_no < t2.reg_no
RETURN l.state, l.district, l.survey_no, t1.name, t2.name`;

export const CYPHER_REUSED_FDR = `// Reused FDR in the same session
MATCH (f:FDR)<-[a:PLEDGED]-(i1:Institution), (f)<-[b:PLEDGED]-(i2:Institution)
WHERE i1.aicte_id < i2.aicte_id AND a.session = b.session
RETURN f.bank, i1.aicte_id, i2.aicte_id`;

/* ---------------- Entity graph ---------------- */

export type GraphStore = {
  nodes: Map<string, GraphNode>;
  edges: GraphEdge[];
};

export function newGraph(): GraphStore {
  return { nodes: new Map(), edges: [] };
}

export function node(g: GraphStore, n: GraphNode): GraphNode {
  g.nodes.set(n.id, n);
  return n;
}

export function edge(g: GraphStore, e: Omit<GraphEdge, "props"> & { props?: Record<string, unknown> }): GraphEdge {
  const full: GraphEdge = { ...e, props: e.props ?? {} };
  g.edges.push(full);
  return full;
}

/* ---------------- Name matching (identifier-first, then fuzzy) ---------------- */

const ABBREVIATIONS: Record<string, string> = {
  inst: "institute",
  instt: "institute",
  univ: "university",
  clg: "college",
  tech: "technology",
};

/** Normalise a name: lowercase, fold diacritics, drop punctuation, expand abbreviations. */
export function normaliseName(name: string): string {
  const folded = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
  return folded
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => ABBREVIATIONS[t] ?? t)
    .filter((t) => !["the", "and", "&", "of"].includes(t)) // "of" is pure filler: "Inst. of Engineering" == "Institute Engineering"
    .join(" ");
}

const FUZZY_MATCHED = 0.86; // >= matched
const FUZZY_BAND = 0.72; // [band, matched) → ambiguous → route to review, never auto-merge

/** Token-overlap score on normalised names (rapidfuzz-style, small subset). */
export function nameSimilarity(a: string, b: string): number {
  const ta = normaliseName(a).split(" ");
  const tb = normaliseName(b).split(" ");
  const setA = new Set(ta);
  const setB = new Set(tb);
  const inter = [...setA].filter((t) => setB.has(t)).length;
  const union = new Set(ta.concat(tb)).size;
  return inter / union;
}

export type NameMatchResult =
  | { kind: "matched" }
  | { kind: "ambiguous"; score: number }
  | { kind: "unmatched"; score: number };

/** Identifier-first, then fuzzy: ambiguous matches route to review (never merge). */
export function matchNames(a: string, b: string): NameMatchResult {
  if (a.trim().toLowerCase() === b.trim().toLowerCase()) return { kind: "matched" };
  const score = nameSimilarity(a, b);
  if (score >= FUZZY_MATCHED) return { kind: "matched" };
  if (score >= FUZZY_BAND) return { kind: "ambiguous", score };
  return { kind: "unmatched", score };
}

/* ---------------- Cross-institution patterns (§09 queries, in memory) ---------------- */

/**
 * Open-ended appointments (`to: null`, `to: ""`, or the key missing) all normalise
 * to the same far-future bound so the inclusive overlap test below behaves
 * identically for every marshalling of "this employment is still ongoing".
 * The fixture marshals open-ended as null; this guard keeps older payloads safe.
 */
export function endBound(to: unknown): string {
  return typeof to === "string" && to !== "" ? to : "9999-12-31";
}

/** All pattern results for a whole session, shared by graph rules for every application. */
export function computeGraphOverlap(g: GraphStore): GraphOverlap {
  const ghostFacultyPairs: GraphOverlap["ghostFacultyPairs"] = [];
  const recycledLandPairs: GraphOverlap["recycledLandPairs"] = [];
  const reusedFdrPairs: GraphOverlap["reusedFdrPairs"] = [];

  // Ghost faculty: same Person, two institutions, same session, overlapping dates.
  const employs = g.edges.filter((e) => e.type === "EMPLOYS");
  for (let i = 0; i < employs.length; i++) {
    for (let j = i + 1; j < employs.length; j++) {
      const e1 = employs[i] as GraphEdge;
      const e2 = employs[j] as GraphEdge;
      if (e1.target !== e2.target) continue; // same Person
      if (e1.source === e2.source) continue; // different institutions only
      const p1 = e1.props as Record<string, string>;
      const p2 = e2.props as Record<string, string>;
      if (p1.session !== p2.session) continue; // cross-session employment is not this session's duty
      const from1 = p1.from;
      const to1 = endBound(p1.to);
      const from2 = p2.from;
      const to2 = endBound(p2.to);
      if ((from1 ?? "") <= to2 && (from2 ?? "") <= to1) {
        const person = g.nodes.get(e1.target);
        const i1 = g.nodes.get(e1.source);
        const i2 = g.nodes.get(e2.source);
        ghostFacultyPairs.push({
          personId: e1.target,
          display: `${person?.display ?? "Person"}: ${i1?.display ?? "?"} + ${i2?.display ?? "?"} (${p1.session})`,
          institutions: [i1?.display ?? "?", i2?.display ?? "?"],
          institutionIds: [e1.source, e2.source],
          sourceDocs: [p1.source_doc, p2.source_doc].filter((x): x is string => Boolean(x)),
        });
      }
    }
  }

  // Recycled land: same LandParcel linked by OWNS/LEASES from two different Trusts.
  const landEdges = g.edges.filter((e) => e.type === "OWNS" || e.type === "LEASES");
  for (let i = 0; i < landEdges.length; i++) {
    for (let j = i + 1; j < landEdges.length; j++) {
      const a = landEdges[i] as GraphEdge;
      const b = landEdges[j] as GraphEdge;
      if (a.target !== b.target) continue;
      if (a.source === b.source) continue;
      const parcel = g.nodes.get(a.target);
      const t1 = g.nodes.get(a.source);
      const t2 = g.nodes.get(b.source);
      recycledLandPairs.push({
        parcelId: a.target,
        display: `${parcel?.display ?? "Land"}: ${t1?.display ?? "?"} + ${t2?.display ?? "?"}`,
        institutions: [t1?.display ?? "?", t2?.display ?? "?"],
        institutionIds: [a.source, b.source],
      });
    }
  }

  // Reused FDR: same FDR PLEDGED by two institutions in the same session.
  const fdrEdges = g.edges.filter((e) => e.type === "PLEDGED");
  for (let i = 0; i < fdrEdges.length; i++) {
    for (let j = i + 1; j < fdrEdges.length; j++) {
      const a = fdrEdges[i] as GraphEdge;
      const b = fdrEdges[j] as GraphEdge;
      if (a.target !== b.target) continue; // same FDR
      if (a.source === b.source) continue;
      const s1 = a.props as Record<string, string>;
      const s2 = b.props as Record<string, string>;
      if (s1.session !== s2.session) continue;
      const fdr = g.nodes.get(a.target);
      const i1 = g.nodes.get(a.source);
      const i2 = g.nodes.get(b.source);
      reusedFdrPairs.push({
        fdrId: a.target,
        display: `${fdr?.display ?? "FDR"}: ${i1?.display ?? "?"} + ${i2?.display ?? "?"} (${s1.session})`,
        institutions: [i1?.display ?? "?", i2?.display ?? "?"],
        institutionIds: [a.source, b.source],
      });
    }
  }

  return { ghostFacultyPairs, recycledLandPairs, reusedFdrPairs };
}

/* ---------------- Conflict view (§13): concepts, one row per value ---------------- */

/**
 * A concept is the same semantic fact seen from form, documents, prior records
 * and issuers. Each row carries its own value, date and source so the officer
 * can see whether a date explains the gap. Values are only COMPARED for the
 * same `as_of` — different-date rows are displayed but flagged "not compared".
 */
export type Concept = { key: string; label: string; factKeys: string[] };

export const CONCEPTS: Concept[] = [
  { key: "land.area", label: "Land area", factKeys: ["land.form_area", "land.deed_area"] },
  { key: "faculty.count", label: "Faculty count", factKeys: ["faculty.form_count", "faculty.roster_count"] },
  { key: "fire_noc.validity", label: "Fire NOC validity", factKeys: ["fire_noc.valid_until", "fire_noc.record_valid_until"] },
  { key: "bcc.validity", label: "Building completion validity", factKeys: ["bcc.valid_until"] },
  { key: "degree.holder", label: "Degree holder", factKeys: ["degree.holder"] },
  { key: "fdr.amount", label: "FDR amount", factKeys: ["fdr.amount"] },
  { key: "facility.rooms", label: "Rooms", factKeys: ["facility.rooms_summary"] },
];

/** Concept keys already covered by a deterministic rule (no conflict finding for these). */
export const RULE_COVERED_CONCEPTS = new Set(["land.area", "faculty.count", "fire_noc.validity", "bcc.validity"]);

export type ConflictRow = {
  concept: string;
  label: string;
  rows: Array<{ factId: string; value: string; source: string; documentId: string | null; asOf: string | null; superseded: boolean }>;
  compared: string[]; // as_of groups that were actually compared
  divergentSameDate: boolean; // true when same-date values disagree and no rule covers it
};

export function buildConflicts(facts: Fact[]): ConflictRow[] {
  const out: ConflictRow[] = [];
  for (const concept of CONCEPTS) {
    const group = facts.filter((f) => concept.factKeys.includes(f.key) && !f.supersededBy);
    if (group.length < 2) continue;
    // Group by as_of; only identical dates are compared (guardrail §04).
    const byDate = new Map<string, Fact[]>();
    for (const f of group) {
      const d = f.asOf ?? "none";
      const list = byDate.get(d) ?? [];
      list.push(f);
      byDate.set(d, list);
    }
    let divergentSameDate = false;
    const compared: string[] = [];
    for (const [d, list] of byDate) {
      if (list.length < 2) continue;
      compared.push(d);
      if (new Set(list.map(valueString)).size > 1) divergentSameDate = true;
    }
    out.push({
      concept: concept.key,
      label: concept.label,
      rows: group
        .sort((a, b) => (a.asOf ?? "").localeCompare(b.asOf ?? ""))
        .map((f) => ({
          factId: f.id,
          value: valueString(f),
          source: f.source,
          documentId: f.documentId,
          asOf: f.asOf ?? null,
          superseded: false,
        })),
      compared,
      divergentSameDate,
    });
  }
  // Same-key multi-source leftovers (e.g. a record and an issuer value)
  const byKey = new Map<string, Fact[]>();
  for (const f of facts) {
    if (f.supersededBy) continue;
    const covered = CONCEPTS.some((c) => c.factKeys.includes(f.key));
    if (covered) continue;
    const list = byKey.get(f.key) ?? [];
    list.push(f);
    byKey.set(f.key, list);
  }
  for (const [key, list] of byKey) {
    if (list.length < 2) continue;
    out.push({
      concept: key,
      label: labelFor(key),
      rows: list.map((f) => ({ factId: f.id, value: valueString(f), source: f.source, documentId: f.documentId, asOf: f.asOf ?? null, superseded: false })),
      compared: [],
      divergentSameDate: false,
    });
  }
  return out;
}

export function valueString(f: Fact): string {
  return `${f.value as string | number}${f.unit ? " " + f.unit : ""}`;
}

/**
 * post-recompute safety net: an uncovered concept with divergent same-date
 * values yields a potential_discrepancy. Rule-covered concepts never produce
 * duplicates here.
 */
export function conflictFindingsFromFacts(facts: Fact[], app: { id: string; region: string }, now: string): Finding[] {
  const findings: Finding[] = [];
  for (const c of buildConflicts(facts)) {
    if (!c.divergentSameDate) continue;
    if (RULE_COVERED_CONCEPTS.has(c.concept)) continue;
    const group = facts.filter((f) => !f.supersededBy && c.rows.some((r) => r.factId === f.id));
    const byDate = new Map<string, Fact[]>();
    for (const f of group) {
      const d = f.asOf ?? "none";
      const list = byDate.get(d) ?? [];
      list.push(f);
      byDate.set(d, list);
    }
    for (const [asOf, list] of byDate) {
      if (list.length < 2) continue;
      if (new Set(list.map(valueString)).size < 2) continue;
      const rows = list.map((f) => `${valueString(f)} (${f.source}${f.documentId ? ", doc" : ""}${f.asOf ? `, ${f.asOf}` : ""})`).join(" · ");
      findings.push(
        buildFinding({
          id: `cf_${app.id}_${c.concept.replace(/\./g, "_")}`,
          applicationId: app.id,
          region: app.region,
          ruleId: "XCHECK.CONFLICT",
          ruleVersion: 1,
          aphRef: "APH 2024-27 §[fill in]",
          findingClass: "potential_discrepancy",
          severity: "medium",
          confidence: 0.9,
          summary: `${c.label} disagrees across sources: ${rows}.`,
          evidence: list.map((f) => ({
            kind: "fact_ref" as const,
            factId: f.id,
            page: f.page ?? null,
            bbox: f.bbox ?? null,
            cropKey: f.documentId ? `crops/${f.id}.png` : null,
            role: f.source === "form" ? "claimed" : "reference",
          })),
          createdAt: now,
          createdBy: "agent:cross_check",
          suggestedAction: "Ask the institution to clarify the conflicting values in their source documents.",
          detail: `Compared for the same as_of date (${asOf === "none" ? "no date stated" : asOf}).`,
        }),
      );
    }
  }
  return findings;
}

/* ---------------- Finding construction ---------------- */

export function buildFinding(args: {
  id: string;
  applicationId: string;
  region: string;
  ruleId: string;
  ruleVersion: number;
  aphRef: string;
  findingClass: Finding["findingClass"];
  severity: Severity;
  confidence: number;
  summary: string;
  evidence: Finding["evidence"];
  createdAt: string;
  createdBy: string;
  suggestedAction?: string;
  detail?: string;
}): Finding {
  return {
    id: args.id,
    applicationId: args.applicationId,
    region: args.region,
    ruleId: args.ruleId,
    ruleVersion: args.ruleVersion,
    aphRef: args.aphRef,
    findingClass: args.findingClass,
    severity: args.severity,
    confidence: args.confidence,
    summary: args.summary,
    detail: args.detail,
    suggestedAction: args.suggestedAction,
    status: "open",
    createdBy: args.createdBy,
    crossApplication: false,
    relatedApplicationIds: [],
    evidence: args.evidence,
    createdAt: args.createdAt,
  };
}

export function labelFor(factKey: string): string {
  const map: Record<string, string> = {
    "land.total_area": "Land area",
    "faculty.count": "Faculty count",
    "fire_noc.valid_until": "Fire NOC validity",
    "bcc.valid_until": "Building completion certificate validity",
    "trust.affidavit": "Trust affidavit",
    "degree.holder": "Degree certificate holder",
    "fdr.amount": "FDR amount",
  };
  return map[factKey] ?? factKey.split(".").slice(-2).join(" ").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
