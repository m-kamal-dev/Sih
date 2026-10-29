# SPEC_DIGEST — EvidenceGraph (source: `EvidenceGraph_Architecture.html`, read in full)

Terminology below is used verbatim across the codebase (helpers/labels live in `packages/domain`).

---

## 01 — Six design principles

1. **Facts carry provenance** — every value records document, page, bbox, extractor, confidence, `as_of`.
2. **Models extract, rules decide** — compliance outcomes come only from versioned rules citing APH clauses.
3. **No finding without evidence** — the Critic drops findings whose evidence pointer does not resolve to a stored fact + crop.
4. **Never fabricate verification** — unreachable issuer ⇒ `pending` / `source_unavailable` and a human.
5. **Suspicious is not forged** — finding class and verification status are independent axes; only officers escalate.
6. **Augment, don't replace** — standalone service with a portal adapter; no live AICTE integration claimed ("designed for integration").

## 02 — Architecture (six layers)

L1 Sources (portal adapter, self-check, prior AICTE records, issuer sources) → L2 Edge/ingest (gateway, ingestion, page pipeline, job queue) → L3 Agents (supervisor graph + agents below) → L4 Models/tools (OCR & layout, LLM, vision, forensic kit, rule engine) → L5 Data plane (Postgres truth, Neo4j relationships, Qdrant similarity, MinIO blobs, Redis transient) → L6 People/ops (console, institution report, alerts, audit & metrics, observability).

Postgres is the only source of truth; Neo4j/Qdrant are rebuildable projections fed by an outbox.

## 03 — Lifecycle (10 steps)

submission → ingest (SHA-256, MIME, sanitise, render) → intake (checklist diff produces `completeness_gap` immediately) → parallel fan-out (Doc reader, Forensics, Source verifier) → confidence gate (LangGraph interrupt, officer corrects, new fact version with `source=human`) → cross-check (entity resolution, same-`as_of` comparison) → compliance (YAML rules: pass/fail/insufficient evidence) → critic (evidence gate, sends back once) → reporter (report, triage score, letter draft) → officer decision (mandatory reason, ledger, labelled data).

## 04 — Eight agents and their guardrails

| Agent | Output | Guardrail |
|---|---|---|
| Intake & planner | task plan, completeness findings | fully deterministic |
| Doc reader | facts with page/bbox/confidence/as_of | grounding check; document text is untrusted data |
| Forensics | `anomaly_signal` + strength | never issues verdicts; "forged" never appears; weak signals alone cannot raise severity above low |
| Source verifier | `VerificationResult` (six statuses) | never infers `verified`; mocks labelled; QR fetched only from allowlisted domains |
| Confidence gate (human) | new fact version `source=human`, original superseded | per-type thresholds (identifiers stricter than names) |
| Cross-check | `potential_discrepancy` with all values/dates/sources | compare only same `as_of`; ambiguous matches → review, never auto-merge |
| Compliance | pass / fail / insufficient evidence | `confirmed_violation` only on verified or officer-confirmed inputs; vision is advisory |
| Reporter | report, triage score + reasons, letter draft | drafts only; nothing sent without officer approval |

(8 agents = Intake, Doc reader, Forensics, Source verifier, Cross-check, Compliance, Critic, Reporter; the Confidence gate and the officer decision are the two human checkpoints.)

Lifecycle quirks used by the build: **Critic sends work back to Cross-check once, then routes to a human.**

## 05 — Data layer

- Postgres: applications, documents, facts (versioned), rules, findings, verification_attempts, reviews, audit ledger, checkpoints.
- Neo4j entity nodes: Institution{aicte_id}, Trust{reg_no}, Person{faculty_id, pan_hash}, LandParcel{state,district,survey_no}, FDR{bank,fdr_hash}, Signatory, StampImage{phash}, Photo{phash}. Relationships: RUN_BY, EMPLOYS{session,from,to,source_doc}, OWNS/LEASES{area,from,to}, PLEDGED{session}, SIGNED_BY, BEARS, NEAR_DUPLICATE{sim}.
- Neo4j evidence layer: Application, Document{sha256}, Page, Fact, Rule{id,version}, Finding, Review; HAS_DOC, EXTRACTED_FROM{bbox}, CONFLICTS_WITH, CHECKED_BY, CITES, VERIFIED_BY, DECIDED_BY.
- PAN only as salted hash; Aadhaar never stored.
- Qdrant collections: aph_clauses, doc_pages, stamps_signatures, infra_photos, extraction_examples.

## 06 — Core schema (fact + finding shape, mirrored in zod)

facts: key, value, value_norm, unit, page, bbox, extractor, confidence, `as_of` (the date the source says this was true), superseded_by, source ∈ form|document|record|issuer|human.
findings: rule_id, rule_version, aph_ref, finding_class, severity, confidence, summary, status open|accepted|dismissed|escalated|rectified, created_by rule:<id> | agent:<name>; evidence rows fact_id + crop_key + role.
verification_attempts: connector, ref_id, requested/responded timestamps, status (six), field_matches, response_digest, is_mock.
audit_log: seq, at, actor, action, entity, entity_id, payload, prev_hash, hash — **hash = sha256(prev_hash ‖ canonical(row))**.

## 07 — Finding classes and verification statuses (the two axes)

- Classes: `completeness_gap` (Intake) · `validity_gap` (Compliance) · `potential_discrepancy` (Cross-check) · `anomaly_signal` (Forensics/Qdrant; preliminary only) · `confirmed_violation` (Compliance, officer acceptance).
- Verification: **verified** (issuer returned, every field matched) · **mismatch** (issuer returned, ≥1 field differs) · **expired** (record exists, no longer valid) · **pending** (sent, no answer yet) · **source_unavailable** (no route or down after retries) · **manual_review** (inconclusive / no automated route).

## 08 — Rules as code

YAML per rule: id, version, aph_ref, applies_to{categories,sessions}, inputs (fact + min_confidence), assert, on_fail{class,severity,message}, on_insufficient_evidence, tests. Rule types: presence, validity, threshold, cross-document equality with tolerance, temporal consistency. **Do not invent norms**; keep `[fill in]` where unconfirmed. Old applications replay against a new pack.

## 09 — Fraud patterns (all cross-institution)

ghost faculty (Neo4j, potential_discrepancy) · recycled land (Neo4j, potential_discrepancy) · reused FDR (Neo4j, potential_discrepancy) · pasted seal (Qdrant, anomaly_signal) · borrowed infrastructure (Qdrant, anomaly_signal) · template affidavits (Qdrant, anomaly_signal) · signatory clusters (Neo4j, anomaly_signal, advisory). The real Cypher for ghost faculty / recycled land / reused FDR is shown verbatim in the graph view's Cypher drawer.

## 10 — Forensic signal strengths

strong: DSC invalid or changed after signing, issuer record mismatch, QR payload ≠ printed text · medium: incremental PDF update after creation, text layer vs OCR diff, odd font span, near-duplicate stamp · **weak signals alone cannot raise severity above low**: image-editor as producer, ELA/noise, EXIF.

## 11 — Verification connectors

DigiLocker/NAD (mock) · DSC/eSign (real) · QR/reference decode (real decode, mock lookup) · prior AICTE records (synthetic DB) · MCA21 (mock) · GSTIN/PAN (mock) · state land/fire/building (manual queue). Connector interface: name, covers, is_mock, `verify(doc, claims) → VerificationResult`; timeout, 3 retries with backoff, circuit breaker → source_unavailable.

## 12 — Security, privacy, governance (RBAC + human authority)

| Role | Can | Cannot |
|---|---|---|
| Institution applicant | upload, self-check, own report, respond | forensic internals, triage scores, other institutions |
| Scrutiny officer | review assigned apps, correct fields, accept/dismiss/escalate | change rules, other regions |
| Senior reviewer | decide escalations, approve letters | edit the audit ledger |
| Rule administrator | author/test packs (publish needs second approval) | act on applications |
| Auditor | read ledger, replay runs, export | change anything |

Untrusted documents: document text is data-only for models; extracted models have no tools; injection-style text is itself an `anomaly_signal`. Tamper-evident chain + signed daily digest outside the DB. The system cannot send letters — officer action only; `confirmed_violation` needs officer acceptance with a reason.

## 13 — Eight reviewer-console views

Queue (triage order, top-3 reasons, SLA, filters) · Evidence split view (PDF + bbox ↔ facts/findings, click-to-jump) · Conflict view (one row per fact; form/documents/records/issuers each with value+date+source) · Graph view (entity neighbourhood, Cytoscape) · Verification timeline (status, timestamp, ref id, mocks labelled) · Decision bar (accept/dismiss/escalate, mandatory reason) · Institution self-check (fix list, no forensic detail) · Metrics board (computed live).

## 14–15 — Stack and deploy (context only)

FastAPI/LangGraph/Celery/PaddleOCR/vLLM/DINOv2-CLIP/rapidfuzz · PostgreSQL 16, Neo4j 5, Qdrant, MinIO, Redis, Keycloak · Next.js, PDF.js, Cytoscape.js, TanStack Table. The prototype replaces the GPU + real stores honestly — see the README Real-vs-Simulated table.

## 16 — The 13 planted faults and expected results

| # | Planted fault | Expected |
|---|---|---|
| 1 | Fire NOC date edited with an incremental save | `anomaly_signal` (medium) + `validity_gap` |
| 2 | Form 5.00 acres vs deed 3.20 acres | `potential_discrepancy`, both crops |
| 3 | Same faculty on two rosters, same session | `potential_discrepancy` (graph, across institutions) |
| 4 | Same FDR pledged by two institutions | `potential_discrepancy` (graph) |
| 5 | Classroom photo reused from another college | `anomaly_signal`, request more evidence |
| 6 | One seal pasted onto affidavits of three trusts | `anomaly_signal` |
| 7 | Missing affidavit | `completeness_gap`, instantly |
| 8 | Building completion certificate expired | `validity_gap` |
| 9 | Degree certificate vs mock NAD record | verification `mismatch` |
| 10 | Signed PDF modified after signing | `anomaly_signal` (strong) |
| 11 | Blurred faculty count | confidence gate; officer corrects live; **no false mismatch** |
| 12 | Hidden text instructing the AI to approve | `anomaly_signal`; nothing else changes |
| 13 | Fire department source offline | verification `source_unavailable`, manual queue |

Plus 5 clean controls (abbreviated names, poor scans, mid-year faculty move) → **zero high-severity findings**.

**Six-minute demo beats:** 0:00 queue + top reasons · 0:45 self-check · 1:30 split-view jump to deed p.3 · 2:30 graph, ghost faculty, Cypher live · 3:20 confidence gate fixes blurred digit · 4:00 prompt injection ignored + flagged · 4:40 rule replay vs last session · 5:20 ledger tamper breaks the chain.

## 17 — Metrics (computed from fixtures at runtime, shown honestly)

Field accuracy per doc type · discrepancy precision/recall vs the planted list · false-positive rate on clean controls · verification coverage · explainability coverage · time per application · alert latency.
