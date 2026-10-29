/**
 * @evidencegraph/domain — types and zod schemas mirroring spec §06 and §07.
 * Pure data. No UI, no engine imports.
 */
import { z } from "zod";

/* ---------------- South-Asian-free semantic vocabulary (§07) ---------------- */

export const FINDING_CLASSES = [
  "completeness_gap",
  "validity_gap",
  "potential_discrepancy",
  "anomaly_signal",
  "confirmed_violation",
] as const;
export type FindingClass = (typeof FINDING_CLASSES)[number];

export const VERIFICATION_STATUSES = [
  "verified",
  "mismatch",
  "expired",
  "pending",
  "source_unavailable",
  "manual_review",
] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const SEVERITIES = ["low", "medium", "high"] as const;
export type Severity = (typeof SEVERITIES)[number];

/** Forensic signal strength (§10). Weak signals alone cannot raise severity above low. */
export const SIGNAL_STRENGTHS = ["strong", "medium", "weak"] as const;
export type SignalStrength = (typeof SIGNAL_STRENGTHS)[number];

export const FACT_SOURCES = ["form", "document", "record", "issuer", "human", "mock"] as const;
export type FactSource = (typeof FACT_SOURCES)[number];

export const FINDING_STATUSES = ["open", "accepted", "dismissed", "escalated", "rectified"] as const;
export type FindingStatus = (typeof FINDING_STATUSES)[number];

export const ROLES = ["scrutiny_officer", "senior_reviewer", "rule_admin", "auditor", "applicant"] as const;
export type Role = (typeof ROLES)[number];

export const APPLICATION_CATEGORIES = ["EOA", "INTAKE_INCREASE", "NEW_PROGRAMME"] as const;
export type ApplicationCategory = (typeof APPLICATION_CATEGORIES)[number];

export const APPLICATION_STATUSES = ["in_review", "manual_queue", "awaiting_officer", "resolved"] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

/* ---------------- Facts (§06) ---------------- */export const Bbox = z.tuple([z.number(), z.number(), z.number(), z.number()]);
export type Bbox = z.infer<typeof Bbox>;

/**
 * Evidence model: a pointer either resolves to a stored fact (with an optional
 * stored crop), to a stored crop alone, or — for the one legitimate exception —
 * asserts that a required checklist slot was checked and was empty (§01, §04).
 * Every other finding must carry at least one resolvable fact/crop pointer.
 */
export const FactEvidenceRef = z.object({
  kind: z.literal("fact_ref"),
  factId: z.string(),
  page: z.number().int().nullable().optional(),
  bbox: Bbox.nullable().optional(),
  cropKey: z.string().nullable().optional(),
  role: z.string(), // e.g. "claimed", "reference", "signal"
});
export type FactEvidenceRef = z.infer<typeof FactEvidenceRef>;

export const CropEvidenceRef = z.object({
  kind: z.literal("crop_ref"),
  cropKey: z.string(),
  page: z.number().int().nullable().optional(),
  bbox: Bbox.nullable().optional(),
  factId: z.string().nullable().optional(), // crop crops may exist without a fact row
  role: z.string(),
});
export type CropEvidenceRef = z.infer<typeof CropEvidenceRef>;

/**
 * Absence receipt — allowed ONLY for completeness_gap findings from presence
 * rules: the checked result of finding a required checklist slot empty.
 * `{ factId: "none" }`-style fake pointers are not accepted evidence.
 */
export const AbsenceReceipt = z.object({
  kind: z.literal("absence_receipt"),
  checklist_slot: z.string(),
  expected_doc_type: z.string(),
  checklist_version: z.string(),
  checked_at: z.string(), // ISO instant of the intake agent's slot check
});
export type AbsenceReceipt = z.infer<typeof AbsenceReceipt>;

export const EvidenceRef = z.discriminatedUnion("kind", [FactEvidenceRef, CropEvidenceRef, AbsenceReceipt]);
export type EvidenceRef = z.infer<typeof EvidenceRef>;

/** Version string cited by absence receipts; the checklist definition lives with the rule pack name. */
export const CHECKLIST_VERSION = "aph-2024-27";

export const Fact = z.object({
  id: z.string(),
  applicationId: z.string(),
  documentId: z.string().nullable(),
  key: z.string(), // e.g. land.total_area, faculty.count
  value: z.union([z.string(), z.number(), z.null()]),
  unit: z.string().nullable().optional(),
  page: z.number().int().nullable().optional(),
  bbox: Bbox.nullable().optional(),
  extractor: z.string(), // e.g. "MOCK:ocr", "human:officer", "form"
  confidence: z.number(), // 0..1
  asOf: z.string().nullable().optional(), // ISO date the source says this was true
  recordedAt: z.string(),
  supersededBy: z.string().nullable().optional(),
  source: z.enum(FACT_SOURCES),
  /** set by the confidence gate when the fact is held for officer correction */
  quarantine: z.string().nullable().optional(), // reason string when quarantined
});
export type Fact = z.infer<typeof Fact>;

/* ---------------- Findings (§06 + example §07) ---------------- */

export const Finding = z.object({
  id: z.string(),
  applicationId: z.string(),
  region: z.string(),
  ruleId: z.string(),
  ruleVersion: z.number().int(),
  aphRef: z.string(),
  findingClass: z.enum(FINDING_CLASSES),
  severity: z.enum(SEVERITIES),
  confidence: z.number(),
  summary: z.string(),
  detail: z.string().optional(),
  suggestedAction: z.string().optional(),
  status: z.enum(FINDING_STATUSES).default("open"),
  createdBy: z.string(), // rule:<id> | agent:<name>
  crossApplication: z.boolean().default(false), // graph faults seen across institutions
  relatedApplicationIds: z.array(z.string()).default([]),
  evidence: z.array(EvidenceRef).min(1),
  createdAt: z.string(),
  decidedBy: z.string().nullable().optional(),
  decidedAt: z.string().nullable().optional(),
  decisionReason: z.string().nullable().optional(),
  /** present while the finding is withheld pending officer input (confidence gate) */
  blockedBy: z.string().nullable().optional(), // fact id held at the gate
});
export type Finding = z.infer<typeof Finding>;

/* ---------------- Verification attempts (§06) ---------------- */

export const FieldMatch = z.object({
  field: z.string(),
  claimed: z.string().nullable(),
  issuer: z.string().nullable(),
  match: z.enum(["match", "differs", "unavailable"]),
});
export const VerificationAttempt = z.object({
  id: z.string(),
  applicationId: z.string(),
  documentId: z.string().nullable(),
  connector: z.string(),
  refId: z.string().nullable(),
  requestedAt: z.string(),
  respondedAt: z.string().nullable(),
  status: z.enum(VERIFICATION_STATUSES),
  fieldMatches: z.array(FieldMatch).default([]),
  responseDigest: z.string().nullable().optional(),
  isMock: z.boolean(), // every mock source must carry this and be labelled in UI
  note: z.string().nullable().optional(), // connector note text shown in the timeline
  /** retries recorded by the connector (timeout + backoff), e.g. 3 for fault 13 */
  attempts: z.number().int().optional(),
  retryDelaysMs: z.array(z.number().int().nonnegative()).optional(),
  /** true when the circuit breaker opened after exhausted retries */
  circuitBreaker: z.boolean().optional(),
  /** Prefilled request queued for a human when automated verification is unavailable. */
  manualRequest: z.object({
    id: z.string(),
    status: z.enum(["queued", "completed"]),
    request: z.string(),
    queuedAt: z.string(),
  }).optional(),
});
export type VerificationAttempt = z.infer<typeof VerificationAttempt>;
export type FieldMatch = z.infer<typeof FieldMatch>;

/* ---------------- Documents and pages ---------------- */

export const Document = z.object({
  id: z.string(),
  applicationId: z.string(),
  checklistSlot: z.string(),
  docType: z.string(),
  docTypeConfidence: z.number(),
  sha256: z.string(),
  pageCount: z.number().int(),
  uploadedAt: z.string(),
  status: z.enum(["received", "processed", "failed", "reused"]),
  /** synthetic page render descriptor (same coordinate space as fact bboxes) */
  pages: z.array(
    z.object({
      page: z.number().int(),
      title: z.string(),
      lines: z.array(
        z.object({
          text: z.string(),
          x: z.number(),
          y: z.number(),
          size: z.number().optional(),
          bold: z.boolean().optional(),
          mono: z.boolean().optional(),
          /** hidden instruction text: rendered white-on-white, still extractable (prompt injection fixture) */
          hidden: z.boolean().optional(),
        }),
      ),
      noise: z.number().optional(),
      rotation: z.number().optional(),
      blur: z.number().optional(),
    }),
  ),
  altered: z.boolean().default(false), // forensic flags attached to the file itself
});
export type Document = z.infer<typeof Document>;

export type PageSpec = Document["pages"][number];

/* ---------------- Applications ---------------- */

export const Institution = z.object({
  id: z.string(),
  name: z.string(),
  nameVariants: z.array(z.string()).default([]),
  region: z.string(),
  trustRegNo: z.string(),
  aicteId: z.string(),
  category: z.enum(APPLICATION_CATEGORIES),
  sessionId: z.string(),
  submittedAt: z.string(),
  slaDueAt: z.string(),
  applicantRolePin: z.string().optional(), // for the applicant demo role
  controls: z.boolean().default(false), // true for the five clean-control institutions
});
export type Institution = z.infer<typeof Institution>;

export type ApplicationStatus_ = ApplicationStatus;
export const ApplicationSummary = z.object({
  id: z.string(),
  institution: Institution,
  status: z.enum(APPLICATION_STATUSES),
  triageScore: z.number(),
  triageReasons: z.array(z.string()),
  openFindings: z.number(),
  openByClass: z.record(z.enum(FINDING_CLASSES), z.number()),
  highSeverityOpen: z.number(),
  slaHoursLeft: z.number(),
});
export type ApplicationSummary = z.infer<typeof ApplicationSummary>;

export const ChecklistItem = z.object({
  key: z.string(),
  label: z.string(),
  docType: z.string().nullable(),
  required: z.boolean(),
  presentDocumentId: z.string().nullable(),
});
export type ChecklistItem = z.infer<typeof ChecklistItem>;

/* ---------------- Audit ledger (§06) ---------------- */

export const AuditRow = z.object({
  seq: z.number().int(),
  at: z.string(),
  actor: z.string(),
  action: z.string(),
  entity: z.string(),
  entityId: z.string(),
  payload: z.record(z.unknown()),
  prevHash: z.string(),
  hash: z.string(),
});
export type AuditRow = z.infer<typeof AuditRow>;

/* ---------------- Rules (§08 YAML, parsed shape) ---------------- */

export const RuleTestId = z.string();
export const Rule = z.object({
  id: z.string(),
  version: z.number().int(),
  aphRef: z.string(),
  categories: z.array(z.enum(APPLICATION_CATEGORIES)),
  sessions: z.array(z.string()),
  inputs: z.array(
    z.object({
      fact: z.string(),
      min_confidence: z.number().optional(),
      required: z.boolean().optional(),
    }),
  ),
  assert: z.string(),
  /** presence rules carry the checklist item they guard, to mint typed absence receipts */
  checklistItem: z
    .object({ slot: z.string(), docType: z.string() })
    .optional(),
  graphQuery: z.string().optional(), // for graph-type rules ("ghost faculty" etc)
  onFail: z.object({
    class: z.enum(FINDING_CLASSES),
    severity: z.enum(SEVERITIES),
    message: z.string(),
  }),
  onInsufficientEvidence: z
    .object({ route: z.enum(["field_review", "manual_queue", "drop"]), message: z.string().optional() })
    .optional(),
  tests: z.array(
    z.object({
      name: z.string(),
      facts: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])),
      expect: z.enum(["pass", "fail", "insufficient_evidence"]),
    }),
  ),
  kind: z.enum(["facts", "graph"]).default("facts"),
  clauseConfirmed: z.boolean().default(false), // false while aph_ref contains [fill in]
});
export type Rule = z.infer<typeof Rule>;
export type RuleTest = Rule["tests"][number];

export const RuleResult = z.object({
  ruleId: z.string(),
  ruleVersion: z.number().int(),
  category: z.enum(APPLICATION_CATEGORIES),
  sessionId: z.string(),
  outcome: z.enum(["pass", "fail", "insufficient_evidence"]),
  message: z.string().nullable(),
  aphRef: z.string(),
  findingClass: z.enum(FINDING_CLASSES).nullable(),
  severity: z.enum(SEVERITIES).nullable(),
  evidence: z.array(EvidenceRef),
});
export type RuleResult = z.infer<typeof RuleResult>;

/* ---------------- Verification of connector result (§11) ---------------- */

export const VerificationResult = z.object({
  connector: z.string(),
  isMock: z.boolean(),
  status: z.enum(VERIFICATION_STATUSES),
  refId: z.string().nullable(),
  fieldMatches: z.array(FieldMatch),
  note: z.string().optional(),
  circuitBreaker: z.boolean().optional(),
  attempts: z.number().int().optional(),
  retryDelaysMs: z.array(z.number().int().nonnegative()).optional(),
});
export type VerificationResult = z.infer<typeof VerificationResult>;

/* ---------------- Agent graph run replay (§03/§04) ---------------- */

export const RunEvent = z.object({
  seq: z.number().int(),
  node: z.string(), // intake | doc_reader | forensics | source_verifier | confidence_gate | cross_check | compliance | critic | reporter
  status: z.enum(["ok", "sent_back", "interrupt", "skipped"]),
  startedAt: z.string(),
  endedAt: z.string(),
  summary: z.string(),
  inputs: z.record(z.unknown()),
  outputs: z.record(z.unknown()),
});
export type RunEvent = z.infer<typeof RunEvent>;

/* ---------------- Graph (§05, Neo4j model mirrored in-memory) ---------------- */

export const GraphNode = z.object({
  id: z.string(),
  label: z.enum(["Institution", "Trust", "Person", "LandParcel", "FDR", "Signatory", "StampImage", "Photo"]),
  display: z.string(),
  props: z.record(z.unknown()),
});
export const GraphEdge = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  type: z.string(), // EMPLOYS, PLEDGED, OWNS, LEASES, BEARS, RUN_BY, SIGNED_BY, NEAR_DUPLICATE, CONFLICTS_WITH
  props: z.record(z.unknown()).default({}),
  severity: z.enum(SEVERITIES).optional(), // conflict edges render dashed
});
export type GraphNode = z.infer<typeof GraphNode>;
export type GraphEdge = z.infer<typeof GraphEdge>;
export type GraphSubgraph = { nodes: GraphNode[]; edges: GraphEdge[] };

/* ---------------- Letters and decisions ---------------- */

export const LetterDraft = z.object({
  applicationId: z.string(),
  body: z.string(),
  clauseCitations: z.array(z.object({ ruleId: z.string(), aphRef: z.string() })),
  updatedAt: z.string(),
  releasedBy: z.string().nullable().optional(),
  releasedAt: z.string().nullable().optional(),
});
export type LetterDraft = z.infer<typeof LetterDraft>;

export type DecisionAction = "accept" | "dismiss" | "escalate";

/* ---------------- Metrics (§17) ---------------- */

export const MetricBoard = z.object({
  fieldAccuracyPerDocType: z.array(
    z.object({ docType: z.string(), accuracy: z.number(), samples: z.number() }),
  ),
  discrepancyPrecision: z.number(),
  discrepancyRecall: z.number(),
  falsePositiveRate: z.number(), // high-severity findings on clean controls
  verificationCoverage: z.number(),
  explainabilityCoverage: z.number(),
  avgTimePerApplicationMinutes: z.number(),
  alertLatencySeconds: z.object({ median: z.number(), p90: z.number() }),
});
export type MetricBoard = z.infer<typeof MetricBoard>;

/* ---------------- Wording guard ---------------- */

export const BANNED_WORDS = ["forged", "fake", "fraud"] as const;
