# UX Audit Report — EvidenceGraph (Round 2 Baseline)

Conducted on local production build with Playwright Chromium at 1440×900 viewport.
Screenshots saved under `docs/screenshots/baseline/`.

---

## 1. Route-by-Route UX Audit Table

| Route | Purpose in One Sentence | Primary Action | Tabs / Controls Visible | Jargon / Internal Terms Shown | Links to Related Screens? | Baseline Screenshot |
|---|---|---|---|---|---|---|
| `/` | Landing / entry redirecting to queue | Select role or enter queue | Top nav (5), role switch (5), search | None on landing | Yes (`/queue`) | `docs/screenshots/baseline/route-root.png` |
| `/queue` | Shows list of incoming applications for review | Click an application to open | Role switch, filters (type, status), table sort, rows (12) | "Triage score", "Confidence gate", "APH 2024", "HITL" | Links to `/applications/[id]` but no reason chips | `docs/screenshots/baseline/route-queue.png` |
| `/applications/[id]/overview` | Case overview showing metadata and findings | "Review findings" or switch tabs | 9 horizontal tabs, summary cards, action buttons | `completeness_gap`, `validity_gap`, `as_of`, layer numbers | Isolated; tabs don't show counts or status | `docs/screenshots/baseline/case-overview.png` |
| `/applications/[id]/evidence` | Document checklist and image viewer | View document crop | 9 tabs, document selector, canvas zoom | `bbox`, coordinates, "Evidence crop", unindexed pages | No direct link to the mismatch or rule that triggered it | `docs/screenshots/baseline/case-evidence.png` |
| `/applications/[id]/conflicts` | List of detected discrepancies | Expand conflict row | 9 tabs, conflict filters, resolve modal | `potential_discrepancy`, `anomaly_signal`, `entity neighbourhood` | Shows conflicts without linking back to document page | `docs/screenshots/baseline/case-conflicts.png` |
| `/applications/[id]/verification` | Third-party verification checks | Retry check or manual override | 9 tabs, check timeline, retry triggers | "Backoff", "Circuit breaker", `source_unavailable` | No link between verification result and draft notice | `docs/screenshots/baseline/case-verification.png` |
| `/applications/[id]/graph` | Cytoscape network entity neighbourhood | Pan / zoom graph | 9 tabs, node filter, Cypher query box | "Cypher query", `RLS`, "Layer 2 expansion", node IDs | Technical Cypher drawer visible by default; no plain summary | `docs/screenshots/baseline/case-graph.png` |
| `/applications/[id]/forensics` | Image tampering & metadata analysis | Inspect ELA / metadata | 9 tabs, forensic viewer, hex inspector | "ELA diff", "Quantization table", "Ghost artifacts" | Forensic finding doesn't link to the case decision | `docs/screenshots/baseline/case-forensics.png` |
| `/applications/[id]/pipeline` | Execution run steps of multi-agent pipeline | Re-run or inspect step | 9 tabs, agent step tree, raw JSON | "Critic agent", "Presence agent", "Replay token" | Pure internal engineering visualization; dead end | `docs/screenshots/baseline/case-pipeline.png` |
| `/applications/[id]/decision` | Review findings and make approval decision | Approve / Reject / Escalate | 9 tabs, decision form, radio options | "Statutory declaration", "HITL authority", "APH penalty" | Doesn't show draft notice inline; links to separate letter tab | `docs/screenshots/baseline/case-decision.png` |
| `/applications/[id]/letter` | Generates official notice letter | Print / export notice | 9 tabs, export PDF button, text preview | "Deficiency notice", clause citations | Letter findings do not link back to evidence crops | `docs/screenshots/baseline/case-letter.png` |
| `/rules` | View and edit AICTE approval rules | Edit rule YAML / test diff | Rule table, YAML editor, test runner | "AST parse", "Cypher assertion", "YAML schema" | No link from a rule to "cases affected by this rule" | `docs/screenshots/baseline/route-rules.png` |
| `/ledger` | Cryptographic audit trail of actions | Verify hash chain | Ledger timeline, "Verify chain" button | "Merkle root", "SHA-256", "Head hash", `prev_hash` | Entries do not link back to case or finding | `docs/screenshots/baseline/route-ledger.png` |
| `/metrics` | Statistical evaluation and model telemetry | Change date filter | 4 chart widgets, KPI cards | "Precision/Recall", "Planted fault detection", "Critic dropout" | Metric numbers cannot be clicked to view underlying cases | `docs/screenshots/baseline/route-metrics.png` |
| `/demo` | Presenter reset and scenario launcher | Trigger demo scenarios | Scenario cards, reset button | "Scenario seed", "Fault injection" | Standalone presenter utility | `docs/screenshots/baseline/route-demo.png` |

---

## 2. Honest List of UX Deficiencies & Core Friction Points

### A. Confusing Navigation & Tab Clutter
1. **Nine Flat Workspace Tabs**: An application displays nine tabs (`overview`, `evidence`, `conflicts`, `verification`, `graph`, `forensics`, `pipeline`, `decision`, `letter`). The order does not follow the user's natural review flow (*see what needs attention → check evidence → review mismatches → check official records → examine connections → decide & notify*).
2. **Every Tab is a Full Page Navigation**: Switching tabs takes ~580 ms and triggers a full page re-render, creating noticeable visual flicker and loss of scroll position.
3. **No Badges or Status on Tabs**: The user cannot tell from the tab bar whether there are 0 or 5 mismatches, or if verifications have failed, without clicking through all tabs.

### B. Severe Jargon & Internal System Terms
1. **Developer / Forensic Terms Exposed**: Raw technical labels such as `completeness_gap`, `potential_discrepancy`, `bbox`, `as_of`, `RLS`, and `layer numbers` are displayed prominently in the default view.
2. **Agent Internal Names**: Names like "Critic Agent", "Presence Rule", and "Circuit Breaker" confuse non-technical regulatory officers.
3. **Cypher Query Editor**: Exposed directly on the Graph tab instead of being tucked behind an auditor "Technical details" disclosure.

### C. Missing Integration & Broken Cross-Links
1. **Isolated Screens**: A finding appearing in the Overview does not link directly to the specific page and bounding box in the Evidence tab.
2. **Traceability Gap**: The user cannot trace a finding backward to its extracted document crop or forward to the audit trail.
3. **Dead-End Insights & Metrics**: High-level charts show accuracy and issue counts, but clicking a bar or KPI does not filter or navigate to the relevant cases.

### D. Visual Design & Theme Inflexibility
1. **Single Dark/Muted Aesthetic**: The app lacks a professional, crisp light mode ("Architectural Parchment") suitable for daytime institutional work.
2. **No Physical Theme Toggle**: Theme switcher is either missing or hidden in sub-controls without smooth transition.
3. **Low Contrast on Certain Badges**: Muted status pills and subtle text colors fail WCAG AA contrast thresholds.

---

## 3. Targeted Solution (Roadmap for Overhaul)

1. **Replace 9 Tabs with 6 Guided Sections in a Single `/cases/[id]` Workspace**:
   - 1. Summary
   - 2. Documents *(n)*
   - 3. Mismatches *(n)*
   - 4. Official checks *(n)*
   - 5. Connections *(n)*
   - 6. Decision & notice
2. **5-Item Role-Filtered Sidebar**: Inbox, Cases, Rules, Audit trail, Insights.
3. **Plain Language Terminology Everywhere**: Complete mapping of system codes to clear human language (e.g. `potential_discrepancy` → *"Possible mismatch"*).
4. **Interactive Trace Component**: Full breadcrumb trace from Document Crop → Extracted Value → Rule → Finding → Official Check → Decision → Audit Trail.
5. **Architectural Parchment (Light) & Crimson Intelligence (Dark) Themes**: Complete with top-bar physical pill switch, View Transitions, and strict WCAG AA compliance.
