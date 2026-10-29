/**
 * Source verifier connectors (§11): one interface, mock implementations with
 * `is_mock = true`, deterministic fixtures returning all six statuses,
 * timeouts, retries and a circuit-breaker path. Every result is labelled MOCK
 * by the caller in UI, API and data.
 */
import type { VerificationResult } from "@evidencegraph/domain";

export type DocRef = {
  docType: string;
  refId?: string | null;
  claims: Record<string, string | number | null>;
};

export type Connector = {
  name: string;
  covers: string[];
  is_mock: true;
  /** timeout in ms (simulated) */
  timeoutMs: number;
  retries: number;
  verify: (doc: DocRef) => VerificationResult & { latencyMs: number; attempts: number };
};

type MockRecord = Record<string, string | null>;

/* ---------------- Mock issuer records (deterministic fixtures) ---------------- */

export const MOCK_ISSUER_RECORDS: Record<string, MockRecord> = {
  // NAD degree registry: one mismatch case (fault 9) is baked in by the fixtures.
  digilocker_nad: {
    "nad:NAD-88410": "holder:Ananya Suresh Rao|course:B.Tech CSE|year:2022|institution:Vikramsheela Institute of Technology",
    "nad:NAD-88411": "holder:Rohan Iyer|course:MBA|year:2021|institution:Vikramsheela Institute of Technology",
    "nad:NAD-51330": "holder:Devika Menon|course:B.Tech ECE|year:2023|institution:Silverleaf College of Engineering", // expected by F9's doc: differs
    "nad:NAD-51331": "holder:Kabir Malhotra|course:B.Sc Physics|year:2020|institution:Silverleaf College of Engineering",
  },
  mca21: {
    "cin:U80904KA2015NPL081234": "name:Vikramsheela Education Foundation|status:active|directors:2",
    "cin:U80904KL2014NPL077123": "name:Silverleaf Education Trust|status:active|directors:3",
    "cin:U80904MH2016NPL094122": "name:Northbay Academy Trust|status:active|directors:2",
    "cin:U80904TN2013NPL069201": "name:Cedarville Rural Education Society|status:under_process",
  },
  gstin_pan: {
    "gstin:SYNTH-REG-001": "entity:Vikramsheela Education Foundation|status:active",
    "gstin:SYNTH-REG-002": "entity:Silverleaf Education Trust|status:active",
  },
};

function parseRecord(rec: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of rec.split("|")) {
    const idx = part.indexOf(":");
    if (idx > 0) out[part.slice(0, idx)] = part.slice(idx + 1);
  }
  return out;
}

const FDR_BANK_RECORDS: Record<string, string> = {
  "fdr:FDR-776281": "bank:Vijaya Bank (synthetic)|amount:2500000|session:2026-27|owner:Vikramsheela Education Foundation",
  "fdr:FDR-776282": "bank:Vijaya Bank (synthetic)|amount:1800000|session:2026-27|owner:Silverleaf Education Trust",
};

function digest(s: string): string {
  // Deterministic short digest for the response (mock).
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, "0");
}

/** Exported alias used by the fixture assembler for verification response digests. */
export function digestOf(s: string): string {
  return digest(s);
}

function fieldMatch(claimed: string | null | undefined, issuer: string | null | undefined): "match" | "differs" | "unavailable" {
  if (claimed == null || issuer == null) return "unavailable";
  return claimed.trim().toLowerCase() === issuer.trim().toLowerCase() ? "match" : "differs";
}

/* ---------------- The registry ---------------- */

export const CONNECTORS: Connector[] = [
  {
    name: "digilocker_nad",
    covers: ["degree_certificate"],
    is_mock: true,
    timeoutMs: 4000,
    retries: 3,
    verify: (doc) => {
      const ref = String(doc.refId ?? "");
      const rec = MOCK_ISSUER_RECORDS["digilocker_nad" as keyof typeof MOCK_ISSUER_RECORDS]?.[ref];
      // Simulated latency jitter from the ref id (deterministic).
      const latencyMs = 300 + (hashNum(ref) % 600);
      const r = rec ? parseRecord(rec) : null;
      const fields = [
        { field: "holder", claimed: (doc.claims.holder as string) ?? null, issuer: r?.holder ?? null },
        { field: "course", claimed: (doc.claims.course as string) ?? null, issuer: r?.course ?? null },
        { field: "year", claimed: (doc.claims.year as string) ?? null, issuer: r?.year ?? null },
        { field: "institution", claimed: (doc.claims.institution as string) ?? null, issuer: r?.institution ?? null },
      ].map((f) => ({ field: f.field, claimed: f.claimed, issuer: f.issuer, match: fieldMatch(f.claimed, f.issuer) }));
      if (!r) {
        return {
          connector: "digilocker_nad",
          isMock: true,
          status: "pending",
          refId: ref || null,
          fieldMatches: [],
          note: "MOCK registry: no record for this reference; request remains pending.",
          latencyMs,
          attempts: 1,
        };
      }
      const anyDiffers = fields.some((f) => f.match === "differs");
      return {
        connector: "digilocker_nad",
        isMock: true,
        status: anyDiffers ? "mismatch" : "verified",
        refId: ref,
        fieldMatches: fields,
        note: anyDiffers
          ? "MOCK registry returned a record and at least one field differs from the document."
          : "MOCK registry returned a record and every compared field matched.",
        latencyMs,
        attempts: 1,
      };
    },
  },
  {
    name: "aicte_prior_records",
    covers: ["prior_eoa", "intake_letter", "ter_report"],
    is_mock: true,
    timeoutMs: 3000,
    retries: 2,
    verify: (doc) => {
      const hash = digest(JSON.stringify(doc.claims));
      return {
        connector: "aicte_prior_records",
        isMock: true,
        status: "verified",
        refId: doc.refId ?? `prior:${hash.slice(0, 6)}`,
        fieldMatches: Object.entries(doc.claims)
          .slice(0, 6)
          .map(([k, v]) => ({ field: k, claimed: v == null ? null : String(v), issuer: String(v), match: "match" as const })),
        note: "MOCK synthetic prior-records database (authorised adapter designed for integration).",
        latencyMs: 180 + (hashNum(hash) % 200),
        attempts: 1,
      };
    },
  },
  {
    name: "mca21",
    covers: ["company_master"],
    is_mock: true,
    timeoutMs: 5000,
    retries: 3,
    verify: (doc) => {
      const ref = String(doc.refId ?? "");
      const rec = MOCK_ISSUER_RECORDS["mca21" as keyof typeof MOCK_ISSUER_RECORDS]?.[ref];
      const r = rec ? parseRecord(rec) : null;
      const latencyMs = 250 + (hashNum(ref) % 400);
      if (!r)
        return {
          connector: "mca21",
          isMock: true,
          status: "manual_review",
          refId: ref || null,
          fieldMatches: [],
          note: "MOCK MCA21 registry returned no conclusive record; routed to manual review.",
          latencyMs,
          attempts: 1,
        };
      const status = r.status === "active" ? "verified" : "manual_review";
      return {
        connector: "mca21",
        isMock: true,
        status,
        refId: ref,
        fieldMatches: [{ field: "entity_name", claimed: (doc.claims.name as string) ?? null, issuer: r.name ?? null, match: fieldMatch(doc.claims.name as string, r.name) }],
        note: "MOCK MCA21 master data.",
        latencyMs,
        attempts: 1,
      };
    },
  },
  {
    name: "gstin_pan",
    covers: ["entity_identity"],
    is_mock: true,
    timeoutMs: 3000,
    retries: 3,
    verify: (doc) => {
      const ref = String(doc.refId ?? "");
      const rec = MOCK_ISSUER_RECORDS["gstin_pan" as keyof typeof MOCK_ISSUER_RECORDS]?.[ref];
      const r = rec ? parseRecord(rec) : null;
      return {
        connector: "gstin_pan",
        isMock: true,
        status: r ? "verified" : "manual_review",
        refId: ref || null,
        fieldMatches: r ? [{ field: "entity", claimed: (doc.claims.name as string) ?? null, issuer: r.entity ?? null, match: fieldMatch(doc.claims.name as string, r.entity) }] : [],
        note: "MOCK GSTIN/PAN verification service (authorised route designed for integration).",
        latencyMs: 200 + (hashNum(ref) % 300),
        attempts: 1,
      };
    },
  },
  {
    name: "state_land_records",
    covers: ["sale_deed", "land_record"],
    is_mock: true,
    timeoutMs: 2500,
    retries: 3,
    verify: () => ({
      connector: "state_land_records",
      isMock: true,
      status: "manual_review",
      refId: null,
      fieldMatches: [],
      note: "MOCK state land records: usually no API — a prefilled manual verification request goes to an officer (manual queue).",
      latencyMs: 150,
      attempts: 0,
    }),
  },
  {
    name: "fire_department",
    covers: ["fire_noc"],
    is_mock: true,
    timeoutMs: 2000,
    retries: 3,
    verify: (doc) => {
      // Deterministic circuit breaker: this source is DOWN in the demo (fault 13),
      // except for a single application where it answers.
      const onlineRef = doc.claims.__fire_online === "yes";
      const latencyMs = onlineRef ? 350 : 2000; // timeout
      if (onlineRef) {
        return {
          connector: "fire_department",
          isMock: true,
          status: doc.claims.__fire_status === "expired" ? "expired" : "verified",
          refId: doc.refId ?? null,
          fieldMatches: [{ field: "noc_number", claimed: (doc.claims.noc as string) ?? null, issuer: (doc.claims.noc as string) ?? null, match: "match" }],
          note: "MOCK fire-department endpoint (connection allowed in this demo scenario).",
          latencyMs,
          attempts: 1,
        };
      }
      return {
        connector: "fire_department",
        isMock: true,
        status: "source_unavailable",
        refId: doc.refId ?? null,
        fieldMatches: [],
        circuitBreaker: true,
        retryDelaysMs: [250, 500],
        note: "MOCK fire-department endpoint: timeout on all 3 attempts with backoff — circuit opened. Status stays source_unavailable and the case is routed to the manual queue.",
        latencyMs,
        attempts: 3,
      };
    },
  },
];

export function connectorFor(docType: string): Connector | null {
  return CONNECTORS.find((c) => c.covers.includes(docType)) ?? null;
}

function hashNum(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h;
}

/** Verify a document through its connector, labelled honestly. */
export function verify(doc: DocRef): { result: VerificationResult & { latencyMs: number; attempts: number }; mock: boolean } {
  const c = connectorFor(doc.docType);
  if (!c) {
    return {
      result: {
        connector: "none",
        isMock: true,
        status: "manual_review",
        refId: doc.refId ?? null,
        fieldMatches: [],
        note: "No automated verification route exists for this document type in the prototype.",
        latencyMs: 0,
        attempts: 0,
      },
      mock: true,
    };
  }
  const result = c.verify(doc);
  return { result, mock: c.is_mock };
}
