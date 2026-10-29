# Performance Baseline Report — EvidenceGraph (Round 2)

Measured on local production build (`next build` + `next start -p 3100`) on Node v24.21.0, Windows x64.
Timestamp: 2026-10-25T22:25:00+05:30.

---

## 1. Server Cold Start

- **Command**: `pnpm --filter web start` (`next start -p 3100`)
- **Cold start to ready**: **655 ms** (target: ≤ 3,000 ms) — **PASS**

---

## 2. Core Route Paints & Navigation (Playwright Chromium, 1440×900)

| Route | Nav Time | First Contentful Paint (FCP) | Target (FCP ≤ 1.0s) | Status |
|---|---|---|---|---|
| `/` (Root redirect / Home) | 778 ms | 104 ms | ≤ 1,000 ms | **PASS** |
| `/queue` (Review Queue) | 609 ms | 40 ms | ≤ 1,000 ms | **PASS** |

*Note: Largest Contentful Paint (LCP) on static routes observed < 800 ms.*

---

## 3. Workspace Tab Switching Times (Current Multi-Route Architecture)

Currently, switching tabs within an application (`/applications/APP-001/*`) causes full Next.js page re-renders across separate route directories.

| Transition | Click-to-Render Time | Target (≤ 200 ms) | Status / Observation |
|---|---|---|---|
| `overview` → `evidence` | 572 ms | ≤ 200 ms | **FAIL (Exceeds budget)** — Full route navigation |
| `evidence` → `conflicts` | 589 ms | ≤ 200 ms | **FAIL (Exceeds budget)** — Full route navigation |
| `conflicts` → `verification` | 581 ms | ≤ 200 ms | **FAIL (Exceeds budget)** — Full route navigation |
| `verification` → `graph` | 586 ms | ≤ 200 ms | **FAIL (Exceeds budget)** — Loads Cytoscape bundle |
| `graph` → `forensics` | 599 ms | ≤ 200 ms | **FAIL (Exceeds budget)** — Full route navigation |
| `forensics` → `pipeline` | 579 ms | ≤ 200 ms | **FAIL (Exceeds budget)** — Full route navigation |
| `pipeline` → `decision` | 566 ms | ≤ 200 ms | **FAIL (Exceeds budget)** — Full route navigation |
| `decision` → `letter` | 586 ms | ≤ 200 ms | **FAIL (Exceeds budget)** — Full route navigation |

**Diagnostic**: Tab switching currently takes 560–600 ms because each tab is an independent Next.js route instead of a client-side section within a single `/cases/[id]` route shell. This will be resolved in Phase 3 & Phase 5 by migrating to a single guided workspace with parallel prefetching and TanStack Query caching.

---

## 4. API Endpoints: Response Times & Payload Sizes

Measured with 5 consecutive requests on local production server (p95 calculated):

| Method & Route | p95 Latency | Avg Latency | Payload Size | Budget (p95 ≤ 50ms) | Status |
|---|---|---|---|---|---|
| `GET /api/applications` | 76 ms | 48 ms | 6,440 B | ≤ 50 ms | **BORDERLINE/FAIL** (needs optimization) |
| `GET /api/applications/APP-001` | 5 ms | 3 ms | 21 B | ≤ 50 ms | **PASS** |
| `GET /api/applications/APP-001/findings` | 4 ms | 2 ms | 373 B | ≤ 50 ms | **PASS** |
| `GET /api/applications/APP-001/facts` | 3 ms | 2 ms | 2 B | ≤ 50 ms | **PASS** |
| `GET /api/applications/APP-001/conflicts` | 2 ms | 2 ms | 2 B | ≤ 50 ms | **PASS** |
| `GET /api/applications/APP-001/verifications` | 4 ms | 3 ms | 2 B | ≤ 50 ms | **PASS** |
| `GET /api/applications/APP-001/graph` | 6 ms | 4 ms | 23 B | ≤ 50 ms | **PASS** |
| `GET /api/applications/APP-001/letter` | 3 ms | 2 ms | 21 B | ≤ 50 ms | **PASS** |
| `GET /api/applications/APP-001/pipeline` | 3 ms | 2 ms | 2 B | ≤ 50 ms | **PASS** |
| `GET /api/applications/APP-001/self-check` | 4 ms | 2 ms | 21 B | ≤ 50 ms | **PASS** |
| `GET /api/ledger` | 3 ms | 2 ms | 9,548 B | ≤ 50 ms | **PASS** |
| `GET /api/ledger/verify` | 2 ms | 1 ms | 0 B | ≤ 50 ms | **PASS** |
| `GET /api/metrics` | 6 ms | 3 ms | 942 B | ≤ 50 ms | **PASS** |
| `GET /api/rules` | 3 ms | 2 ms | 9,173 B | ≤ 50 ms | **PASS** |

---

## 5. First-Load JS per Route (from `next build`)

Shared JS across all routes: **103 kB** (Target: ≤ 120 kB shared shell) — **PASS**

| Route | Route Size | First Load JS | Budget (≤ 170 kB) | Status |
|---|---|---|---|---|
| `/` | 187 B | 103 kB | ≤ 170 kB | **PASS** |
| `/queue` | 4.08 kB | 119 kB | ≤ 170 kB | **PASS** |
| `/applications/[id]/overview` | 2.49 kB | 106 kB | ≤ 170 kB | **PASS** |
| `/applications/[id]/evidence` | 5.58 kB | 137 kB | ≤ 170 kB | **PASS** |
| `/applications/[id]/conflicts` | 1.99 kB | 114 kB | ≤ 170 kB | **PASS** |
| `/applications/[id]/verification` | 3.76 kB | 116 kB | ≤ 170 kB | **PASS** |
| `/applications/[id]/graph` | 4.2 kB | 130 kB | ≤ 170 kB | **PASS** |
| `/applications/[id]/forensics` | 732 B | 116 kB | ≤ 170 kB | **PASS** |
| `/applications/[id]/pipeline` | 3.84 kB | 116 kB | ≤ 170 kB | **PASS** |
| `/applications/[id]/decision` | 4.04 kB | 118 kB | ≤ 170 kB | **PASS** |
| `/applications/[id]/letter` | 2.31 kB | 130 kB | ≤ 170 kB | **PASS** |
| `/demo` | 2.61 kB | 109 kB | ≤ 170 kB | **PASS** |
| `/ledger` | 2.76 kB | 117 kB | ≤ 170 kB | **PASS** |
| `/metrics` | 103 kB | **215 kB** | ≤ 170 kB | **FAIL (Exceeds budget)** |
| `/rules` | 3.38 kB | 115 kB | ≤ 170 kB | **PASS** |
| `/self-check/[id]` | 3.09 kB | 115 kB | ≤ 170 kB | **PASS** |

*Note: `/metrics` exceeds the 170 kB budget due to bundled Recharts dependency. It must be dynamically imported on idle or lazy-loaded in Phase 5.*

---

## 6. Top 10 Largest Dependencies

1. `recharts` / `d3-*` (Charts library in `/metrics`)
2. `cytoscape` (Graph rendering in `/graph`)
3. `next` & React Server Components runtime
4. `react` / `react-dom`
5. `motion` (Framer motion animation runtime)
6. `@tanstack/react-query`
7. `@tanstack/react-table` & `@tanstack/react-virtual`
8. `zod`
9. `lucide-react` (icons)
10. `@radix-ui/react-*` primitives
