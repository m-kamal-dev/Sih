# Implementation Plan — EvidenceGraph `apps/web`

> Produced by the planning step. Read alongside `docs/SPEC_DIGEST.md` and `docs/PLAN.md`.
> Every verification command is run from `c:\Users\Norris\Desktop\SIH_PS5\apps\web` unless noted.

---

## Exploration findings

- **No source files exist** under `apps/web/src/` — the directory doesn't exist yet. Only `package.json` and a `node_modules/` tree are present.
- All workspace packages (`@evidencegraph/domain`, `@evidencegraph/engine`, `@evidencegraph/fixtures`) are already symlinked in `apps/web/node_modules/@evidencegraph/`.
- `pnpm install` has already been run (node_modules is present); no need to re-run unless the coder adds new deps.
- Tailwind version is **4.x** — no `tailwind.config.js`; theme is declared entirely in the `@theme` block of `globals.css`.
- `motion` package is **v12** (Motion for React, successor to Framer Motion); import from `"motion/react"`.
- `cytoscape` **must be rendered only client-side** (no SSR); wrap the component in `dynamic(() => import(...), { ssr: false })`.
- Next.js 15: dynamic route params (`params`, `searchParams`) are `Promise<…>` in async Server Components — always `await params`.
- The in-memory store **must be a singleton module** that calls `assembleDataset(rules)` once. Node's module cache achieves this; no explicit singleton pattern needed.
- `loadRulePack(dir)` from `@evidencegraph/engine` reads the filesystem synchronously; call it with `path.join(process.cwd(), 'rules/aph-2024-27')` resolved from the **workspace root**, not from `apps/web/`.
- Rules directory absolute path: `c:\Users\Norris\Desktop\SIH_PS5\rules\aph-2024-27`.
- `computeMetrics(input)` from `@evidencegraph/engine` takes `MetricsInput` and returns `MetricBoard`.
- `verifyChain(rows)` and `dailyDigest(rows)` come from `@evidencegraph/engine` for the ledger view.
- PII rule: Aadhaar never in data (confirmed by fixture); PAN only as `pan#xxxx…xx` hash — no masking needed for PAN hashes in display. `[Aadhaar Redacted]` placeholder if any UI label mentions Aadhaar.
- Theme tokens (Evidence Desk per PLAN.md §Theme): `#121212` canvas, `#1A1A1A` surface, `#272822` border, `#A6E22E` verified/accent, `#66D9EF` selected/focus, `#F92672` alert, `#75715E` muted.
- Demo script lives at `docs/DEMO_SCRIPT.md` — the `/demo` page must follow it beat-for-beat.

---

## A. Complete file structure

```
apps/web/src/
├── app/
│   ├── globals.css                            # Tailwind v4 @theme + font imports
│   ├── layout.tsx                             # root layout — shell, providers, role switcher
│   ├── page.tsx                               # redirect to /queue
│   ├── (routes)/
│   │   ├── queue/
│   │   │   └── page.tsx                       # application queue — triage order, SLA, filters
│   │   ├── applications/
│   │   │   └── [id]/
│   │   │       ├── page.tsx                   # redirect to .../overview (default tab)
│   │   │       ├── layout.tsx                 # tab shell for all application sub-pages
│   │   │       ├── overview/page.tsx          # summary card + checklist completeness
│   │   │       ├── evidence/page.tsx          # PDF split-view: bbox viewer ↔ facts panel
│   │   │       ├── conflicts/page.tsx         # concept conflict table (cross-document)
│   │   │       ├── forensics/page.tsx         # forensic signal findings + strength badges
│   │   │       ├── verification/page.tsx      # connector timeline per document
│   │   │       ├── graph/page.tsx             # Cytoscape entity neighbourhood
│   │   │       ├── pipeline/page.tsx          # run timeline for this application
│   │   │       ├── letter/page.tsx            # draft deficiency letter view
│   │   │       └── decision/page.tsx          # HITL decision bar (accept/dismiss/escalate)
│   │   ├── self-check/
│   │   │   └── [id]/
│   │   │       └── page.tsx                   # applicant self-check — fix list only
│   │   ├── pipeline/
│   │   │   └── [runId]/
│   │   │       └── page.tsx                   # full pipeline DAG replay for a run
│   │   ├── rules/
│   │   │   └── page.tsx                       # rules admin — list, version, test results
│   │   ├── ledger/
│   │   │   └── page.tsx                       # audit ledger with tamper-demo + chain verify
│   │   ├── metrics/
│   │   │   └── page.tsx                       # MetricBoard charts
│   │   └── demo/
│   │       └── page.tsx                       # presenter bar + keyboard shortcuts
│   └── api/
│       ├── queue/
│       │   └── route.ts                       # GET /api/queue
│       ├── applications/
│       │   └── [id]/
│       │       ├── route.ts                   # GET /api/applications/[id]
│       │       ├── facts/route.ts             # GET /api/applications/[id]/facts
│       │       ├── findings/route.ts          # GET /api/applications/[id]/findings
│       │       ├── verifications/route.ts     # GET /api/applications/[id]/verifications
│       │       ├── conflicts/route.ts         # GET /api/applications/[id]/conflicts
│       │       ├── graph/route.ts             # GET /api/applications/[id]/graph
│       │       ├── pipeline/route.ts          # GET /api/applications/[id]/pipeline
│       │       ├── letter/route.ts            # GET/PUT /api/applications/[id]/letter
│       │       └── decision/route.ts          # POST /api/applications/[id]/decision
│       ├── rules/
│       │   └── route.ts                       # GET /api/rules
│       ├── ledger/
│       │   └── route.ts                       # GET /api/ledger + POST (tamper-demo)
│       └── metrics/
│           └── route.ts                       # GET /api/metrics
├── .data/
│   └── store.ts                               # singleton dataset (assembleDataset), JSON persistence
├── store/
│   ├── role-store.ts                          # Zustand — current role, institution pin
│   └── ui-store.ts                            # Zustand — sidebar collapsed, selected fact id, bbox highlight
├── lib/
│   ├── dataset.ts                             # re-exports from .data/store.ts (typed accessors)
│   ├── format.ts                              # date/number/severity formatters
│   ├── constants.ts                           # FINDING_CLASS_LABELS, SEVERITY_COLORS, AGENT_NODES
│   └── cn.ts                                  # clsx utility (inline — no extra dep)
└── components/
    ├── atoms/
    │   ├── Badge.tsx                          # FindingClass | VerificationStatus | Severity badge
    │   ├── ConfidenceBar.tsx                  # horizontal bar, 0..1
    │   ├── CopyButton.tsx                     # copy-to-clipboard with check icon
    │   ├── MockLabel.tsx                      # "MOCK" pill shown on every simulated source
    │   ├── SlaChip.tsx                        # SLA hours remaining with color threshold
    │   ├── Spinner.tsx                        # loading state
    │   └── Timestamp.tsx                      # ISO string → human-readable, with tooltip
    ├── molecules/
    │   ├── AppHeader.tsx                      # top nav: logo, role switcher dropdown, breadcrumb
    │   ├── Sidebar.tsx                        # collapsible left nav with route links
    │   ├── FindingCard.tsx                    # single finding: class badge, severity, summary, evidence refs
    │   ├── FactRow.tsx                        # single fact: key, value, confidence bar, source, asOf, quarantine badge
    │   ├── VerificationRow.tsx                # connector result row: status badge, field matches, MOCK label
    │   ├── ConflictConceptRow.tsx             # concept row: per-source value + date columns
    │   ├── RuleRow.tsx                        # rule list item: id, version, aphRef, clauseConfirmed badge
    │   ├── LedgerRow.tsx                      # audit row: seq, actor, action, hash snippet
    │   ├── RunEventRow.tsx                    # pipeline node row: status icon, timing, summary
    │   ├── MetricCard.tsx                     # single metric: value + label + optional bar chart
    │   └── DataTable.tsx                      # TanStack Table wrapper — sortable, virtualised, accessible
    └── features/
        ├── QueueTable.tsx                     # application queue table using DataTable
        ├── ApplicationTabs.tsx                # Radix Tabs wrapper for application sub-views
        ├── BboxViewer.tsx                     # synthetic PDF renderer with bbox highlight overlays (client)
        ├── FactsPanel.tsx                     # scrollable fact list with quarantine highlighting
        ├── FindingsPanel.tsx                  # findings list grouped by class
        ├── VerificationTimeline.tsx           # ordered verification attempts with connector info
        ├── ConflictTable.tsx                  # conflict concept table
        ├── ForensicsPanel.tsx                 # forensic + similarity findings with strength
        ├── GraphViewer.tsx                    # Cytoscape graph (client-only, dynamic import)
        ├── CypherDrawer.tsx                   # slide-out drawer showing CYPHER_* constants
        ├── PipelineDAG.tsx                    # agent pipeline DAG with status node icons
        ├── DecisionBar.tsx                    # HITL bar: action buttons + mandatory reason textarea
        ├── LetterPreview.tsx                  # letter draft display + release button (role-gated)
        ├── RulesAdmin.tsx                     # rules table with test-run summary
        ├── LedgerTable.tsx                    # ledger table with tamper button + chain status banner
        ├── MetricsBoard.tsx                   # Recharts bar/gauge layout for MetricBoard
        ├── SelfCheckList.tsx                  # applicant fix list (no forensic internals)
        └── DemoBar.tsx                        # fixed presenter bar: beat counter, next/prev, shortcut hints
```

---

## B. In-memory store design

**File:** `apps/web/src/.data/store.ts`

**Decision:** Use a module-level singleton (`let _ds: Dataset | null = null`). On first call to `getDataset()`, load rules from the YAML pack using `loadRulePack` (synchronous fs read), call `assembleDataset(rules)`, then cache in `_ds`. API routes import the typed accessors only — they never call `assembleDataset` directly. Officer decisions (accept/dismiss/escalate/correct) are written to `.data/store.json` so they survive dev-reload; on startup, if `store.json` exists, apply its patches before returning the dataset. **Rationale:** No external state server in the prototype; a JSON sidecar is simpler and safe for a demo.

```
Rules directory: path.resolve(process.cwd(), 'rules/aph-2024-27')
  → must be called with process.cwd() = c:\Users\Norris\Desktop\SIH_PS5
  → in Next.js App Router, process.cwd() resolves to the workspace root (where next.config is),
     but the project root (monorepo root) is the parent. Use __dirname or path relative to
     the monorepo root via a RULES_DIR env var or by traversing up from __dirname.
  → SAFE APPROACH: in store.ts, use path.resolve(__dirname, '../../../../rules/aph-2024-27')
     __dirname in apps/web/src/.data/ → ../../../../ → workspace root.
     Alternatively, set RULES_DIR env var in .env.local pointing to the absolute path.
     CHOSEN: use path.resolve(process.cwd(), 'rules/aph-2024-27') and document that
     `pnpm dev` must be run from the monorepo root (c:\Users\Norris\Desktop\SIH_PS5).
```

**Exported accessors (all used by API handlers):**
```typescript
getDataset(): Dataset
getSummaries(): ApplicationSummary[]
getSummary(id: string): ApplicationSummary | undefined
getInstitution(id: string): Institution | undefined
getDocuments(appId: string): Document[]
getFacts(appId: string): Fact[]
getFindings(appId: string): Finding[]
getVerifications(appId: string): VerificationAttempt[]
getConflicts(appId: string): ConflictRow[]
getGraph(appId?: string): GraphSubgraph          // if appId given → neighbourhood; else full
getRunEvents(appId: string): RunEvent[]
getLetter(appId: string): LetterDraft | undefined
getLedger(): AuditRow[]
getRules(): Rule[]
getSignalStrengths(): Record<string, SignalStrength>
getMetrics(): MetricBoard

// Mutation (persisted to store.json):
applyDecision(appId: string, findingId: string, action: DecisionAction, reason: string, actor: string): AuditRow
applyCorrection(factId: string, correctedValue: string | number, officer: string): void
tamperLedgerRow(seq: number, patch: Record<string, unknown>): void   // demo only
```

**Persistence:** `store.json` stores `{ decisions: [...], corrections: [...], tamperedRows: [...] }`. Loaded at first `getDataset()` call; written after each mutation using `fs.writeFileSync` (synchronous, safe for dev/demo, not production).

---

## C. API route designs

All routes are Next.js 15 App Router Route Handlers (`export async function GET/POST`). Role check is enforced by reading the `x-eg-role` header (set by the role switcher store on every client request). Zod validates query params and request bodies. All responses are `NextResponse.json(...)`.

### C.1 `GET /api/queue`
- **File:** `app/api/queue/route.ts`
- **Input:** query params `{ status?: ApplicationStatus, region?: string, category?: ApplicationCategory, sort?: 'triage'|'sla' }`
- **Role check:** any role except `applicant`
- **Response:** `ApplicationSummary[]` filtered + sorted
- **Side effects:** none

### C.2 `GET /api/applications/[id]`
- **File:** `app/api/applications/[id]/route.ts`
- **Input:** path param `id`
- **Role check:** `scrutiny_officer | senior_reviewer | auditor`; `applicant` only if `institution.applicantRolePin` matches a cookie/header
- **Response:** `{ summary: ApplicationSummary, institution: Institution, checklist: ChecklistItem[], letter: LetterDraft | null }`
- **Side effects:** none

### C.3 `GET /api/applications/[id]/facts`
- **File:** `app/api/applications/[id]/facts/route.ts`
- **Input:** query `{ docId?: string, key?: string, includeSuperseded?: boolean }`
- **Role check:** `scrutiny_officer | senior_reviewer | auditor`
- **Response:** `Fact[]` (filter applied server-side; `gt.*` facts excluded)
- **Side effects:** none

### C.4 `GET /api/applications/[id]/findings`
- **File:** `app/api/applications/[id]/findings/route.ts`
- **Input:** query `{ class?: FindingClass, severity?: Severity, status?: FindingStatus }`
- **Role check:** `scrutiny_officer | senior_reviewer | auditor`
- **Response:** `{ findings: Finding[], signalStrengths: Record<string, SignalStrength> }`
- **Side effects:** none

### C.5 `GET /api/applications/[id]/verifications`
- **File:** `app/api/applications/[id]/verifications/route.ts`
- **Role check:** `scrutiny_officer | senior_reviewer | auditor`
- **Response:** `VerificationAttempt[]` for the application
- **Side effects:** none

### C.6 `GET /api/applications/[id]/conflicts`
- **File:** `app/api/applications/[id]/conflicts/route.ts`
- **Role check:** `scrutiny_officer | senior_reviewer | auditor`
- **Response:** `ConflictRow[]` (from `getConflicts(id)`)
- **Side effects:** none

### C.7 `GET /api/applications/[id]/graph`
- **File:** `app/api/applications/[id]/graph/route.ts`
- **Input:** query `{ depth?: number }` (default 2)
- **Role check:** `scrutiny_officer | senior_reviewer | auditor`
- **Response:** `GraphSubgraph` — nodes and edges for the institution's neighbourhood
- **Side effects:** none

### C.8 `GET /api/applications/[id]/pipeline`
- **File:** `app/api/applications/[id]/pipeline/route.ts`
- **Role check:** `scrutiny_officer | senior_reviewer | auditor`
- **Response:** `RunEvent[]` for the application
- **Side effects:** none

### C.9 `GET /api/applications/[id]/letter`, `PUT /api/applications/[id]/letter`
- **File:** `app/api/applications/[id]/letter/route.ts`
- **GET:** returns `LetterDraft | null`
- **PUT body (zod):** `{ releasedBy: string }` — sets `releasedAt` and `releasedBy`; appends ledger row `letter.released`
- **Role check GET:** any officer; **PUT:** `senior_reviewer` only
- **Side effects:** PUT mutates store, writes `store.json`, appends ledger row

### C.10 `POST /api/applications/[id]/decision`
- **File:** `app/api/applications/[id]/decision/route.ts`
- **Body (zod):** `{ findingId: string, action: 'accept'|'dismiss'|'escalate', reason: string }`
- **Role check:** `scrutiny_officer` for accept/dismiss; `senior_reviewer` for escalate
- **Response:** `{ finding: Finding, ledgerRow: AuditRow }`
- **Side effects:** calls `applyDecision(...)`, writes `store.json`, appends ledger row `finding.decided`

### C.11 `GET /api/rules`
- **File:** `app/api/rules/route.ts`
- **Role check:** `rule_admin | auditor | scrutiny_officer`
- **Response:** `{ rules: Rule[], ruleCount: number }`
- **Side effects:** none

### C.12 `GET /api/ledger`, `POST /api/ledger`
- **File:** `app/api/ledger/route.ts`
- **GET:** response `{ rows: AuditRow[], integrity: VerifyResult, digest: { day, headHash, signature } }`
- **POST body (zod):** `{ seq: number, patch: Record<string, unknown> }` — demo tamper only
- **Role check GET:** `auditor | senior_reviewer`; **POST:** any (demo)
- **Side effects:** POST calls `tamperLedgerRow`, writes `store.json`

### C.13 `GET /api/metrics`
- **File:** `app/api/metrics/route.ts`
- **Role check:** `scrutiny_officer | senior_reviewer | auditor`
- **Response:** `MetricBoard` (from `getMetrics()`)
- **Side effects:** none

---

## D. Component build order

Build in this strict dependency order (each layer only imports from earlier layers):

### Layer 1 — Config & foundations (no component deps)

- [ ] 1. **`app/globals.css`** — Tailwind v4 `@import "tailwindcss"`, `@theme` block with all CSS variables (`--color-canvas`, `--color-surface`, `--color-border`, `--color-accent-lime`, `--color-accent-cyan`, `--color-alert`, `--color-muted`, `--font-sans`, `--font-mono`), font-face imports from `@fontsource-variable/inter` and `@fontsource/jetbrains-mono`. Motion rules: declare `--duration-fast: 150ms`, `--duration-view: 350ms`, `--ease-crisp: cubic-bezier(0.4,0,0.2,1)`.
  - Files: `app/globals.css`

- [ ] 2. **Config files** — `tsconfig.json` (extends `../../tsconfig.base.json`, `@/*` path alias to `./src/*`), `next.config.ts` (transpilePackages for workspace packages, no `reactStrictMode: false`), `postcss.config.mjs` (`@tailwindcss/postcss` plugin).
  - Files: `apps/web/tsconfig.json`, `apps/web/next.config.ts`, `apps/web/postcss.config.mjs`

- [ ] 3. **`lib/cn.ts`** — `clsx`-style utility implemented inline (no new dep: `(…args) => args.filter(Boolean).join(' ')`). **`lib/constants.ts`** — `FINDING_CLASS_LABELS`, `SEVERITY_COLORS` (maps to CSS var names), `VERIFICATION_STATUS_COLORS`, `AGENT_NODE_LABELS` (9-node pipeline). **`lib/format.ts`** — `fmtDate(iso)`, `fmtSla(hours)`, `fmtPercent(n)`, `fmtScore(n)`. **`lib/dataset.ts`** — thin re-export of accessors from `.data/store.ts` with type annotations.
  - Files: `lib/cn.ts`, `lib/constants.ts`, `lib/format.ts`, `lib/dataset.ts`

### Layer 2 — In-memory store & API scaffolding

- [ ] 4. **`.data/store.ts`** — singleton dataset module. Loads rules via `loadRulePack`, calls `assembleDataset`, exports all typed accessor functions listed in §B. Includes `store.json` read/write logic.
  - Files: `src/.data/store.ts`
  - Depends on: `@evidencegraph/engine` (`loadRulePack`, `computeMetrics`, `verifyChain`, `dailyDigest`, `tamperRow`, `applyCorrection`), `@evidencegraph/fixtures` (`assembleDataset`), `@evidencegraph/domain` types

- [ ] 5. **Zustand stores** — `store/role-store.ts`: `{ role: Role, institutionPin: string | null, setRole, setPin }` persisted to localStorage. `store/ui-store.ts`: `{ selectedFactId: string | null, highlightBbox: Bbox | null, sidebarCollapsed: boolean, setSelectedFact, setHighlight, toggleSidebar }`.
  - Files: `store/role-store.ts`, `store/ui-store.ts`

- [ ] 6. **All 13 API route handlers** (files listed in §C). Implement in one pass since they all follow the same pattern: import accessors from `lib/dataset.ts`, validate with inline zod schemas, role-check from header, return `NextResponse.json(...)`. No cross-route dependencies.
  - Files: all `app/api/*/route.ts` files listed in §C
  - Verify: `cd apps/web && pnpm build` — no TypeScript errors on route files

### Layer 3 — Atoms (no feature deps, no API calls)

- [ ] 7. **`Badge`** — renders `findingClass | verificationStatus | severity | string` with color from `SEVERITY_COLORS`/`VERIFICATION_STATUS_COLORS`. Props: `{ variant: FindingClass | VerificationStatus | Severity | 'mock', label?: string }`. Use `motion` from `"motion/react"` for a 150ms opacity entrance. Accessible: `role="status"`, `aria-label`.
  - Files: `components/atoms/Badge.tsx`

- [ ] 8. **`ConfidenceBar`, `MockLabel`, `SlaChip`, `Spinner`, `CopyButton`, `Timestamp`** — all stateless presentational atoms. `ConfidenceBar`: `{ value: number, threshold?: number }` — colored bar (below threshold = alert color). `SlaChip`: hours < 4 → alert, < 24 → yellow-ish, else muted. `Timestamp`: shows ISO date formatted; tooltip shows full ISO string.
  - Files: `components/atoms/ConfidenceBar.tsx`, `components/atoms/MockLabel.tsx`, `components/atoms/SlaChip.tsx`, `components/atoms/Spinner.tsx`, `components/atoms/CopyButton.tsx`, `components/atoms/Timestamp.tsx`

### Layer 4 — Molecules (combine atoms, still no API calls)

- [ ] 9. **`AppHeader`** — top navigation bar. Contains: EvidenceGraph logo text, role switcher (`@radix-ui/react-select` using `role-store`), breadcrumb from Next.js `usePathname`. Height: 48px. Fixed top, `z-50`.
  - Files: `components/molecules/AppHeader.tsx`
  - Deps: atoms, `store/role-store.ts`

- [ ] 10. **`Sidebar`** — collapsible left nav. Links: Queue, Rules, Ledger, Metrics, Demo. Uses `ui-store.ts` for collapse state. `motion` animate on width (`150ms transform`). ARIA: `nav`, `aria-expanded`.
  - Files: `components/molecules/Sidebar.tsx`
  - Deps: `store/ui-store.ts`, lucide-react icons

- [ ] 11. **`FindingCard`** — Props: `{ finding: Finding, signalStrength?: SignalStrength, onSelect?: () => void }`. Shows class badge, severity badge, summary, APH ref, evidence count, `suggestedAction` in a collapsed details element.
  - Files: `components/molecules/FindingCard.tsx`
  - Deps: Badge, ConfidenceBar atoms

- [ ] 12. **`FactRow`** — Props: `{ fact: Fact, highlighted?: boolean, onClick?: () => void }`. Renders key, value, confidence bar, source chip, asOf date, quarantine warning. Click sets `ui-store.selectedFactId`.
  - Files: `components/molecules/FactRow.tsx`
  - Deps: ConfidenceBar, Badge, Timestamp atoms

- [ ] 13. **`VerificationRow`, `ConflictConceptRow`, `RuleRow`, `LedgerRow`, `RunEventRow`, `MetricCard`** — implement as a batch since they share the same presentational pattern.
  - `VerificationRow`: status badge, MOCK label, field-match rows (match/differs/unavailable coloured), note text.
  - `ConflictConceptRow`: concept label + table of value/source/asOf columns; highlights divergent-same-date rows.
  - `RuleRow`: rule id, version badge, APH ref, clauseConfirmed indicator, onFail class+severity.
  - `LedgerRow`: seq, actor, action, entityId, hash snippet (monospace), prevHash comparison indicator.
  - `RunEventRow`: agent node name, status icon (ok=lime, sent_back=cyan, interrupt=magenta, skipped=muted), timing, summary.
  - `MetricCard`: value prominently, label, optional small bar or gauge using SVG (no recharts here).
  - Files: `components/molecules/VerificationRow.tsx`, `components/molecules/ConflictConceptRow.tsx`, `components/molecules/RuleRow.tsx`, `components/molecules/LedgerRow.tsx`, `components/molecules/RunEventRow.tsx`, `components/molecules/MetricCard.tsx`
  - Deps: Badge, MockLabel, Timestamp, CopyButton atoms

- [ ] 14. **`DataTable`** — TanStack Table v8 wrapper. Props: `{ data, columns, getRowId?, onRowClick?, virtualise?: boolean }`. When `virtualise=true`, uses `@tanstack/react-virtual` with a fixed-height scroll container. Sorts client-side. Accessible: `role="grid"`, column headers with `aria-sort`.
  - Files: `components/molecules/DataTable.tsx`
  - Deps: `@tanstack/react-table`, `@tanstack/react-virtual`

### Layer 5 — Root layout & app shell

- [ ] 15. **`app/layout.tsx`** — root layout. Imports `globals.css`, Inter + JetBrains Mono font vars, wraps with `<QueryClientProvider>` from `@tanstack/react-query`. Renders `AppHeader` + `Sidebar` + `<main>` for `{children}`. Server component; `QueryClientProvider` is a client component child.
  - Files: `app/layout.tsx`
  - Deps: AppHeader, Sidebar molecules; `@tanstack/react-query`

- [ ] 16. **`app/page.tsx`** — `import { redirect } from 'next/navigation'; redirect('/queue')`.
  - Files: `app/page.tsx`

### Layer 6 — Queue view

- [ ] 17. **`components/features/QueueTable.tsx`** — `"use client"`. Fetches from `/api/queue` via TanStack Query. Columns: institution name, category badge, region, triage score bar, top-3 reasons, open findings count (by class), SLA chip. Clicking a row navigates to `/applications/[id]`. Row color: score > 70 → alert tint, 40–70 → mild, else default.
  - Files: `components/features/QueueTable.tsx`
  - Deps: DataTable, Badge, SlaChip, ConfidenceBar molecules/atoms

- [ ] 18. **`app/(routes)/queue/page.tsx`** — Server Component (no params). Renders page heading + filter dropdowns (status, region, category as `<select>`) + `<QueueTable />`. Filter state lives in URL search params (no useState — link-based).
  - Files: `app/(routes)/queue/page.tsx`
  - Verify: `pnpm build` passes; navigating to `/queue` renders the table

### Layer 7 — Application workspace tabs

- [ ] 19. **`app/(routes)/applications/[id]/layout.tsx`** — async Server Component. `await params` to get `id`. Fetches `ApplicationSummary` from the store directly (server-side import of `getSummary`). Renders `<ApplicationTabs id={id}>` around `{children}`. Includes institution name, category, session header.
  - Files: `app/(routes)/applications/[id]/layout.tsx`

- [ ] 20. **`components/features/ApplicationTabs.tsx`** — `"use client"`. Uses `@radix-ui/react-tabs` with tab values matching route segments: `overview`, `evidence`, `conflicts`, `forensics`, `verification`, `graph`, `pipeline`, `letter`, `decision`. On tab click, uses `useRouter().push()` to navigate to the corresponding sub-page. `usePathname()` determines active tab.
  - Files: `components/features/ApplicationTabs.tsx`

### Layer 8 — Application sub-pages (implement in dependency order)

- [ ] 21. **Overview page** — `app/(routes)/applications/[id]/overview/page.tsx`. Server Component. Fetches summary + findings summary from store. Renders: institution info card, checklist completeness grid (green/red per slot), triage score gauge, top-3 triage reasons, open-finding counts by class as small badge chips, SLA countdown.
  - Files: `app/(routes)/applications/[id]/overview/page.tsx`

- [ ] 22. **`BboxViewer`** — `"use client"`, `components/features/BboxViewer.tsx`. Props: `{ document: Document, selectedPage?: number, highlightBbox?: Bbox, onBboxClick?: (bbox: Bbox, factId: string) => void }`. Renders a synthetic page using the `pages[]` spec from the `Document` type: a `<svg>` or `<div>` canvas at a fixed viewport (800×1100px), text lines positioned by `x,y`, sizes by `line.size`, bold/mono styling. `hidden` lines render as `opacity-0 pointer-events-none` but are visible in the DOM (demonstrates injection). Bbox highlights are `<rect>` overlays with `stroke: var(--color-accent-cyan)`, animated opacity. `motion` animates bbox entrance (200ms). Shows a "MOCK synthetic page render — not a PDF renderer" label.
  - Files: `components/features/BboxViewer.tsx`

- [ ] 23. **`FactsPanel`** — `"use client"`, `components/features/FactsPanel.tsx`. Props: `{ appId: string, selectedFactId?: string, onFactSelect: (id: string, bbox: Bbox | null) => void }`. Fetches from `/api/applications/[id]/facts`. Renders `FactRow` list, groups by document. Quarantined facts get a distinct "held at confidence gate" banner. Virtualised with `@tanstack/react-virtual`.
  - Files: `components/features/FactsPanel.tsx`

- [ ] 24. **Evidence split-view page** — `app/(routes)/applications/[id]/evidence/page.tsx`. `"use client"`. Layout: left half `BboxViewer`, right half `FactsPanel`. When a fact is selected in the panel, left side highlights that fact's bbox. When a bbox in the viewer is clicked, the right panel scrolls to the matching fact. State bridged via `ui-store`. Document selector dropdown at top (switches which document is shown). `motion` animates panel transitions (300ms).
  - Files: `app/(routes)/applications/[id]/evidence/page.tsx`

- [ ] 25. **Conflicts page** — `app/(routes)/applications/[id]/conflicts/page.tsx`. `"use client"`. Fetches from `/api/applications/[id]/conflicts`. Renders `ConflictTable` component.
  **`ConflictTable`** — `components/features/ConflictTable.tsx`. Props: `{ appId: string }`. One section per concept; each section shows a `ConflictConceptRow` and a `divergentSameDate` warning badge.
  - Files: `app/(routes)/applications/[id]/conflicts/page.tsx`, `components/features/ConflictTable.tsx`

- [ ] 26. **`FindingsPanel`** — `components/features/FindingsPanel.tsx`. `"use client"`. Props: `{ appId: string, filterClass?: FindingClass }`. Fetches from `/api/applications/[id]/findings`. Groups by `findingClass` (5 groups). Each group collapsible. Renders `FindingCard` per finding.
  - Files: `components/features/FindingsPanel.tsx`

- [ ] 27. **Forensics page** — `app/(routes)/applications/[id]/forensics/page.tsx`. `"use client"`. Renders `FindingsPanel` filtered to `anomaly_signal` class, plus a separate section for verification-related findings. Shows forensic signal strength badges (strong/medium/weak with corresponding colors). Includes a "Forensics never issues verdicts — preliminary signals only" disclaimer banner.
  - Files: `app/(routes)/applications/[id]/forensics/page.tsx`

- [ ] 28. **`VerificationTimeline`** — `components/features/VerificationTimeline.tsx`. `"use client"`. Props: `{ appId: string }`. Fetches `/api/applications/[id]/verifications`. Renders each `VerificationAttempt` as a timeline entry: document type, connector name, timestamps, status badge, `VerificationRow` for field matches, MOCK label on every entry. `source_unavailable` entries show circuit-breaker note. Animate in with staggered `motion` (200ms delay per item).
  - Files: `components/features/VerificationTimeline.tsx`
  **Verification page** — `app/(routes)/applications/[id]/verification/page.tsx`. Renders `<VerificationTimeline appId={id} />`.
  - Files: `app/(routes)/applications/[id]/verification/page.tsx`

- [ ] 29. **`GraphViewer` + `CypherDrawer`** — `components/features/GraphViewer.tsx`. `"use client"`. Loaded via `dynamic(() => import('./GraphViewer'), { ssr: false })` in the graph page. Props: `{ subgraph: GraphSubgraph, focusId?: string }`. Uses `cytoscape` with a `cose-bilkent` layout simulation (or `cola`; cytoscape ships with `cose` built-in — use that). Node colors by label: Institution=lime, Trust=cyan, Person=magenta, LandParcel=olive, FDR=amber, Signatory=muted, StampImage/Photo=muted. Conflict/NEAR_DUPLICATE edges are dashed + alert color. Clicking a node shows a `@radix-ui/react-tooltip` with node props. `CypherDrawer` (`components/features/CypherDrawer.tsx`): slide-out `@radix-ui/react-dialog` showing `CYPHER_GHOST_FACULTY`, `CYPHER_RECYCLED_LAND`, `CYPHER_REUSED_FDR` constants in a monospace block.
  - Files: `components/features/GraphViewer.tsx`, `components/features/CypherDrawer.tsx`
  **Graph page** — `app/(routes)/applications/[id]/graph/page.tsx`. `"use client"`. Fetches `/api/applications/[id]/graph`. Renders `GraphViewer` (dynamically imported). Includes `CypherDrawer` trigger button.
  - Files: `app/(routes)/applications/[id]/graph/page.tsx`

- [ ] 30. **`PipelineDAG`** — `components/features/PipelineDAG.tsx`. `"use client"`. Props: `{ events: RunEvent[] }`. Renders the 9-node pipeline (intake → doc_reader → forensics → source_verifier → confidence_gate → cross_check → compliance → critic → reporter) as an SVG DAG. Each node is a rounded rect colored by `RunEvent.status`: ok=lime, sent_back=cyan, interrupt=magenta, skipped=muted. Nodes with no `RunEvent` entry render as pending=gray. Clicking a node expands a detail drawer showing inputs/outputs/summary.
  - Files: `components/features/PipelineDAG.tsx`
  **Pipeline page (per application)** — `app/(routes)/applications/[id]/pipeline/page.tsx`. `"use client"`. Fetches `/api/applications/[id]/pipeline`. Renders `<PipelineDAG events={...} />`.
  - Files: `app/(routes)/applications/[id]/pipeline/page.tsx`
  **Pipeline standalone route** — `app/(routes)/pipeline/[runId]/page.tsx`. Same as above but takes `runId` = institutionId. Redirects to the application pipeline page.
  - Files: `app/(routes)/pipeline/[runId]/page.tsx`

- [ ] 31. **Letter + Decision pages**
  **`LetterPreview`** — `components/features/LetterPreview.tsx`. `"use client"`. Props: `{ appId: string }`. Fetches letter from `/api/applications/[id]/letter`. Displays body in a monospace block, clause citations as badges. Shows "Draft — not sent by the system" disclaimer. If role is `senior_reviewer`, shows "Release letter" button (calls PUT on the API). Pressing release requires confirmation via a `@radix-ui/react-dialog`.
  - Files: `components/features/LetterPreview.tsx`
  **Letter page** — `app/(routes)/applications/[id]/letter/page.tsx`. Renders `<LetterPreview appId={id} />`.
  - Files: `app/(routes)/applications/[id]/letter/page.tsx`

  **`DecisionBar`** — `components/features/DecisionBar.tsx`. `"use client"`. Props: `{ appId: string }`. Fetches findings for the application. Renders a three-column panel: left=findings list (click to select), center=selected finding detail, right=action buttons (Accept/Dismiss/Escalate based on role) + mandatory reason textarea. Disabled when reason is empty. On submit calls `POST /api/applications/[id]/decision`. Animates action confirmation with `motion` (opacity+translate, 200ms).
  - Files: `components/features/DecisionBar.tsx`
  **Decision page** — `app/(routes)/applications/[id]/decision/page.tsx`. Renders `<DecisionBar appId={id} />`.
  - Files: `app/(routes)/applications/[id]/decision/page.tsx`

  **Application redirect** — `app/(routes)/applications/[id]/page.tsx`. Server component: `redirect(\`/applications/${id}/overview\`)`.
  - Files: `app/(routes)/applications/[id]/page.tsx`

### Layer 9 — Self-check view

- [ ] 32. **`SelfCheckList`** — `components/features/SelfCheckList.tsx`. `"use client"`. Props: `{ appId: string }`. Role guard: only renders for `applicant`. Fetches findings filtered to the institution's own application. Shows findings as a fix-list: summary, suggestedAction, finding class badge. **Does NOT show:** triage score, forensic details, cross-institution links, confidence numbers. Shows checklist completeness.
  - Files: `components/features/SelfCheckList.tsx`
  **Self-check page** — `app/(routes)/self-check/[id]/page.tsx`. Renders `<SelfCheckList appId={id} />` + institution name header. If role ≠ `applicant`, shows "Access restricted" message.
  - Files: `app/(routes)/self-check/[id]/page.tsx`

### Layer 10 — Rules, Ledger, Metrics pages

- [ ] 33. **`RulesAdmin`** — `components/features/RulesAdmin.tsx`. `"use client"`. Fetches `/api/rules`. Renders `RuleRow` items in a DataTable: id, version, APH ref, kind, clauseConfirmed badge, onFail class+severity. Expandable row shows rule `assert` expression and test cases. `clauseConfirmed: false` rows highlighted with a muted warning (APH ref contains `[fill in]`). Role check: `rule_admin` sees all; others see read-only.
  - Files: `components/features/RulesAdmin.tsx`
  **Rules page** — `app/(routes)/rules/page.tsx`. Renders `<RulesAdmin />`.
  - Files: `app/(routes)/rules/page.tsx`

- [ ] 34. **`LedgerTable`** — `components/features/LedgerTable.tsx`. `"use client"`. Fetches `/api/ledger`. Shows chain integrity banner (ok=lime, broken=alert with broken-at seq highlighted). Shows `dailyDigest` signature. Renders `LedgerRow` items in a virtualised DataTable. "Tamper row N" button (demo only, labeled clearly) calls `POST /api/ledger` with a patch and re-fetches, showing the chain break. Uses `motion` for the broken-chain banner entrance (300ms).
  - Files: `components/features/LedgerTable.tsx`
  **Ledger page** — `app/(routes)/ledger/page.tsx`. Renders `<LedgerTable />`.
  - Files: `app/(routes)/ledger/page.tsx`

- [ ] 35. **`MetricsBoard`** — `components/features/MetricsBoard.tsx`. `"use client"`. Fetches `/api/metrics`. Layout: 2-col grid of `MetricCard`s. For `fieldAccuracyPerDocType`, renders a Recharts `BarChart` (docType vs accuracy). For `discrepancyPrecision/Recall`, two `RadialBarChart` or `PieChart` gauges. Shows `falsePositiveRate` prominently (zero on clean controls is a demo talking point). All numbers show as percentages where appropriate. Labels all figures with "computed from fixture dataset — not simulated".
  - Files: `components/features/MetricsBoard.tsx`
  **Metrics page** — `app/(routes)/metrics/page.tsx`. Renders `<MetricsBoard />`.
  - Files: `app/(routes)/metrics/page.tsx`

### Layer 11 — Demo presenter view

- [ ] 36. **`DemoBar`** — `components/features/DemoBar.tsx`. `"use client"`. Fixed-bottom bar (height 56px, z-index above content). State: current beat index (6-minute demo has 6 beats from DEMO_SCRIPT). Shows beat number, description text, prev/next buttons. Keyboard shortcuts: `→` next beat, `←` prev, `Esc` dismiss. Each beat navigates to the relevant route and optionally sets URL params. Beat list:
  1. `/queue` — "Queue + top reasons · 0:00"
  2. `/self-check/[id]` (Pallavaram, INTK-2026-0229) — "Self-check · 0:45"
  3. `/applications/EOA-2026-0142/evidence` — "Split-view jump to deed p.3 · 1:30"
  4. `/applications/INTK-2026-0208/graph` — "Graph, ghost faculty, Cypher · 2:30"
  5. `/applications/EOA-2026-0117/evidence?factKey=faculty.roster_count` — "Confidence gate fix blurred digit · 3:20"
  6. `/applications/NEW-2026-0058/forensics` — "Prompt injection ignored + flagged · 4:00"
  7. `/rules` — "Rule replay vs last session · 4:40"
  8. `/ledger` — "Ledger tamper breaks the chain · 5:20"
  - Files: `components/features/DemoBar.tsx`
  **Demo page** — `app/(routes)/demo/page.tsx`. Renders an overview of the prototype + links to each beat. Renders `<DemoBar />`. Shows the Real-vs-Simulated table from README.
  - Files: `app/(routes)/demo/page.tsx`

---

## E. Technical constraints recap

| Constraint | Binding decision |
|---|---|
| Next.js 15, App Router | All page files are async Server Components by default. `"use client"` only on interactive components. `await params` in all dynamic route handlers. |
| Tailwind v4 | `@theme` in `globals.css` only. No `tailwind.config.js`. Use CSS variables from `@theme` via `var(--...)` in inline styles for dynamic colors (Tailwind v4 CSS vars are first-class). |
| `motion` v12 | Import from `"motion/react"`. Use `<motion.div>` or `animate()`. Only animate `transform` and `opacity` (GPU-only rule). |
| Cytoscape SSR | `dynamic(() => import('../features/GraphViewer'), { ssr: false })`. The `cytoscape` import itself goes inside `GraphViewer.tsx` (client component only). |
| `@tanstack/react-query` v5 | `QueryClientProvider` in layout. Fetch functions use `queryFn: async () => fetch(...).then(r => r.json())`. |
| `@radix-ui/*` | All Radix components are already client-side. Import from the exact package (e.g. `@radix-ui/react-tabs`). |
| PII rule | No Aadhaar data exists in fixtures. PAN values are hashes (`pan#xxxx…xx`) — display as-is but label as "PAN (hash)". `[Aadhaar Redacted]` is used for any label that would reference it. |
| `assembleDataset` server-only | Only imported in `.data/store.ts`. Never imported in client components. |
| `loadRulePack` path | `path.resolve(process.cwd(), 'rules/aph-2024-27')` — dev server launched from monorepo root. Add `.env.local` with `RULES_DIR=rules/aph-2024-27` as fallback. |
| TypeScript strict | `tsconfig.json` must extend `../../tsconfig.base.json` which already has `strict: true`. All API response types must match domain types exactly. |

---

## F. Risk items

1. **`process.cwd()` in Next.js App Router** — In Next.js 15, `process.cwd()` returns the app root (`apps/web/`), not the monorepo root. `loadRulePack` uses `node:fs` which resolves relative to cwd. Mitigation: in `.data/store.ts`, use `path.resolve(__dirname, '../../../../rules/aph-2024-27')` via `__dirname` (works in CJS output from Next.js) OR set `RULES_DIR` in `.env.local` pointing to the absolute path. The coder **must verify** by logging the resolved path in development.

2. **Cytoscape + SSR** — Cytoscape accesses `window` on import. Any code path that imports `cytoscape` without `{ ssr: false }` will crash the build. The `GraphViewer` component file itself must begin with `"use client"` AND be imported only via `dynamic(..., { ssr: false })` from page components.

3. **`motion` v12 API shape** — `motion` v12 (Motion for React) is a rewrite; import from `"motion/react"` not `"framer-motion"`. The `<motion.div>` API is compatible but `AnimatePresence` and `useAnimation` APIs have minor changes. Stick to `<motion.div animate={{ opacity, transform }}>` pattern which is stable.

4. **Tailwind v4 config-less** — v4 uses `@import "tailwindcss"` and `@theme { ... }` in CSS. There is no `content:` array needed (v4 scans by default). The `@tailwindcss/postcss` PostCSS plugin replaces the old `tailwindcss` plugin. `postcss.config.mjs` must use `{ plugins: { '@tailwindcss/postcss': {} } }`.

5. **`assembleDataset` initialization time** — The first cold call may take 200–400ms (12 institutions × document building). This runs at server startup in dev mode (first API call). Subsequent calls use the module cache. Not a problem for demo use; document this in the README.

6. **Next.js 15 async params** — `params` in App Router page components is `Promise<{ id: string }>`. Always `const { id } = await params;` before use. Forgetting this produces a runtime warning / type error.

7. **TanStack Table v8 + React 19** — `@tanstack/react-table` v8.20 supports React 19. Use `getCoreRowModel`, `getSortedRowModel` from `@tanstack/react-table`. No `createColumnHelper` pattern change needed.

8. **`recharts` + SSR** — `recharts` uses `window` internally. Chart components must be in `"use client"` files. The MetricsBoard component should be entirely client-side.

9. **`store.json` write race condition** — If multiple API routes mutate concurrently (unlikely in demo), `fs.writeFileSync` could race. Mitigation: wrap mutations in a simple in-process lock using a `Promise` queue. For demo purposes this is acceptable risk.

10. **Wording guard in UI** — No UI label or component may contain the words "forged", "fake", or "fraud" (see `BANNED_WORDS` in domain). Use "anomaly signal", "discrepancy", "potential discrepancy" as per spec §07 and §10.

---

## Verification commands

After each numbered step, the coder should run:
```powershell
# From: c:\Users\Norris\Desktop\SIH_PS5\apps\web
pnpm build
```
Expected: exit code 0, no TypeScript errors.

For the full integration check (after all steps):
```powershell
# From: c:\Users\Norris\Desktop\SIH_PS5
pnpm --filter web build
```
Then:
```powershell
pnpm --filter web dev
# Navigate to http://localhost:3100/queue
# Verify: 12 applications render in triage order
# Navigate to /applications/EOA-2026-0142/evidence → BboxViewer renders
# Navigate to /applications/INTK-2026-0208/graph → graph renders (Cytoscape, client-only)
# Navigate to /ledger → chain integrity shows ok, tamper button breaks chain
# Navigate to /metrics → MetricBoard renders with non-zero values
```
