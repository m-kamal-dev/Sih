# UX Rationale — EvidenceGraph (Round 2)

Why the interface works the way it does after the Phase 2–6 overhaul. Each
decision is tied to the audit that motivated it (`docs/UX_AUDIT.md`,
`docs/screenshots/baseline/`). Evidence shots for the current state are the
`docs/screenshots/*-{light,dark}.png` sets.

## Navigation and case workspace (Phase 3)

**Decision:** the application workspace loads with a full-width case header —
application id, category, region and institution name — and the tab strip
through which every officer task runs.

- **Tabs carry counts.** Evidence (documents), Conflicts (mismatches),
  Verification (checks) and Graph (connections) render their item counts from
  the same server-computed `CaseHeader` used by the API. The audit found that
  tabs did not silently relate to each other; counts make the relation visible
  before any click.
- **"Next: …" button.** The store computes the next step (`Review N mismatches`
  → `Review official checks` → …) and the strip renders a persistent button
  that routes to the tab that step names. A first-time user never has to decide
  which tab they need next.
- **Workflow order.** Tabs run in the order an officer works: Overview →
  Evidence → Conflicts → Forensics → Verification → Graph → Pipeline →
  Decision → Letter. Decision precedes Letter because the letter is produced
  from the decision.
- **Quiz semantics:** these are page links, not ARIA `role=tab`/`tablist`
  widgets — `aria-current="page"` marks the active screen (the earlier fake tab
  roles raised axe `aria-required-parent/children` criticals; see the axe spec).

## Plain language (Phase 4)

- **Queue reasons** pluralise correctly ("potential discrepancies", not
  "discrepancys") via a small explicit pluralisation map in the triage engine.
- **Metrics cards** each carry a one-line "what this number means" caption
  (e.g. *"How many flagged issues were real"* for precision), so the board is
  readable without a legend.
- **Rules screen** states up front that a failing rule opens a finding for
  officer review and never blocks an application by itself — then lists rules.
- **Ledger screen** explains in one sentence how the hash chain works and what
  the Tamper button does before showing rows.

## Always-present states (Phase 4)

Every data view has loading (spinner + label), error (message + Retry) and
empty states. Implemented for queue (error loading), rules, ledger, metrics and
the applicant self-check. No raw stack traces anywhere.

## Design system (Phase 2)

- Two token blocks — dark (default `:root`) and `.light` —
  all text/semantic colours validated against the four surfaces at 4.5:1 both
  ways by `pnpm check:contrast`.
- The theme toggle is a physical 56×28 switch; `data-theme` is applied
  pre-paint by an inline script so there is no flash; choice persists in
  `localStorage`. Swapping uses the View Transitions API circular reveal from
  the click point, and instant under `prefers-reduced-motion`.
- Fraunces (display serif) for headings, Inter for UI text, JetBrains Mono for
  identifiers and hashes.

## Motion rules (Phase 6)

- Animations only touch `transform`, `opacity`, `color/background` and
  `stroke-dashoffset` — never width, height, top, left, margin or padding
  (Verified by repo grep; the two width-animated components found were fixed:
  confidence bars now scaleX, and the sidebar collapse is instant).
- `prefers-reduced-motion` is one central rule in `globals.css`: every
  animation/transition becomes 80ms, run once — plus JS skips the view
  transition in `ThemeToggle` directly.
- Chips combine icon + text so severity is never colour alone.

## Performance as a UX feature (Phase 5)

First Load JS is capped: `pnpm verify` parses the `next build` route table and
fails any non-API route above 150 kB. The metrics chart is dynamically
imported; measured first-load budgets (2026-10-26): queue 119 kB, rules
115 kB, ledger 117 kB, metrics 115 kB, self-check 115 kB, demo 109 kB,
heaviest workspace tab (evidence) 137 kB.
