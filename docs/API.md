# EvidenceGraph API Documentation (v0.1.0)

This document is generated from real code in `apps/web/src/app/api/` and reflects the actual runtime contracts, schemas, roles, and error models.

---

## 1. Uniform Error Model

All error responses across the entire API follow this strict schema:

```json
{
  "error": {
    "code": "VALIDATION_FAILED | FORBIDDEN_ROLE | UNAUTHORIZED | RESOURCE_NOT_FOUND | ILLEGAL_TRANSITION | EVIDENCE_UNRESOLVED | RATE_LIMITED | INTERNAL_ERROR",
    "message": "Human-readable explanation of what went wrong",
    "details": {}
  }
}
```

No raw server stack traces are ever exposed in production responses.

---

## 2. Global Headers & Caching Conventions

- `x-eg-role`: User role for demo authentication (`scrutiny_officer`, `senior_reviewer`, `auditor`, `rule_admin`, `applicant`).
- `ETag`: SHA-1 content hash generated on every read response.
- `Cache-Control`: `private, max-age=0, must-revalidate` (repeat calls with `If-None-Match` return `304 Not Modified`).

---

## 3. Route Inventory

### 3.1 Health & Live Synchronization

#### `GET /api/health`
- **Purpose**: System health, dataset version, and cryptographic ledger integrity.
- **Roles Required**: Any role.
- **Request**: None.
- **Response Shape (200)**:
  ```json
  {
    "status": "ok",
    "version": "0.1.0",
    "datasetVersion": 1,
    "ledgerHeadHash": "a1b2c3...",
    "chainValid": true,
    "checkedRows": 150,
    "brokenAt": null,
    "timestamp": "2026-10-25T22:30:00.000Z"
  }
  ```

#### `GET /api/events`
- **Purpose**: Server-Sent Events (SSE) stream for real-time consistency across screens.
- **Roles Required**: Any authenticated role.
- **Stream Format**: `text/event-stream`.
- **Emitted Event Types**:
  - `finding.updated`: `{ appId, findingId, status, actor }`
  - `fact.corrected`: `{ appId, factId, replacementFactId, correctedValue }`
  - `decision.recorded`: `{ appId, findingId, action, actor }`
  - `ledger.appended`: `{ seq, action, at }`
  - `verification.updated`: `{ appId, attemptId, status }`
  - `dataset.reset`: `{ at }`

---

### 3.2 Cases & Workspaces (`/api/cases`)

#### `GET /api/cases`
- **Purpose**: Paginated, filterable, and sortable case summaries for the Inbox and review queue.
- **Roles Required**: `scrutiny_officer`, `senior_reviewer`, `auditor`, `rule_admin`.
- **Query Parameters**:
  - `page`: integer (default `1`)
  - `limit`: integer (default `20`, max `50`)
  - `status`: optional string filter (`UNDER_REVIEW`, `ACCEPTED`, `DEFICIENCY_ISSUED`)
  - `type`: optional string filter (`EOA`, `INTAKE_INCREASE`, `NEW_PROGRAMME`)
  - `search`: optional substring search (matches ID, name, code)
  - `sortBy`: `priority | institution | deadline | id` (default `priority`)
  - `sortOrder`: `asc | desc` (default `asc`)
- **Response Shape (200)**:
  ```json
  {
    "items": [
      {
        "id": "EOA-2026-0142",
        "institutionId": "INST-001",
        "institutionName": "Vikramsheela Institute of Technology",
        "applicationType": "EOA",
        "priorityScore": 84,
        "priorityRank": 1,
        "status": "UNDER_REVIEW",
        "deadline": "2026-11-15T00:00:00.000Z",
        "reasons": ["Discrepancy in land area between deed and form", "Unverified fire safety NOC"]
      }
    ],
    "pagination": { "page": 1, "limit": 20, "total": 12, "totalPages": 1 }
  }
  ```

#### `GET /api/cases/:id`
- **Purpose**: Case header with real-time aggregated counts for all workspace sections.
- **Roles Required**: `scrutiny_officer`, `senior_reviewer`, `auditor`, `rule_admin`, `applicant` (own case only).
- **Response Shape (200)**:
  ```json
  {
    "id": "EOA-2026-0142",
    "institutionId": "INST-001",
    "institutionName": "Vikramsheela Institute of Technology",
    "applicationType": "EOA",
    "priorityScore": 84,
    "priorityRank": 1,
    "status": "UNDER_REVIEW",
    "deadline": "2026-11-15T00:00:00.000Z",
    "reasons": ["..."],
    "counts": {
      "documents": 8,
      "mismatches": 2,
      "checks": 3,
      "connections": 14
    },
    "findingsSummary": {
      "total": 5,
      "accepted": 0,
      "dismissed": 0,
      "pending": 5
    },
    "nextStep": {
      "label": "Review 2 mismatches",
      "section": "mismatches"
    }
  }
  ```

#### `GET /api/cases/:id/documents`
- **Purpose**: Required checklist documents with file locations and bounding box annotations.
- **Response (200)**: `{ "caseId": "...", "documents": [...] }`

#### `GET /api/cases/:id/mismatches`
- **Purpose**: Discrepancies across Form, Document crops, Historical records, and External sources.
- **Response (200)**: `{ "caseId": "...", "mismatches": [...], "facts": [...] }`

#### `GET /api/cases/:id/checks`
- **Purpose**: External verification check attempts (Fire NOC, University affiliation, Land registry).
- **Response (200)**: `{ "caseId": "...", "checks": [...] }`

#### `GET /api/cases/:id/connections`
- **Purpose**: 2-hop entity neighborhood graph subgraph (nodes and edges).
- **Response (200)**: `{ "caseId": "...", "nodes": [...], "edges": [...] }`

#### `GET /api/cases/:id/report`
- **Purpose**: Aggregated findings by clause and generated draft notice letter.
- **Response (200)**: `{ "caseId": "...", "summary": {...}, "findings": [...], "notice": {...} }`

#### `POST /api/cases/:id/decision`
- **Purpose**: Record scrutiny or senior reviewer decision on a finding.
- **Roles Required**: `scrutiny_officer`, `senior_reviewer` (`escalate` action requires `senior_reviewer`).
- **Request Body (strict)**:
  ```json
  {
    "findingId": "find_1",
    "action": "accept | dismiss | escalate",
    "reason": "Detailed justification"
  }
  ```
- **Response (200)**: `{ "ledgerRow": { "seq": 151, "hash": "...", "action": "finding.accept" } }`

#### `POST /api/cases/:id/facts/:factId/correct`
- **Purpose**: Confidence gate value correction for OCR/extraction errors.
- **Roles Required**: `scrutiny_officer`, `senior_reviewer`.
- **Request Body (strict)**:
  ```json
  {
    "correctedValue": "5.00"
  }
  ```
- **Response (200)**: Replacement `Fact` object with `supersededBy` linked.

---

### 3.3 Rule Pack, Auditing & Metrics

#### `GET /api/rules`
- **Roles Required**: `scrutiny_officer`, `senior_reviewer`, `auditor`, `rule_admin`.
- **Response (200)**: `{ "rules": [...], "ruleCount": 14 }`

#### `GET /api/ledger`
- **Roles Required**: `scrutiny_officer`, `senior_reviewer`, `auditor`, `rule_admin`.
- **Response (200)**: `{ "rows": [...], "integrity": { "ok": true, "brokenAt": null }, "digest": {...} }`

#### `POST /api/ledger`
- **Purpose**: Auditor tamper injection demo.
- **Request Body (strict)**: `{ "seq": 12, "patch": { "action": "malicious" } }`
- **Response (200)**: `{ "row": {...}, "integrity": { "ok": false, "brokenAt": 12 } }`

#### `POST /api/ledger/verify`
- **Purpose**: Explicit cryptographic verification check.
- **Response (200)**: `{ "integrity": { "ok": true }, "digest": {...} }`

#### `GET /api/metrics`
- **Purpose**: Dataset telemetry, caught vs planted faults, and accuracy metrics.
- **Roles Required**: Non-applicant roles.
- **Response (200)**: Calculated `MetricBoard` object.

#### `POST /api/demo/reset`
- **Purpose**: Resets dataset to seed state and clears local patches.
- **Response (200)**: `{ "ok": true, "message": "Dataset reset to seed", "datasetVersion": 2 }`

### 3.4 Live Document Check

#### `POST /api/forensics/analyze`
- **Purpose**: Analyse one uploaded PDF from its own bytes. The file is processed in memory and never stored.
- **Roles Required**: Non-applicant roles (institutions never see forensic detail).
- **Request**: `multipart/form-data` with field `file`, or `application/json` `{ "fileName": "noc.pdf", "contentBase64": "..." }`, or a raw body. Maximum 10 MB.
- **Response (200)**: `{ sha256, sizeBytes, metadata, structure, signatures[], text, dates[], revisionChanges[], signals[], level, summary, nextStep, limits[] }`. `level` is `none | low | medium | high`; weak signals alone never exceed `low`.
- **Errors**: `403 FORBIDDEN_ROLE`, `413` over 10 MB, `422 VALIDATION_FAILED` for an empty upload.

#### `GET /api/forensics/samples/{name}`
- **Purpose**: Download one of six generated, synthetic sample PDFs: `clean-fire-noc`, `expired-fire-noc`, `edited-after-creation`, `signed-intact`, `signed-then-modified`, `hidden-instruction`.


### AI case copilot

Both routes are for internal roles only; the applicant role gets `403`. They never write to the store or the ledger.

#### `GET /api/applications/{id}/ai-brief`

Returns `{ brief, suggestedQuestions }`. `brief` has `mode` (`"ai"` or `"rules"`), `modeNote`, `model`, `headline`, `summary`, `concerns[{ text, findingIds }]`, `nextSteps[]` and `questionsForInstitution[]`. Real AI briefs are cached until the case's findings or issuer checks change.

#### `POST /api/applications/{id}/ai-ask`

Body `{ "question": string }` (3 to 500 characters). Returns `{ mode, modeNote, model, question, answer, findingIds }`. `422` for a too-short or too-long question, `400` for an unreadable body.

#### `POST /api/ai/read`

Now also returns `validation: { checks[{ id, title, state: "pass" | "review" | "missing", detail }], passed, needsReview, missing }` next to the AI reading.
