# AGENT PROMPT — UX Overhaul, Backend Audit, Performance and Visual Polish (EvidenceGraph, SIH26261 Round 2)

You are continuing work on the **EvidenceGraph** prototype (repo `Sih-PS5`). The spec is `EvidenceGraph_Architecture.html` (the committed file may be named `EvidenceGraph Architecture.html` with a space; rename it with `git mv` and fix references). The engine, fixtures and many screens exist, but the product is **hard for an end user to understand**: the tabs look out of order, the screens do not visibly relate to each other, the app feels slow to start and to switch tabs, and the visual design is dated.

**The single most important goal of this task is that a first-time user can understand and operate the app without being told how.** Everything else (backend checks, speed, animation, colours) serves that.

Work autonomously. When something is ambiguous, choose the option closest to the spec, write the assumption to `docs/ASSUMPTIONS.md`, and continue. Do not stop to ask questions.

---

## 0. Ground rules

1. **Verify, don't trust.** Earlier status claims may be wrong. Check from disk and from a running **production build** (`next build && next start`). Never judge speed on `next dev`.
2. **Never weaken a safeguard to get green.** The evidence requirement (no finding without resolvable evidence), the wording gate (banned words: "forged", "fake", "fraud"), human-authority rules and role checks are the product. A change that loosens them needs a written justification and a negative test.
3. **Never edit a test expectation to get green** unless it contradicts the spec. Log any such change in `docs/TEST_EXPECTATION_CHANGES.md`.
4. **No stubs, no hard-coded demo numbers, no `TODO`.** Metrics are computed from fixtures. Mocks are labelled MOCK.
5. **Never invent APH clauses or thresholds.** Keep `[fill in]` and the "clause to be confirmed" badge.
6. **Synthetic data only.** No 12-digit Aadhaar-like strings; PAN only as a salted hash prefix.
7. **One phase at a time, one commit per phase.** After each phase run `pnpm typecheck && pnpm lint && pnpm test`, commit, and print: `PHASE <n> <name>: <pass|partial|blocked> — tests <passed>/<total> — <what changed>`.
8. **Every claim needs evidence:** pasted command output, a test name, a measured number, or a screenshot path under `docs/screenshots/`.

**If time runs short, finish in this order:** (1) the new navigation and case workspace with visible cross-links, (2) light/dark themes with the toggle, (3) speed fixes, (4) backend contract fixes, (5) motion and graphics, (6) docs.

---

## 1. Phase 0 — Baseline, UX audit and speed baseline (change nothing yet)

1. `git status`, `git log --oneline`, `git ls-files`. Record uncommitted work; do not discard it.
2. Run and paste output of `pnpm install`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`. If anything fails, fix only what blocks the build (for example the type errors left by the half-finished evidence-union work), then continue.
3. Carry-over integrity check (from the earlier audit prompt, do not regress): the Critic drops findings without resolvable evidence except a typed `absence_receipt` on a presence-rule `completeness_gap`; ghost-faculty and reused-FDR findings point to the real conflicting roster and FDR facts; the 13-fault matrix test passes; clean controls have zero high-severity findings; ledger tamper, wording, RBAC and PII tests pass. If `docs/CONTINUATION_STATE.md` exists, read it. Fix whatever fails before building UI on top of it, and list what you fixed.
4. **UX audit.** Run the production build and visit every route as each role in a real browser (Playwright). For each route record: purpose in one sentence, primary action, number of tabs/controls visible, jargon shown to the user, whether it links to related screens, and a screenshot at 1440px. Write `docs/UX_AUDIT.md` with a table and an honest list of problems: confusing order, duplicated information, unexplained internal terms (agent names, `bbox`, `as_of`, `RLS`, layer numbers), dead ends, screens that show the same finding with no link between them.
5. **Speed baseline.** On the production build, measure and record in `docs/PERF_BASELINE.md`: server cold start to ready, first contentful paint and largest contentful paint on `/` and `/queue`, time to switch between every pair of workspace tabs (use `performance.mark` around the click and the first meaningful paint of the new tab), route navigation time, first-load JS per route (`@next/bundle-analyzer`), and the 10 largest dependencies in the bundle. Also list every API route with its response time and payload size.
6. Commit `docs/UX_AUDIT.md` and `docs/PERF_BASELINE.md`. Print the status line.

---

## 2. Phase 1 — Backend and API audit

The API must be correct and fast, because the UI will lean on it for cross-screen consistency.

1. **Inventory.** List every route handler (method, path, role required, request schema, response shape). Write `docs/API.md` from the real code, not from memory.
2. **Smoke and contract tests.** Call every endpoint as every role. Record 4xx/5xx, unhandled promise rejections, console errors, broken imports. Fix everything broken. Add a test suite (`apps/web/tests/api/*.test.ts` or similar) with one contract test per endpoint covering: success, validation failure, wrong role (403), missing resource (404).
3. **One error shape** for the whole API: `{ "error": { "code": "...", "message": "...", "details": ... } }`, with stable codes (for example `ILLEGAL_TRANSITION`, `EVIDENCE_UNRESOLVED`, `FORBIDDEN_ROLE`). The UI maps codes to plain-language messages. No raw stack traces in responses.
4. **Validation at every boundary** with zod (params, query, body). Reject unknown fields on mutations.
5. **Right-sized payloads.** No endpoint returns the whole dataset. Provide: `GET /api/cases` (paginated, filterable, sortable, returns summaries only), `GET /api/cases/:id` (case header + counts for every section), and section endpoints (`/documents`, `/mismatches`, `/checks`, `/connections`, `/report`) so each section loads independently and in parallel. Add `ETag` and `Cache-Control: private, max-age=0, must-revalidate` so repeat visits return 304.
6. **Derived-data cache.** Compute-heavy results (triage scores, cross-checks, metrics) are computed once per dataset version and cached in memory, invalidated by a version counter that increments on any mutation. Remove any recomputation on read.
7. **Storage safety.** The JSON-file store must serialise writes (a mutex or queue) and write atomically (write to a temp file, then rename). Mutations that can be retried (decisions, gate corrections) are idempotent through an idempotency key. Confirm that background timers (the SLA scan) start once and are not duplicated by hot reload.
8. **Live consistency across screens.** Add `GET /api/events` (Server-Sent Events) emitting typed events: `finding.updated`, `fact.corrected`, `decision.recorded`, `ledger.appended`, `verification.updated`, `dataset.reset`. The client subscribes once and invalidates the affected query caches, so a change made in one place shows up everywhere without a manual refresh (see Phase 3).
9. **Health and readiness:** `GET /api/health` returning version, dataset version, ledger head hash and chain-valid flag.
10. **Security basics:** httpOnly, sameSite cookies for the demo session; role checks in one middleware, not scattered; security headers in `next.config` (CSP that still allows self-hosted fonts and the worker, `X-Content-Type-Options`, `Referrer-Policy`, `frame-ancestors`); a small in-memory rate limit on mutation routes; validated env config at startup. Run `pnpm audit` and `pnpm outdated` if the network allows; upgrade patch and minor versions that are safe, and list the rest in `docs/KNOWN_LIMITATIONS.md`.
11. **Budgets.** Every read endpoint p95 ≤ 50 ms on the local production build with the 12-institution dataset. Add a script `scripts/api-timing.ts` that checks this and fails above budget.

Commit. Print the status line.

---

## 3. Phase 2 — Design system, two themes, and the physical toggle

Replace the previous "Evidence Desk" tokens and delete the old theme code. Use exactly the two palettes below.

### 3.1 Theme A — Architectural Parchment (LIGHT, the default)

Base 60% `#FDFBF7` canvas. Structure 30% `#FFFFFF` content blocks plus `#1E293B` ink for text and borders. Accent 10% `#1D4ED8` for primary actions, current state and graph navigation links. Severity and confidence: `#DC2626` for hard compliance failures and anomalies; `#EAB308` for low-confidence flags needing correction.

```
--bg-canvas:#FDFBF7   --bg-surface:#FFFFFF   --bg-sunken:#F6F2E9   (derived)
--ink:#1E293B         --text-muted:#5B6678   (derived)   --border:#E6E1D3 (derived)
--accent:#1D4ED8      --accent-weak:rgba(29,78,216,.08)
--danger:#DC2626      --danger-weak:rgba(220,38,38,.08)
--warn:#EAB308        --warn-text:#854D0E (derived, for text on light)  --warn-weak:rgba(234,179,8,.16)
--ok:#15803D (derived) --violet:#6D28D9 (derived) --teal:#0F766E (derived)
--code-bg:#0F172A     --code-text:#FDF4E3
```

### 3.2 Theme B — Crimson Intelligence (DARK)

Base 60% `#0F172A`. Structure 30% `#1E293B` for cards, rule panels, ledger timeline, header. Signal red `#EF4444` is **reserved** for Critic detections, hash-tamper flags and strict validation errors. Amber `#F59E0B` for confidence thresholds and warnings. Ice white `#F1F5F9` for text. Soft beige `#FDF4E3` for text in Cypher and code blocks.

```
--bg-canvas:#0F172A   --bg-surface:#1E293B   --bg-sunken:#0B1222 (derived)
--ink:#F1F5F9         --text-muted:#94A3B8 (derived)   --border:#334155 (derived)
--accent:#2563EB (fill, white text)   --accent-text:#60A5FA (links on dark, derived)
--danger:#EF4444 (fills, borders)     --danger-text:#F87171 (text on dark, derived)
--warn:#F59E0B   --ok:#4ADE80 (derived)   --violet:#A78BFA (derived)   --teal:#2DD4BF (derived)
--code-bg:#0B1222   --code-text:#FDF4E3
```

**Decisions to apply (and record in `docs/UX_RATIONALE.md`):**
- Because signal red is reserved for Critic and tamper states, **primary buttons in dark mode use the blue accent**, not red. Red stays rare so it keeps its meaning in both themes.
- Colours marked "derived" were added by us for neutrals and extra hues. The user's palette defines only red, yellow and blue, but the product needs five finding classes and six verification statuses. Keep hue families harmonised with the palette.
- **Contrast must pass WCAG AA (4.5:1 body text, 3:1 large text and UI borders) in both themes.** Known risks: `#EAB308` as text on cream fails, so use it only as a fill, border or icon with dark text, and use `--warn-text` for words; `#EF4444` as small text on navy is borderline, so use `--danger-text`. Write `scripts/check-contrast.ts` that tests every text/background token pair in both themes and fails the build below threshold. If a colour fails, adjust its lightness and keep its hue.
- Every status chip has **icon + text label**; colour is never the only signal. Finding class and verification status keep separate visual languages (shape and icon family), as in the spec.

### 3.3 The theme toggle (physical switch)

- Placed at the **top right of the header on every page**, always visible, never inside a menu.
- Styled as a **physical toggle**: a 56×28 pill track with a round thumb, a sun icon on the left and a moon icon on the right, a soft inner shadow on the track and a raised shadow on the thumb. The thumb slides by `transform: translateX`, with a gentle 220ms ease-out and a tiny press-down squish on `:active`. Track colour shifts between the two themes' surface colours.
- Accessible: `role="switch"`, `aria-checked`, visible focus ring, operable by Space and Enter, tooltip "Switch to dark mode / light mode".
- **Light is the default for every first visit, regardless of the operating-system preference.** Persist the user's choice in `localStorage` (key `eg-theme`).
- **No flash of wrong theme.** Apply `data-theme` with a small inline script in `<head>` before first paint. Set `color-scheme` per theme.
- Switching: use the View Transitions API with a circular reveal expanding from the toggle where supported; otherwise a 150ms crossfade; with reduced motion, an instant swap. Suppress other CSS transitions during the swap to avoid flicker.
- All charts, graph colours, syntax highlighting, skeletons, shadows and page-viewer overlays read from tokens, so nothing stays "stuck" in one theme. Test every screen in both themes.

### 3.4 Typography, spacing and surfaces

- Headings: a refined serif for page and section titles (Fraunces or Source Serif 4) to give the "premium institutional" editorial feel. Body and UI: Inter or Geist. Identifiers, hashes, YAML and Cypher: JetBrains Mono. Self-host with `@fontsource` so the demo works offline; preload only the weights actually used; `font-display: swap` with a metrics-matched fallback to avoid layout shift. Tabular numerals for numbers.
- 4px grid. Body 15px, dense tables 13–14px, generous line height. Radius 8px controls, 14px cards. In light mode use borders and very soft layered shadows; in dark mode use borders and subtle top-light gradients, not heavy shadows.

Commit. Print the status line.

---

## 4. Phase 3 — Information architecture and the case workspace (THE core change)

### 4.1 Principles

1. **One purpose and one primary action per screen**, stated in a plain-language heading and one-line subtitle.
2. **Order follows the user's job**, not the system's internals: *see what needs me → open a case → understand why it was flagged → check the evidence → resolve it → decide and notify → audit it.*
3. **Plain language by default.** Technical detail is one click away in a "Technical details" disclosure for auditors, never in the default view. Add a glossary tooltip (dotted underline) on every unavoidable term.
4. **Show the integration.** Every object that appears on more than one screen is a live link with a visible relationship, and a change in one place visibly updates the others (see 4.5).
5. **Progressive disclosure and low density.** Show the top 3 things first, details on demand.

### 4.2 Plain-language terminology map (apply everywhere: labels, headings, buttons, empty states, toasts, letters)

| Internal term | User-facing label |
|---|---|
| Queue / triage score | Inbox / Priority |
| Application | Case |
| Evidence tab | Documents |
| Conflicts | Mismatches |
| Verification | Official checks |
| Graph / entity neighbourhood | Connections |
| Report / Letter | Decision & notice |
| completeness_gap | Missing item |
| validity_gap | Expired or invalid |
| potential_discrepancy | Possible mismatch |
| anomaly_signal | Needs a closer look |
| confirmed_violation | Confirmed issue |
| source_unavailable / pending / manual_review | Source offline / Waiting for reply / Needs your review |
| Confidence gate | Check this value |
| Critic gate | Evidence check |
| Ledger | Audit trail |
| Pipeline / agent graph | How this was analysed |
| Rule pack / replay | Rules / Test a rule change |
| HITL | Needs a person |
| `as_of`, bbox, RLS, layer names | Hidden by default; shown only inside "Technical details" |

The wording gate stays: no "forged", "fake" or "fraud" anywhere. Wording is sentence case, short, and says what happened and what to do next ("Land area on the form (5.00 acres) doesn't match the sale deed (3.20 acres). Review the deed, page 3.").

### 4.3 Global navigation (replace the current tab clutter)

A left sidebar (collapsible) with at most **five** items, in this order, role-filtered:

1. **Inbox** (cases needing action, count badge) — officer, senior reviewer
2. **Cases** (search all) — officer, senior reviewer, auditor
3. **Rules** — rule administrator
4. **Audit trail** — auditor, senior reviewer
5. **Insights** (metrics) — senior reviewer, auditor, rule administrator

Applicant sees only **My application**. Move "How this was analysed" into the case header as a link, not a top-level item. Rename and move routes to match (`/inbox`, `/cases/[id]`, `/rules`, `/audit-trail`, `/insights`, `/my-application/[id]`) and add redirects from every old route. Top bar: breadcrumbs on the left; global search (`/`), the **role switcher** (labelled "Demo role switch"), a help button (`?`), and the **theme toggle** on the right. The demo presenter bar becomes a small collapsed "Demo" pill at the bottom edge that expands on click.

Each role lands on a role-specific **Home** (the Inbox for officers) with a short "Start here" card: what to do first, one primary button.

### 4.4 The case workspace: one guided page instead of loose tabs

Route `/cases/[id]`. Layout:

- **Header (sticky):** breadcrumb, institution and case title, case type, status chip, deadline countdown, and a single **"Next step" primary button** whose label changes with the case state ("Review 3 open items", "Correct a value", "Prepare notice", "Send for approval").
- **Left outline (sticky), numbered in the order of the job**, each with a count badge and a state icon (done, needs attention, waiting):
  1. **Summary**
  2. **Documents** (n)
  3. **Mismatches** (n)
  4. **Official checks** (n)
  5. **Connections** (n)
  6. **Decision & notice**
- **Main area:** the selected section. Sections load independently with skeletons; nothing blocks the shell.
- **Right "Focus" panel (collapsible):** shows whichever item is selected (a finding, value or document) with its plain-language explanation, a thumbnail of the evidence, the **Trace** (4.5), and the actions Accept / Dismiss / Escalate (reason required).

**Summary section:** a "What needs your attention" list of the top items by priority, each a card with: a plain sentence, class chip with icon, severity, evidence thumbnail, and three buttons (**See evidence**, **See mismatch**, **See official check**) that jump to the right section with the item selected. Below it: a compact progress bar of review steps, and "Why this priority" showing the reasons.

**Documents section:** page viewer with highlighted regions. A document list on the left shows each required checklist slot with state: filed, missing, expiring. Missing items render as a checklist row, not a broken viewer. Selecting a finding anywhere scrolls the viewer to the exact page and region with the outline drawing in.

**Mismatches section:** one row per fact with columns Form · Documents · Earlier records · Official source, each cell showing value, date and source, mismatches highlighted, and a button to open the evidence.

**Official checks section:** a plain timeline: "Asked the fire department → no reply after 3 tries → needs your review", with MOCK labels, retry history and the manual action button.

**Connections section:** the graph, opened already focused on the selected item, with a one-sentence caption ("Dr A. Sharma appears on two colleges' staff lists during the same period") and a link to the other case. The Cypher drawer lives under "Technical details".

**Decision & notice section:** findings grouped by checklist item, the draft notice with clause citations, a "Draft. Not sent" banner, and the send action only for senior reviewers.

### 4.5 Showing the integration (mandatory)

1. **Shared selection state in the URL.** `/cases/CASE-12?section=documents&focus=finding_8&page=3`. Selecting a finding in any section sets `focus`; every other section highlights the same item (document region, mismatch row, official check, graph node, notice line). Back/forward and shared links restore the exact view.
2. **The Trace component.** For any selected item show a clickable chain, each step a chip with live status:
   `Document crop → Extracted value (confidence) → Rule (version) → Finding → Official check → Decision → Audit trail entry`.
   Clicking a step jumps to that screen with the item selected. Use it in the Focus panel, in report lines, and (reversed) in the Audit trail: each ledger entry links back to its case and finding.
3. **Cross-links everywhere:** "Also on case CASE-31" chips on cross-institution findings; Insights numbers drill down to the filtered Inbox behind them; a rule in Rules shows "Affects N findings" linking to them; the Inbox row shows the same reason chips as the Summary.
4. **Live cross-screen updates (via SSE from Phase 1).** When the user corrects a low-confidence value: the mismatch disappears with a layout animation, the section counts and the header counts update, the Inbox priority re-ranks, an audit-trail entry appears, and a toast says "Updated 4 places" with a "Show me" link that opens the Trace. The same pattern applies to decisions and official-check results. A thin **"Connected"** indicator in the header shows the live link is up.
5. **Shared-element transition** from an Inbox row into the case header (View Transitions API, with a simple fade fallback).

### 4.6 Help and first-run guidance

- First visit per role: a skippable 5-step guided tour (highlight element, one sentence, Next). Replay from the `?` menu. The tour must reference the real elements and use plain language.
- `?` menu: keyboard shortcuts, glossary, "Replay tour", "Show technical details" toggle (global, off by default).
- Empty states: a small illustration, one sentence, one next action. Error states: what happened, what to do, a retry button.

### 4.7 Usability acceptance (automated)

Write Playwright tests that fail if any of these take more clicks than stated, starting from the role's Home:
- Find the highest-priority case and see why it is flagged: **1 click**, no extra navigation (reasons visible in the Inbox row and the Summary).
- Open the evidence for a finding: **1 click** from the Summary card.
- Correct a low-confidence value and see the mismatch clear: **≤ 3 clicks**.
- Prepare the notice draft: **≤ 3 clicks** from the case.
- Find the audit-trail entry for a decision you just made: **1 click** (via the Trace or the toast link).
- Switch theme: **1 click**; reload keeps the choice; first visit is light.
Also assert: every screen has a heading and exactly one primary-styled button; no default-view text contains terms from the "internal term" column; every section count in the outline equals the number of rows it shows.

Commit after the shell and navigation are in, then again after the workspace. Print the status lines.

---

## 5. Phase 4 — Remaining screens, simplified

- **Inbox:** a clean list of cards or a compact table with Priority, Institution, Case type, "Why flagged" (top 2 reason chips), Deadline, Status. One filter bar (type, region, status) with saved filters "Needs me", "Waiting on others", "Overdue". Virtualised. Hover prefetches the case.
- **My application (applicant):** a plain checklist "What to fix" with progress (3 of 8 done), each item with an upload or correct action. No forensic detail, no priority score, no other institutions, enforced at the API.
- **Rules:** a list of rules in plain language with status, version and "Affects N findings". The YAML editor, tests and "Test a rule change" (replay diff) sit in a detail view. Publishing needs a second approver (clear two-step UI).
- **Audit trail:** a vertical timeline (who, what, when, linked case) with a **Check integrity** button and a "Try tampering with one entry" demo action behind "Technical details". Signed daily digest in a side card.
- **Insights:** four headline numbers and a few readable charts (accuracy by document type, caught vs planted issues, false alarms on clean cases, time saved per case), each with a one-line plain explanation, each clickable to the cases behind it. Computed from fixtures at runtime. Show unfavourable numbers honestly.
- **How this was analysed (linked from the case header):** a simple left-to-right flow with the steps in plain words and their results for this case; human checkpoints marked "Needs a person".
- Keep all keyboard shortcuts, with the `?` overlay. Keep `Esc` closing panels.

Commit. Print the status line.

---

## 6. Phase 5 — Performance (launch time and tab switching must not feel delayed)

**Targets, measured on the production build and written to `docs/PERF_REPORT.md` with before/after numbers:**
- Server cold start to ready ≤ 3 s; first contentful paint ≤ 1.0 s; largest contentful paint ≤ 1.5 s on `/inbox` on a normal laptop.
- **Tab/section switch: visual response ≤ 100 ms, content ≤ 200 ms**, with no loading spinner on repeat visits.
- Route navigation ≤ 300 ms with an instant skeleton. Interaction to Next Paint ≤ 100 ms (p75). Cumulative layout shift ≤ 0.05.
- First-load JS per route ≤ 170 kB gzipped (shared shell ≤ 120 kB).

**Techniques to apply (measure each, keep what helps):**
1. **Keep workspace sections inside one route** with client-side switching, so switching a section never reloads the page. Fetch all section counts with the case header in one request, and prefetch each section's data in parallel as soon as the case opens; cache with TanStack Query (`staleTime` long, `gcTime` longer) and show cached data instantly while revalidating.
2. **Prefetch on intent:** `Link` prefetch for visible links, plus hover/focus prefetch for Inbox rows and sidebar items. Prefetch the next section's data when the user hovers its outline item.
3. **Server Components and streaming** for the shell and static content; `loading.tsx` skeletons shaped like the real layout so nothing jumps; Suspense boundaries per section.
4. **Code-split heavy libraries** and load them on idle or on hover: Cytoscape (Connections), the page viewer, the YAML editor, the charts library. The Inbox and Summary must not ship any of them.
5. **Virtualise** long lists and tables. Memoise row components. No expensive work in render; move derived data to the server cache (Phase 1) or `useMemo` with stable inputs.
6. **Optimistic updates** for decisions and corrections (apply instantly, reconcile on the server response, roll back with a clear message on error).
7. **Assets:** self-hosted fonts subsetted to Latin, preloaded, with matched fallbacks; SVG illustrations inline or as optimised files; no layout-shifting images (explicit dimensions); remove unused dependencies (check with `depcheck`); replace any heavy library with a lighter equivalent where the feature allows.
8. **Avoid hydration waste:** no client-only data fetch for first paint; no hydration mismatches (check the console); avoid large JSON in props.
9. **Compression and caching:** gzip/brotli on `next start` (or a documented reverse proxy), long-cache immutable assets, ETag on API responses.
10. **Budgets enforced:** add a bundle budget check in CI (`scripts/check-bundle.ts`), a Playwright perf test asserting the tab-switch and route targets on the production build, and Lighthouse CI on `/inbox` and one case page in both themes.

Add `pnpm demo` that resets the seed, builds, and serves in production mode on a fixed port, and time it. Commit. Print the status line.

---

## 7. Phase 6 — Motion, graphics and visual effects (current standards, tied to the UX)

Motion explains state changes and relationships. It never blocks the user.

### 7.1 Motion system
- Use the `motion` library for layout animations and `View Transitions` for route and theme changes. Define motion tokens in one place: durations 120 ms (hover, press), 180 ms (chips, menus), 240 ms (panels, drawers), 320 ms (route and shared-element transitions); exits about 70% of entrances. Easing: `cubic-bezier(0.2, 0, 0, 1)` out, `cubic-bezier(0.4, 0, 1, 1)` in; a light spring (stiffness ~300, damping ~30) only for drawers, the toggle thumb and shared-element moves. No bounce on data.
- Animate `transform` and `opacity` for movement. Short colour or border-colour transitions (≤ 200 ms) are fine. SVG `stroke-dashoffset` is allowed for drawing strokes. Never animate `width`, `height`, `top`, `left`, `margin` or `padding`; use layout animations or the `grid-template-rows: 0fr → 1fr` technique for expand/collapse.
- **`prefers-reduced-motion`:** one central rule replaces movement with instant or 80 ms opacity. Test it.
- Keep 60 fps: no long tasks over 50 ms during animations; check with a Playwright trace. Disable animations for off-screen elements.

### 7.2 Signature interactions (each reinforces the integration story)
1. **Section switch:** a 180 ms crossfade plus 8 px slide of the content area; the left outline's active indicator glides to the new item (shared layout).
2. **Evidence jump:** the viewer scrolls to the page; region corner marks ("crop marks") draw in over 240 ms, one soft pulse, and the matching row in the Focus panel gets a short highlight.
3. **Trace chain:** when an item is selected, the chain's connector lines draw left to right (stroke draw, 300 ms total, staggered), and a clicked step glides to its destination with a subtle shared-element transition.
4. **Live update ripple:** after a correction, affected counts (outline, header, Inbox) do a brief 1-step highlight; removed rows collapse with a layout animation; a toast summarises "Updated 4 places".
5. **Inbox → case:** shared-element transition of the row into the case header.
6. **Priority re-rank:** rows glide to new positions with layout animation.
7. **Confidence check:** the blurred crop crossfades to the sharpened crop on confirm; the mismatch clears.
8. **Ledger tamper:** hashes flip in a 40 ms-staggered cascade to the signal-red state, then "Chain broken at #n"; restore reverses it. A rare, legitimate use of red.
9. **Analysis flow:** nodes light in sequence; the connecting dashes animate only while the downstream step is active.
10. **Theme switch:** circular reveal from the toggle (Phase 2).
11. **Skeletons:** shaped like the real content, with a soft shimmer via a translating gradient layer; static under reduced motion.
12. **Micro-interactions:** buttons press down 1 px with a 120 ms shadow change; chips fade in; tooltips 120 ms; toasts slide in from the edge and auto-dismiss with a progress sliver; focus rings animate their opacity.

### 7.3 Graphics and visual language ("document audit" motif)
- **Light mode:** a warm cream canvas with a very subtle paper grain (an inline SVG noise at 2–3% opacity, static), white cards with layered soft shadows, serif page titles, ink-navy borders at low opacity. **Dark mode:** deep navy canvas with a faint dot-grid on empty areas, cards one step lighter with a subtle top highlight, beige code surfaces for Cypher and YAML.
- A **glass top bar** (backdrop blur 12 px with a translucent surface) that gains a hairline border on scroll.
- **Crop-mark corners** on evidence regions and selected cards, a consistent "document" icon set (Lucide, 1.5 px stroke), seal/stamp-style outline badges for "verified" and "needs review".
- **Custom inline SVG illustrations** for: empty Inbox ("All clear"), first-run welcome, empty Documents slot, offline official source, and the analysis flow. They use theme tokens, so they adapt to both themes.
- **Data graphics:** thin-stroke charts that draw in on first view (stroke draw, 400 ms), direct labels instead of legends where possible, colour-blind-safe, tokens for both themes. Compliance and priority shown as small progress rings (stroke draw) rather than raw numbers alone. No 3D, no heavy gradients, no confetti, no glitch or scanline effects, no parallax, no endless decorative loops. A hero gradient mesh is allowed on the landing/welcome card only, static or very slow.
- Number count-up is allowed only for the four Insights headline numbers on first load (≤ 600 ms), and never on tables or the Inbox.

Commit. Print the status line.

---

## 8. Phase 7 — Verification (paste raw output for every item)

1. `pnpm verify` runs, in order: typecheck, lint, unit tests, API contract tests, fault-matrix test, wording gate, PII scan, contrast check (both themes), bundle budget, API timing budget, build, Playwright e2e. All green.
2. **Playwright e2e:** the usability tests from 4.7; the six-minute demo walkthrough through the Demo pill; the live-update test (correct a value, assert the mismatch disappears, counts change in the outline, header and Inbox, an audit entry appears, toast shows); a **cross-link test** (every "Also on", Trace step, Insights drill-down and ledger back-link lands on the right case and item); role tests for all five roles at the API level; keyboard-only run through the core flow.
3. **Visual regression:** screenshots of Inbox, Case (all six sections), Rules, Audit trail, Insights and My application in **both themes** at 1440 px and 390 px (the layout must degrade to a single column with the outline as a top segmented control). Save to `docs/screenshots/`.
4. **Accessibility:** `axe` on every screen in both themes with zero serious or critical issues; focus order correct; the toggle and Trace operable by keyboard; skip link present.
5. **Performance:** run the Phase 5 perf test and Lighthouse CI; fill `docs/PERF_REPORT.md` with before and after numbers against `docs/PERF_BASELINE.md`. If a target is missed, say so plainly and list what you tried.
6. Add a GitHub Actions workflow `.github/workflows/ci.yml` running `pnpm install --frozen-lockfile && pnpm verify`.

---

## 9. Phase 8 — Documentation

- `README.md` (root): one-command run (`pnpm demo`), roles and what each sees, theme toggle note (light default), and a **Real vs Simulated** table that matches the code.
- `docs/UX_RATIONALE.md`: the navigation order and why, the terminology map, the two palettes and the decisions in 3.2, and the before/after screenshots.
- `docs/API.md` (from Phase 1), `docs/PERF_REPORT.md`, `docs/DEMO_SCRIPT.md` aligned to the new screens and names, `docs/DEMO_CHECKLIST.md` (what to open, what to click, what to do if a beat fails, and the manual step of recording a 60-second backup screen capture), `docs/KNOWN_LIMITATIONS.md`.
- `docs/ROUND2_EVIDENCE.md`: screenshots list, metrics exported from Insights, fault-matrix results, controls result, a requirements traceability table (problem-statement requirement → screen → test → spec section), and items still unverified.

Commit. Print the status line.

---

## 10. Completion criteria

Stop only when all are true, with pasted output:

- A first-time user can complete every task in 4.7 within the stated click counts (Playwright passes).
- The case workspace shows the six ordered sections, the Focus panel and the Trace; selecting an item highlights it in every section; live updates reach every affected screen without a refresh.
- No default-view text contains internal jargon; technical detail sits behind "Technical details".
- Both themes use exactly the palettes in section 3 (plus the documented derived tokens), pass AA contrast, and the toggle works, persists, defaults to light and causes no flash.
- Every API route has a contract test; zero 5xx and zero console errors across the e2e run; reads meet the p95 budget; the store writes atomically.
- Performance targets in section 6 are met or honestly reported.
- The evidence-integrity and 13-fault tests still pass; clean controls have no high-severity findings.
- No debug leftovers, stubs or hard-coded metrics; the README's Real vs Simulated table matches the code.

---

## 11. Final report format

Reply with:
1. **Starting state** (Phase 0): what passed and failed, and the UX problems found.
2. **What changed**, per phase, with file paths.
3. **Before/after table** for the speed numbers.
4. **Usability results:** each task in 4.7 with its measured click count.
5. **Integration proof:** the live-update and cross-link test results, with a screenshot of the Trace.
6. **API results:** the endpoint table with p95 times and any bugs found and fixed.
7. **Screens:** each route in both themes, with screenshot paths.
8. **Raw output of `pnpm verify`.**
9. **What you could not verify, and why.**
10. **Top three risks for the round 2 demo** and what the team should do about each.
