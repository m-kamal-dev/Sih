# AGENT BUILD PROMPT — EvidenceGraph Prototype (SIH26261 · AICTE · Smart Automation)

You are a senior full-stack engineer and product designer. Build a working, demo-ready prototype of **EvidenceGraph**, an agentic validation layer that sits beside the AICTE approval portal. The full architecture is in `EvidenceGraph_Architecture.html` in the project root. That file is the source of truth for behaviour, data models, terminology and the demo. This prompt tells you what to build from it, how it should look and move, and how to prove it works.

Work autonomously. Do not stop to ask questions: when something is ambiguous, pick the option closest to the architecture file, write the assumption in `docs/ASSUMPTIONS.md`, and continue.

---

## 0. Order of work (follow strictly)

1. **Read `EvidenceGraph_Architecture.html` completely** before writing any code. Extract it into `docs/SPEC_DIGEST.md`: the 6 design principles, the 8 agents with their guardrails, the 5 finding classes, the 6 verification statuses, the Postgres tables, the Neo4j model, the 13 planted faults in section 16, the 8 reviewer-console views in section 13, the 6-minute demo script, and the metrics in section 17.
2. Write `docs/PLAN.md`: folder layout, phase list, what is real and what is simulated (section 2 below).
3. Build in the phases in section 9. After each phase: typecheck, run tests, commit.
4. Finish with `README.md` containing a **Real vs Simulated** table, demo accounts, and run instructions.

If this prompt and the architecture file disagree on behaviour or terminology, the architecture file wins. For visual design, this prompt wins.

---

## 1. What you are building

A web application with four audiences, matching section 12 and 13 of the spec:

| Role | What they get |
|---|---|
| Scrutiny officer | Triage queue, evidence split view, conflict view, graph view, verification timeline, decision bar |
| Senior reviewer | Escalation decisions, approval and editing of deficiency letter drafts |
| Rule administrator | Rule pack viewer/editor, tests, replay against past applications, second-approval publish |
| Auditor | Hash-chained ledger viewer, tamper check, run replay, metrics board |
| Institution applicant | Self-check fix list only. No forensic internals, no triage score, no other institutions |

Include a visible **role switcher** in the header (labelled "Demo role switch") so a judge can see RBAC in one click. Enforce it in the UI and in the API layer.

### The six demo principles (from spec section 01). Every screen must make these visible:
- Facts carry provenance: document, page, bbox, extractor, confidence, `as_of`.
- Models extract, rules decide. Rule outcomes cite rule id, version and APH reference.
- No finding without evidence. A finding whose evidence does not resolve is not shown.
- Never fabricate verification. Use `pending`, `source_unavailable` or `manual_review` honestly.
- Suspicious is not forged. Finding class and verification status are separate axes.
- Augment, do not replace. Nothing adverse happens without an officer action.

---

## 2. Scope: what is real and what is simulated

The real architecture needs a GPU, Neo4j, Qdrant, vLLM and more. The prototype must run on a laptop with **one command and no GPU**. Build the full user experience on a typed data layer, implement the deterministic logic for real, and simulate the heavy models, labelling every simulation honestly.

**Implement for real (TypeScript, tested):**
- YAML rule engine: load rule packs, evaluate `assert` expressions with a small safe expression evaluator (no `eval`, no `new Function`), return pass / fail / insufficient_evidence, run the `tests:` block of every rule as unit tests.
- Rule replay: change a threshold in a new rule version, re-run a past session's applications, show a diff of changed findings.
- Cross-check: identifier-first matching, then fuzzy name matching (rapidfuzz-style normalisation, abbreviations, transliteration-aware lowercase/diacritics folding), values compared only for the same `as_of` date, ambiguous matches routed to review.
- Critic gate: drops or downgrades findings whose evidence does not resolve to a stored fact and crop; blocks accusatory wording; sends back once, then routes to a human.
- Confidence gate: per-type thresholds (identifiers stricter than names). Officer correction creates a new fact version with `source = human`; the original is marked superseded; dependent findings recompute live.
- Finding model and status model exactly as spec section 07.
- Hash-chained audit ledger using SHA-256 (Web Crypto or Node crypto): `hash = sha256(prev_hash || canonical(row))`. A "tamper one row" action must genuinely break verification from that row onward.
- Role-based access checks and the "system cannot send letters, only an officer action can" rule.
- Triage score with listed reasons, computed from findings and signal strengths (strong / medium / weak), where weak signals alone can never raise severity above low.

**Simulate (clearly labelled, schema-identical to the real thing):**
- OCR, layout and LLM extraction: precomputed facts with bboxes and confidences stored in fixtures.
- Vision models (stamp, photo near-duplicate): precomputed similarity results.
- Issuer connectors (DigiLocker/NAD, MCA21, GSTIN/PAN, fire and land sources): a connector registry with the spec's `Connector` interface, mock implementations returning all six statuses, timeouts and a circuit-breaker path. Every mock is labelled **MOCK** in the UI and has `is_mock = true` in data.
- Neo4j and Qdrant: in-memory graph and similarity tables behind the same query interface. Show the real Cypher text from spec section 09 in a read-only "Query" drawer, and mark results "precomputed on fixture graph".
- The agent graph run: a deterministic **run replay** (a timeline of node events with timestamps) that drives the pipeline view. It must look live but is honest in the README.

Never claim live AICTE integration. Use the phrase "designed for integration" in the UI copy where relevant.

---

## 3. Data: synthetic only

Generate fixtures with a seeded script (`scripts/generate-fixtures.ts`) so results are reproducible.

- **12 institutions**: 7 with planted faults, 5 **clean controls** with legitimate variation (abbreviated names, poor scans, a faculty member who really did move colleges mid-year). Controls must produce **zero high-severity findings**. This proves the false-positive rate.
- Three categories: EoA, intake increase, new programme. At least 8 documents per institution, with at least 10 distinct document types overall (sale deed, fire NOC, building completion certificate, faculty roster, degree certificate, FDR, trust affidavit, trust registration, floor plan, lab photos).
- **All 13 planted faults from spec section 16**, each producing exactly the finding class and verification status the spec lists:
  1. Fire NOC date edited with an incremental save → `anomaly_signal` (medium) + `validity_gap`
  2. Form 5.00 acres vs deed 3.20 acres → `potential_discrepancy` with both crops
  3. Same faculty on two rosters, same session → `potential_discrepancy` (graph)
  4. Same FDR pledged by two institutions → `potential_discrepancy` (graph)
  5. Classroom photo reused → `anomaly_signal`, request more evidence
  6. One seal pasted on affidavits of three trusts → `anomaly_signal`
  7. Missing affidavit → `completeness_gap`, instantly
  8. Expired building completion certificate → `validity_gap`
  9. Degree certificate vs mock NAD record → verification `mismatch`
  10. Signed PDF modified after signing → `anomaly_signal` (strong)
  11. Blurred faculty count → confidence gate, officer corrects live, no false mismatch
  12. Hidden text instructing the AI to approve → `anomaly_signal`; nothing else changes
  13. Fire department source offline → `source_unavailable`, moved to manual queue
- **Page renders**: do not depend on real scanned PDFs. Build a `PageViewer` interface with an implementation that renders synthetic document pages (React/SVG) with a "scanned" look (slight rotation, noise, blur, JPEG-like texture via CSS filters on a static layer). Bboxes in fixtures use the same coordinate space as these renders, so overlays are pixel-accurate. If time allows, add a second implementation using PDF.js over generated sample PDFs (pdf-lib); the interface must make this a drop-in swap.
- **Identity data rules**: names, trusts, survey numbers and IDs are fictional. PAN appears only as a salted hash prefix (for example `pan#a91f…c3`). Aadhaar numbers must never appear anywhere, including fixtures, logs, screenshots and the ledger. Add a test that greps the repo and build output for 12-digit patterns.
- **Do not invent regulatory numbers.** Every threshold, ratio and clause number must come from the real APH. Where the exact clause is not in the architecture file, keep the literal marker `[fill in]` in the rule file and show a small **"clause to be confirmed"** badge in the UI wherever that rule is cited. The demo rule pack should rely on rule types that need no invented norms: presence, validity (date in range), cross-document equality with tolerance, temporal consistency.

---

## 4. Screens and routes

Next.js App Router. Dense, keyboard-friendly, officer-grade.

| Route | Purpose | Must include |
|---|---|---|
| `/queue` | Officer triage queue | Applications ordered by triage score, top-3 reasons each, SLA timer, open-item counts, filters (category, region, status), virtualised table |
| `/applications/[id]` | Main workspace with tabs | Evidence · Conflicts · Graph · Verification · Report · Letter |
| `/applications/[id]` → Evidence | Split view | Page viewer with bbox overlays left; facts and findings right; clicking a finding jumps to the exact page and region |
| → Conflicts | Conflict view | One row per fact; columns for form, documents, prior records, issuers, each with value, date and source |
| → Graph | Entity neighbourhood | Cytoscape.js graph, e.g. a faculty member and every institution listing them this session; Cypher drawer |
| → Verification | Timeline | Each connector call: status, timestamp, reference id, field matches, MOCK label |
| → Report / Letter | Reporter output | Findings grouped by checklist item, triage reasons, deficiency letter draft with clause citations, editable, "Draft. Not sent" banner, send action only for senior reviewer |
| `/applications/[id]/decision` (bar, not page) | Decision bar | Accept / dismiss / escalate, **reason mandatory**, writes to the ledger |
| `/self-check/[id]` | Institution view | Fix list: missing items, expiring documents, form-vs-document mismatches. No forensic detail |
| `/pipeline/[runId]` | Agent graph replay | LangGraph-style node graph, per-node status, inputs/outputs drawer, interrupts shown as human checkpoints |
| `/confidence-gate` (modal over workspace) | HITL | Crop and extracted value; officer confirms or corrects; dependent finding recomputes |
| `/rules` | Rule admin | Pack list, YAML editor with live test results, version diff, replay against last session, "publish requires second approval" |
| `/ledger` | Auditor | Hash chain table, verify-chain button, **tamper one row** demo action, signed daily digest panel |
| `/metrics` | Metrics board | Field accuracy per doc type, discrepancy precision/recall vs planted list, false-positive rate on controls, verification coverage, explainability coverage, time per application, alert latency. **Computed from the fixtures at runtime, not hard-coded.** Show bad numbers honestly. |
| `/demo` | Presenter bar | Chips for 0:00, 0:45, 1:30, 2:30, 3:20, 4:00, 4:40, 5:20 that put the app in the right state for each beat of the six-minute script. Also a "reset demo data" action |

**Keyboard shortcuts** (shown in a `?` overlay): `J/K` next/previous in queue and findings, `Enter` open, `A/D/E` accept/dismiss/escalate (each opens the reason field), `G` graph, `/` search, `Esc` close.

**Wording rules.** Generated and static UI copy must never use the words "forged", "fake" or "fraud". Use "anomaly signal", "potential discrepancy", "needs verification". Add a unit test, run against all strings in fixtures, templates and the letter generator, that fails on those words.

---

## 5. Design direction

### 5.1 My recommendation overrides the earlier theme choice

The earlier shortlist (Monokai Matrix, with CRT scanlines, glitch text, `steps()` easing and neon lime/magenta) is a poor fit for this product, so **do not use it as the global theme**:

- The users are officers reading dense documents for hours. Scanlines, glitch effects and saturated neon on near-black reduce legibility and cause eye fatigue.
- The product's central message is calm, explainable, trustworthy. A "hacker" aesthetic signals the opposite to a government jury.
- Saturated red/magenta as the colour of every problem fights the spec's principle "suspicious is not forged". Alarm colour must be rare so it keeps its meaning.
- Scaling rows on hover (`scale(1.02)`) makes dense tables jitter and overlap neighbours.
- `steps()` easing and glitch motion look dated and feel gimmicky next to current tools such as Linear, Vercel and Raycast.

Instead build a design called **Evidence Desk**: restrained, dense, high-legibility, dark-first with a full light theme, and a few carefully chosen moments of motion that explain the system rather than decorate it.

**Keep a nod to the original taste in exactly two places**: the Cypher drawer and the ledger hash column may use a Monokai-style syntax palette on a terminal surface (monospace, `#A6E22E` strings, `#66D9EF` keywords). Everywhere else, use the tokens below.

### 5.2 Design tokens (CSS variables, Tailwind v4 `@theme` or equivalent)

**Dark (default)**
```
--bg-canvas:   #0B0E13
--bg-surface:  #11151C
--bg-raised:   #171C25
--bg-overlay:  #1D2430
--border:      #232A36
--border-strong:#2F3847
--text:        #E6EAF2
--text-muted:  #8B95A7
--text-faint:  #5F6A7D
--accent:      #5BC0EB     /* selection, focus rings, evidence links */
--accent-weak: rgba(91,192,235,.14)
```
**Light**
```
--bg-canvas:#F6F7F9  --bg-surface:#FFFFFF  --bg-raised:#F0F2F5  --border:#DDE1E8
--text:#161B22  --text-muted:#5A6577  --accent:#0B6FA4
```

**Semantic colours.** Finding class and verification status are separate axes (spec section 07), so they get separate visual languages. **Colour is never the only signal**: every chip also has an icon and a text label, and severity is also shown by fill density.

Finding class (rounded-rectangle chips):
```
completeness_gap       #6AA9FF   icon: file-minus
validity_gap           #F5B942   icon: clock
potential_discrepancy  #A78BFA   icon: not-equal / git-compare
anomaly_signal         #E879A6   icon: scan-search      (strength: weak=outline, medium=soft fill, strong=solid fill)
confirmed_violation    #F2555A   icon: shield-alert     (the ONLY use of red-as-alarm)
```
Verification status (pill chips with a leading dot):
```
verified            #3DDC97   dot, check
mismatch            #F2555A   dot, x
expired             #F5B942   dot, clock
pending             #8B95A7   pulsing dot (opacity only)
source_unavailable  #8B95A7   dashed outline, plug-zap
manual_review       #6AA9FF   user-round
MOCK badge          dashed amber outline, always beside any mock source
```
All text on these must meet **WCAG AA (4.5:1)**; verify with a script (`scripts/check-contrast.ts`) in both themes. If a colour fails, adjust it, keeping the hue.

### 5.3 Typography and layout
- UI font: **Geist Sans** or **Inter**. Monospace (identifiers, hashes, bbox coordinates, YAML, Cypher): **JetBrains Mono** or Geist Mono. Self-host via `@fontsource` packages so builds work offline. Use `font-variant-numeric: tabular-nums` for all numbers, timers and scores.
- Base size 14px, 13px in tables. Type scale 12/13/14/16/20/28.
- 4px spacing grid. Radius 6px for controls, 10px for panels. Borders over shadows; shadows only on overlays.
- Layout: left rail navigation (collapsible), top bar with role switcher, theme toggle and global search. The Evidence view is a resizable three-pane layout (queue sidebar, page viewer, facts and findings). Design for 1440px and 1920px primarily; remain usable at 1024px.
- Use shadcn/ui on Radix primitives, Lucide icons, TanStack Table with virtualisation, Cytoscape.js for the graph (style nodes by type, edges thin with arrowheads, conflict edges dashed in the discrepancy colour).
- Charts (metrics board): Recharts or visx, thin strokes, labelled directly where possible, colour-blind-safe, no 3D, no gradients.

### 5.4 Motion principles
Motion explains state changes. It must never be decoration.

- **Properties:** animate `transform` and `opacity` for movement and reveals. Short colour, background and border-colour transitions (≤200ms) are allowed for hover and focus. Never animate `width`, `height`, `top`, `left`, `margin` or `padding`. For expanding and collapsing and list reordering, use layout animations from the `motion` library (the successor to framer-motion), which animate with transforms, or the CSS `grid-template-rows: 0fr → 1fr` technique.
- **Durations:** hover/press 120ms; menus, tooltips, chips 160ms; panels, drawers, modals 200–240ms; route transitions 240ms at most. Exits run about 70% of the enter duration.
- **Easing:** `cubic-bezier(0.2, 0, 0, 1)` for entrances and movement, `cubic-bezier(0.4, 0, 1, 1)` for exits. No bounce or spring overshoot on data UI. A very light spring is acceptable only for the drawer and modal entrance.
- **`prefers-reduced-motion`:** replace all movement with instant or 80ms opacity changes. Include this in the tokens, not scattered per component. Test it.
- **Never use:** CRT scanlines, glitch or text-scramble effects, typewriter text, `steps()` easing, parallax, looping decorative animation, confetti, hover-scale on table rows or dense cards, count-up number animations on metrics.

### 5.5 Signature moments (build these well; each maps to the demo script)
1. **Finding → evidence jump.** Clicking a finding scrolls the page viewer to the page, then the bbox outline **draws in** (stroke-dashoffset, 240ms) and pulses once. The matching fact row in the right pane gets a 1s accent highlight. This is the "no finding without evidence" proof.
2. **Confidence gate resolves.** The blurred crop crossfades (opacity) to a sharpened crop when the officer confirms; the mismatch finding then collapses out of the list with a layout animation, and the triage score updates. The point: a blurred digit does not become a false mismatch.
3. **Pipeline replay.** Nodes light up in sequence following the run timeline. A dashed edge animates a flowing dash **only while the downstream node is active**, and stops when it finishes. Human interrupts appear as a distinct checkpoint node with a person icon that waits. The Critic's single send-back draws a returning edge once.
4. **Ledger tamper.** Edit one row; the hashes for that row and every row after it flip, in a staggered 40ms cascade, from verified green to the mismatch red, and a banner reads "Chain broken at #n". "Verify" restores the baseline from the signed anchor. This is a rare, legitimate use of alarm colour.
5. **Rule replay diff.** After re-running with a changed rule version, changed findings slide into place with layout animation and carry a brief accent highlight; unchanged ones stay still. A summary reads "N findings changed, N new, N cleared".
6. **Queue re-rank.** When a triage score changes, the row moves to its new position with a layout animation, so the officer sees why.
7. **Skeletons.** Loading uses skeletons with a subtle shimmer made by translating a gradient layer (`transform`), static under reduced motion.

Keep the surrounding chrome quiet. The above should be the only places that move noticeably.

---

## 6. Architecture of the code

```
/apps/web            Next.js (App Router, TypeScript strict), the whole UI
/packages/domain     zod schemas and TS types mirroring spec section 06 and 07
/packages/engine     rule engine, cross-check, critic, confidence gate, triage, ledger, connectors (all pure + tested)
/packages/fixtures   seeded generator, fixture JSON, synthetic page renderers
/docs                SPEC_DIGEST.md, PLAN.md, ASSUMPTIONS.md
/rules               YAML rule packs: aph-2024-27/ (three categories), each rule with tests
/scripts             generate-fixtures, check-contrast, grep-pii, verify-ledger
```
- State: TanStack Query for server-ish data from route handlers, Zustand for UI state (role, theme, selection, demo step). The route handlers read an in-memory store hydrated from fixtures and persisted to a JSON file so a reload keeps officer decisions. "Reset demo data" restores the seed.
- All domain types validated with zod at the boundary. Evidence pointers are typed so a finding cannot be constructed without at least one resolvable fact reference.
- Write the engine package with no UI imports so it can later move behind FastAPI as the spec describes.
- Run engines on the server (route handlers) except the rule editor's live test run and the confidence-gate recompute, which may run in the browser worker for instant feedback.

---

## 7. Rule packs

- One YAML file per rule, in the format of spec section 08: `id`, `version`, `aph_ref`, `applies_to`, `inputs` (with `min_confidence`), `assert`, `on_fail` (`class`, `severity`, `message` templates), `on_insufficient_evidence`, `tests`.
- Cover the five rule types: presence, validity, threshold, cross-document equality with tolerance, temporal consistency.
- Minimum demo pack: fire NOC validity, building completion certificate validity, land area form vs deed, faculty count form vs roster as of the same date, trust affidavit presence, FDR single-pledge, degree vs issuer record.
- A test runner executes every rule's `tests:` block in CI. A rule without tests fails the build.
- Message templates are rendered with the fact values and dates so every finding states exactly what conflicts.

---

## 8. Quality bar and acceptance criteria

The work is not finished until all of these pass. Run them yourself and report actual output.

**Correctness**
- `pnpm typecheck`, `pnpm lint`, `pnpm test` and `pnpm build` all pass.
- All 13 planted faults produce exactly the expected class and status. All 5 clean controls produce zero high-severity findings.
- Confidence gate: correcting the blurred value removes the false mismatch and updates the score.
- Ledger: valid chain verifies; tampering with any row fails verification at that row.
- Critic: a finding with an unresolved evidence pointer never reaches the UI; a finding containing banned wording is blocked.
- RBAC: an applicant cannot reach forensic data, triage score, or another institution's data (test the API, not only the UI).
- The prompt-injection fixture changes no outcomes and raises only an `anomaly_signal`.

**UX**
- A scripted Playwright test walks the six-minute demo end to end using the `/demo` presenter bar.
- Every chip has icon + text, not colour alone. `axe` reports no serious or critical issues on queue, workspace, rules, ledger and metrics.
- Colour contrast script passes in both themes.
- Full keyboard operation of the queue, findings and decision bar.
- `prefers-reduced-motion` verified.
- No layout shift during animations (check with a quick performance trace or Playwright CLS assertion).

**Honesty**
- README has a Real vs Simulated table that matches the code.
- Every mock source is labelled in the UI, API output and data.
- No unsourced statistics appear in the UI. Use only figures computed from the fixtures.
- `[fill in]` clause markers remain visible where unconfirmed.

---

## 9. Phases

1. **Foundations:** monorepo, tokens, theme toggle, shell layout, role switcher, domain schemas.
2. **Fixtures and engine:** generator, all 13 faults and 5 controls, rule engine with tests, cross-check, critic, confidence gate, ledger, triage.
3. **Workspace:** queue, evidence split view with bbox overlays and the finding-to-evidence jump, conflict view, decision bar.
4. **Depth views:** graph view with Cypher drawer, verification timeline with mock labels, report and letter, self-check view.
5. **Operations:** pipeline replay, rule admin with replay diff, ledger with tamper demo, metrics board.
6. **Presenter and polish:** `/demo` bar, keyboard shortcuts, skeletons, reduced motion, empty and error states, accessibility pass.
7. **Verification:** run section 8, fix failures, write README and a short `docs/DEMO_SCRIPT.md` aligned to the spec's six-minute script.

Build in small files. Verify after each phase. Do not rewrite whole files to make small changes. Do not leave `TODO` stubs in core logic or placeholder screens; if something is deliberately out of scope, say so in `docs/ASSUMPTIONS.md` and make the UI state it.

---

## 10. Final report format

When finished, reply with: (1) how to run it, (2) demo accounts or role switch instructions, (3) a table of the 13 planted faults and the observed result of each, (4) the exact output of the checks in section 8, (5) known limitations, stated plainly, (6) the three improvements you would make next.
