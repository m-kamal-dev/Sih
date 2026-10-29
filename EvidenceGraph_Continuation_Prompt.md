# AGENT PROMPT — Continue and Complete the EvidenceGraph Prototype (SIH26261, Round 2)

You are taking over a partly finished prototype of **EvidenceGraph**, an agentic validation layer that sits beside the AICTE approval portal. The spec is the architecture HTML in the repo root (`EvidenceGraph Architecture.html`, note the space in the filename). The original build brief is `EvidenceGraph_Agent_Prompt.md` in the repo root. This prompt replaces the earlier audit-and-fix prompt, whose work was only partly completed. Your job is to **verify what exists, finish what is half-done, fix what is wrong, and build what is missing**, then prove it with a running app and pasted output.

Work autonomously. When something is ambiguous, pick the option closest to the spec, record it in `docs/ASSUMPTIONS.md`, and keep going. Do not stop to ask questions.

---

## 0. What is known about the current state (treat as claims to verify, not facts)

Top level of the repo: `.agents/tasks`, `apps/web`, `docs`, `packages`, `rules/aph-2024-27`, the spec HTML, the build brief, root `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `vitest.config.ts`. About 8 commits. There is no root `README.md`, no top-level `scripts/` folder and no CI config visible.

From the previous working session (verify each item on disk):
- Phase A was done: `docs/AUDIT_STATE.md` exists. Root tooling was fixed (typescript and vitest added at the root, a flat ESLint config written). At that point: 64 tests across 5 files, typecheck, lint and build were green.
- A real bug was found and fixed: the checklist compared semantic slot names against row ids, causing about 10 false "completeness gap" findings on every application. The checklist now carries real expected slots.
- **B1 was in progress:** a zod discriminated union for evidence (`fact_ref | crop_ref | absence_receipt`), a Critic rework, a `checklist_item` field on presence rules, and typed absence receipts.
- **B2 was in progress:** replacing placeholder anchors on graph findings with real roster-entry and FDR evidence in the fixtures. The session ended with **typecheck failing** after these edits.
- Phases B3 to G (graph-rule scoping verification, confidence convention, test-expectation log, fault 13 and fault 7 verification, clean-control variation, fault matrix file, remaining engine and UI completion, Playwright, a11y, docs) were not completed.

Assume nothing below is finished until you have seen it work.

---

## 1. Ground rules

1. **Source of truth:** spec HTML > build brief > this prompt > existing code. Where code contradicts the spec, the code is wrong.
2. **Never edit a test expectation to get green** unless you first show the expectation contradicts the spec. Log every such change in `docs/TEST_EXPECTATION_CHANGES.md` (test, old, new, spec section). Otherwise fix the code.
3. **Never weaken a safeguard to get green.** The Critic's evidence requirement, the wording gate, human-authority rules and role checks are the product. Loosening any of them requires a written justification and a negative test.
4. **No claims without output.** Every statement in a status update or the final report must be backed by pasted command output, a test name, or a screenshot path.
5. **One phase at a time, one commit per phase.** After each phase run `pnpm typecheck && pnpm lint && pnpm test`, commit, and print a one-line status: `PHASE <n> <name>: <pass|partial|blocked> — tests <passed>/<total> — <what changed>`.
6. **No stubs.** No `TODO`, placeholder screens or hard-coded demo numbers. If something is out of scope, say so in `docs/ASSUMPTIONS.md` and make the UI state it.
7. **Never invent APH numbers or clauses.** Keep `[fill in]` where unconfirmed and show the "clause to be confirmed" badge in the UI.
8. **Synthetic data only.** No Aadhaar-like 12-digit sequences anywhere; PAN only as a salted hash prefix.
9. **Do not rewrite whole files for small changes.** Small, reviewable diffs.

**If time runs short, finish in this priority order:** (1) green baseline, (2) evidence integrity (Critic, absence receipts, real evidence on graph findings), (3) fault matrix test with all 13 faults, (4) the finding-to-evidence jump in the UI, (5) confidence gate, (6) ledger tamper, (7) README with an honest Real vs Simulated table, (8) everything else.

---

## 2. Phase 0 — Green baseline and honest inventory (change as little as possible)

1. `git status`, `git log --oneline`, `git ls-files | head -300`. Record uncommitted or untracked files. Do not discard anyone's work.
2. Run and paste raw output of `pnpm install`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`.
3. **Fix typecheck first.** Resolve the failures left by the in-flight B1 and B2 edits. Check `git diff` over `packages/domain` for accidentally deleted schema lines (the `Fact` schema opener was already lost once and restored). Get all four commands green. If B1 and B2 are entangled, finish B1 completely first.
4. Rename the spec to `EvidenceGraph_Architecture.html` with `git mv` and update every reference (build brief, docs, README). Add the build brief under `docs/` if not already there.
5. Leftovers: delete debug files (for example `packages/engine/.tmp-debug.ts`) and grep for `TODO|FIXME|console.log|debugger|\.only|\.skip|probe|tmp-debug`. Decide whether `.agents/tasks` belongs in the repo; if not, add it to `.gitignore` and untrack it.
6. Write `docs/CONTINUATION_STATE.md`: a table of every item in sections 3 to 9 below with status `done | partial | missing`, each backed by evidence (file path, test name, or command output).
7. Commit. Print the Phase 0 status line.

---

## 3. Phase 1 — Evidence integrity (finish B1, highest priority)

**Spec rule:** no finding without evidence; the Critic drops any finding whose evidence does not resolve to a stored fact and crop.

1. Evidence is a discriminated union in `packages/domain`: `fact_ref | crop_ref | absence_receipt`. Validate with zod at every boundary.
2. `absence_receipt` is allowed **only** for a `completeness_gap` produced by a **presence rule**. Shape: `{ kind: "absence_receipt", checklist_slot, expected_doc_type, checklist_version, checked_at }`. The Critic validates that the slot exists in the cited checklist version and that no document is filed in that slot.
3. **No silent default.** If `kind` was defaulted to `"fact_ref"` for backward compatibility, remove the default from new code paths, or ensure an object without a real resolvable fact fails. Add a test: evidence missing `kind` and not resolving to a stored fact is dropped.
4. **Negative tests, one per class:** an empty-evidence finding of class `validity_gap`, `potential_discrepancy`, `anomaly_signal` and `confirmed_violation` is dropped. A presence-rule `completeness_gap` with a valid receipt survives. A receipt for a slot that **has** a document is dropped. A receipt with an unknown checklist version is dropped. A receipt on a non-presence rule is dropped.
5. Mixed evidence: one resolvable fact plus unresolved pointers keeps the finding with only the resolvable evidence. Only unresolved or quarantined evidence drops it.
6. Every `checklist_item` named in a rule YAML must exist in the checklist. Add a test that scans all rule packs.
7. Critic checks each have their own test: unresolved evidence, unknown rule version, contradicting findings, accusatory wording (banned terms: "forged", "fake", "fraud"), and the one-time send-back followed by human routing.
8. UI: an absence receipt renders as "Required item not found in the submission" with the checklist slot and version. Never as a broken evidence link.
9. Commit. Print the status line.

---

## 4. Phase 2 — Real evidence on graph findings, scoping, normalisation (B2, B3)

1. **Ghost faculty (fault 3):** the finding's evidence must be the two actual roster-entry facts, one per institution, each with page and bbox in its own roster document (not a placeholder fact). **Reused FDR (fault 4):** the two FDR facts with their crops. Add a test asserting each evidence pointer resolves to a fact of the right key whose document belongs to one of the two member institutions.
2. In the running UI, click each evidence item and confirm it jumps to the page and bbox showing the conflicting entry. Save screenshots.
3. **Scoping:** a cross-institution finding appears on **both** member applications and on no other. Each links to its counterpart (`crossApplication`) and the UI shows "Also on <application id>". Rule tests must exercise the real scoping path, not a test-only bypass; if injected pairs bypass scoping, rebuild those tests on a small fixture graph.
4. **Open-ended dates:** `to: null`, `to: ""` and missing `to` normalise identically, with tests for each. Fix the marshalling so open-ended is `null` at the source and keep the normaliser as a guard. Overlap is inclusive on boundaries. Add tests for touching ranges, nested ranges, non-overlapping ranges, same session and different session.
5. Commit. Print the status line.

---

## 5. Phase 3 — Rules, confidence, fault matrix, controls (B4 to B8, Phase C)

1. **Confidence convention:** the convention is the full fact key plus `_confidence` (for example `faculty.roster_count_confidence`). Document it in `docs/RULES.md`. List every rule that uses `min_confidence` and confirm each follows it. Per-field-type thresholds live in one config file (identifiers stricter than names).
2. `runRuleTests` must be pure and must not mutate rule test data. Add a test that runs the whole rule-test set twice in one process with identical results.
3. **Confidence gate semantics:** below-threshold value gives `insufficient_evidence` and a gate interrupt, never a mismatch. A human correction creates a new fact version (`source = human`, original marked superseded); dependent findings recompute; a ledger entry is written.
4. **Edited tests to re-justify, each against the spec:** fault 9 (degree certificate vs mock NAD must give verification `mismatch`); the cross-document tolerance test (needs cases just inside, exactly on, and just outside the boundary); the `critiqueAll` test (separate tests per Critic check, see Phase 1.7). Log them.
5. **Fault 13 (fire source offline):** final stored status is `source_unavailable`, not `pending`. Retries with backoff are recorded, the circuit breaker state is shown, and a manual-queue item with a prefilled verification request exists. It renders in the Verification timeline and the officer queue.
6. **Fault 7 (missing trust affidavit):** the omission is declared in the fault matrix, not special-cased by application id inside assembly. The `completeness_gap` appears at intake with an absence receipt. The other 11 institutions keep their affidavits.
7. **Fault matrix:** create one declarative file (for example `packages/fixtures/src/faults.ts`) listing all 13 faults with institution id, document, planted mutation, expected finding class and severity, expected verification status, expected detecting agent, and spec section. A test iterates it and asserts **exactly** the expected findings, with resolvable evidence, and fails with a readable message on missing or extra findings. A second test asserts the fixture generator is deterministic (same seed gives identical output).
8. **Fault 12 (prompt injection):** only an `anomaly_signal` results. Add a differential test: outcomes for that application are identical to a version without the hidden text apart from that one signal.
9. **Clean controls:** 12 institutions, 7 faulted and 5 controls, each control with its documented legitimate variation (abbreviated or transliterated name, degraded scan, a faculty member who really moved colleges with non-overlapping dates). Assert each control **evaluated and cleared** its near-miss (show the evaluated-and-cleared trace, not just absence of findings). Assert zero findings of severity high or above on controls. Low or medium informational findings are acceptable; report them.
10. Commit. Print the status line.

---

## 6. Phase 4 — Engine completeness

Verify each item exists and is tested; build what is missing.

- **Rule engine:** safe expression evaluator (no `eval`, no `new Function`), five rule types (presence, validity, threshold, cross-document equality with tolerance, temporal consistency), `on_insufficient_evidence` routing, every rule's `tests:` block run in CI, a rule without tests fails the build. Rule packs in `rules/aph-2024-27` carry `aph_ref`; unconfirmed ones keep `[fill in]`.
- **Rule replay:** a new rule version re-run over the last session produces a diff (changed, new, cleared); old findings keep their original rule version. Tested.
- **Cross-check:** identifier-first, then fuzzy names with abbreviation and transliteration-aware normalisation, compare only on the same `as_of`, route ambiguous matches to review.
- **Triage score:** listed reasons; weak signals alone can never raise severity above low (property-style test).
- **Signal strengths:** encoded as data in one place, per spec section 10.
- **Finding and status:** two independent axes enforced by types and zod enums.
- **Connectors:** registry with the spec's interface, timeout, three retries with backoff, circuit breaker, all six statuses reachable, `is_mock` on every mock result.
- **Ledger:** `hash = sha256(prev_hash || canonical(row))` with deterministic canonicalisation (sorted keys). Tests: valid chain, tampered middle row, tampered first row, reordered rows. Daily digest anchor stored outside the main store.
- **Human authority:** the system cannot send a letter; only a senior reviewer action can. A `confirmed_violation` requires officer acceptance with a non-empty reason. Tested at the API layer.
- **Wording gate:** a test over all user-visible strings (fixtures, rule templates, report and letter generators, UI copy) fails on "forged", "fake" or "fraud".

Commit. Print the status line.

---

## 7. Phase 5 — Frontend completion (Evidence Desk)

For each route, **load it in a real browser, record console errors, and save screenshots at 1440px in dark and light themes** under `docs/screenshots/`.

| Route | Must work |
|---|---|
| `/queue` | Ranked by triage score, top-3 reasons, SLA timer, filters, virtualised table. Clean controls must not show spurious gaps |
| `/applications/[id]` Evidence | Page viewer with bbox overlays; finding click scrolls to the page, bbox outline draws in (240ms) and pulses once; matching fact row highlights; absence receipts show the checklist-slot panel instead of a bbox |
| Conflicts | One row per fact: form, documents, prior records, issuers, each with value, date and source |
| Graph | Cytoscape neighbourhood for faculty and FDR cases; read-only Cypher drawer from spec section 09 marked "precomputed on fixture graph"; "Also on <id>" links |
| Verification | Every connector call: status, timestamp, reference id, field matches, MOCK label; fault 13 shows retries and the breaker |
| Report and Letter | Findings grouped by checklist item, triage reasons, letter with clause citations, "Draft. Not sent" banner; send only for the senior reviewer role; unconfirmed clauses badged |
| Decision bar | Accept / dismiss / escalate, reason mandatory, writes to the ledger |
| Confidence gate (modal) | Crop plus value; confirm and correct paths; dependent finding recomputes; triage score updates |
| `/self-check/[id]` | Applicant sees only the fix list. API checks as applicant: forensic data, triage score and other institutions return 403 or are absent |
| `/pipeline/[runId]` | Node graph, per-node status, human checkpoint node; dashed flow animation only while the downstream node is active |
| `/rules` | YAML editor with live tests, version diff, replay against the last session, publish requires second approval |
| `/ledger` | Hash chain table, verify, tamper-one-row with staggered hash cascade, "Chain broken at #n", restore |
| `/metrics` | **Computed from fixtures at runtime**, no hard-coded numbers: precision and recall vs the fault matrix, false-positive rate on controls, verification coverage, explainability coverage, time per application, alert latency. Unfavourable numbers shown as they are |
| `/demo` | Presenter chips for 0:00, 0:45, 1:30, 2:30, 3:20, 4:00, 4:40, 5:20 set the right state and URL; "Reset demo data" restores the seed |

Also: empty, loading and error states on every data view (no raw stack traces); a role switcher labelled "Demo role switch" enforced in UI and API; keyboard shortcuts `J/K`, `Enter`, `A/D/E` (reason required), `G`, `/`, `Esc`, with a `?` overlay.

**Design audit (Evidence Desk, build brief section 5):**
- Remove any leftover scanlines, glitch or text-scramble effects, `steps()` easing, hover-scale on rows, springs on data UI, confetti, count-up animations, and `Monokai` styling outside the Cypher drawer and ledger hash column.
- Chips have icon and text, never colour alone. Finding classes and verification statuses use separate visual languages. Red is reserved for `confirmed_violation` and a broken ledger.
- Write and run `scripts/check-contrast.ts` for both themes (WCAG AA 4.5:1); fix failures by adjusting lightness, keeping hue.
- `prefers-reduced-motion` handled in one central place (movement becomes instant or 80ms opacity).
- No animation of `width`, `height`, `top`, `left`, `margin` or `padding`: confirm with a repo grep and a Playwright layout-shift check during the signature moments (evidence jump, confidence gate, pipeline replay, ledger tamper, rule replay diff, queue re-rank).
- Fonts self-hosted (`@fontsource`), so builds and the demo work offline.

Commit. Print the status line.

---

## 8. Phase 6 — End-to-end verification and CI

1. **Playwright demo walkthrough** via the `/demo` presenter bar, asserting at each beat: 0:00 queue shows the top application with three reasons; 0:45 self-check shows the missing affidavit and the expiring document; 1:30 land-area finding jumps to the deed page with the bbox visible; 2:30 graph shows one faculty member at two colleges and the Cypher drawer opens; 3:20 confidence gate correction removes the false mismatch; 4:00 injection document gives only an anomaly signal; 4:40 rule replay shows a diff; 5:20 ledger tamper breaks the chain at the right row.
2. **Role tests at the API level:** applicant, officer, senior reviewer, rule admin, auditor — every can/cannot cell from spec section 12.
3. **axe** on queue, every workspace tab, rules, ledger, metrics, self-check: zero serious or critical issues.
4. **PII scan** (`scripts/grep-pii.ts`) over source, fixtures and `.next` output: no 12-digit sequences, no raw PAN.
5. Add `package.json` scripts: `typecheck`, `lint`, `test`, `build`, `e2e`, `check:contrast`, `check:pii`, `check:wording`, and a `verify` script that runs all of them.
6. Add `.github/workflows/ci.yml` running `pnpm install --frozen-lockfile` then `pnpm verify` on push and pull request.
7. Paste the raw output of `pnpm verify`. Commit. Print the status line.

---

## 9. Phase 7 — Documentation, demo hardening and round-2 evidence

Create or update:

1. **`README.md` (root):** one-command run, demo roles, and a **Real vs Simulated** table that matches the code line for line (rule engine, cross-check, Critic, confidence gate, ledger and RBAC are real; OCR, LLM, vision, issuer connectors, Neo4j and Qdrant are simulated or in-memory behind the same interfaces).
2. **`docs/RULES.md`**, **`docs/FAULT_MATRIX.md`** (generated from the matrix file, with the **observed** result per fault from the last run), **`docs/DEMO_SCRIPT.md`** (six-minute script aligned to the presenter bar, with fallback steps), **`docs/KNOWN_LIMITATIONS.md`** (plain language).
3. **`docs/ROUND2_EVIDENCE.md`:** screenshot list, the metrics table exported from the metrics board, fault matrix results, false-positive result on controls, a requirements traceability table (problem statement requirement → screen → test → spec section) covering configurable rules, authorised verification, evidence-linked findings, secure handling and human review, and a list of items still unverified.
4. **Demo hardening:** a `pnpm demo` command that resets the seed, runs a production build, and serves it with `next start` on a fixed port. Verify the full demo works from a cold start with the network disabled. Write `docs/DEMO_CHECKLIST.md` for the team: what to open, what to click, and what to do if each beat fails (include the manual step of recording a 60-second backup screen capture).
5. Do not edit the architecture HTML. If the repo evidence suggests spec changes, list them in `docs/SPEC_FEEDBACK.md` instead.

Commit. Print the status line.

---

## 10. Completion criteria

Stop only when all are true and shown with pasted output:

- `pnpm verify` is green.
- All 13 planted faults produce exactly the expected result with resolvable evidence (fault matrix test).
- All 5 controls have zero high-severity findings and each demonstrably evaluated and cleared its near-miss.
- The absence-receipt exception is narrow and covered by negative tests for every other class.
- No test expectation changed without a logged, spec-based justification.
- Ledger tamper, human-authority, RBAC and wording tests pass.
- The Playwright demo walkthrough, axe and contrast checks pass.
- The README's Real vs Simulated table matches the code.
- No debug leftovers, stubs or hard-coded metrics.

---

## 11. Final report format

Reply with:
1. **Starting state:** what Phase 0 found (passing and failing, what was half-done).
2. **What was wrong and what you changed**, each with file and line.
3. **Test expectation changes:** the full log with spec justification.
4. **Fault table:** the 13 faults, expected vs observed.
5. **Controls:** findings by severity for each of the 5 controls, plus the evaluated-and-cleared traces.
6. **Screens:** each route marked working, partial or missing, with screenshot paths.
7. **Raw output of `pnpm verify`.**
8. **What you could not verify**, and why.
9. **Top three risks for the round 2 demo**, and what the team should do about each.
