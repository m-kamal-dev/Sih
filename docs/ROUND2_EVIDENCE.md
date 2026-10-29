# Round-2 Evidence — EvidenceGraph

Measured, non-negotiable evidence for the Round-2 demo, generated from the
current repository state (branch `main`, commits `Phase 0 … Phase 8`). Screens
are `docs/screenshots/*-{light,dark}.png` (headless Chromium, 1440×900).

## Verification commands (raw result)

`pnpm verify` runs, in order and all green (`✓ all verification steps passed`):

| Step | Result |
|---|---|
| typecheck (domain, engine, fixtures, web) | pass |
| lint | ✔ No ESLint warnings or errors |
| unit tests | 117 passed (117) |
| contrast check | text/semantic 4.5:1 on all four surfaces, both themes |
| PII scan | no raw Aadhaar/PAN sequences |
| wording gate | no banned terms in user-visible strings |
| production build | pass |
| bundle budget | all non-API routes ≤ 150 kB first load JS |
| API timing (production server) | all endpoints p95 ≤ 50 ms (worst observed 15 ms) |
| e2e (Playwright incl. axe sweep) | pass — 14/14 axe routes zero serious/critical |

## Screenshots

| Screen | Light | Dark |
|---|---|---|
| Queue | `docs/screenshots/queue-light.png` | `queue-dark.png` |
| Workspace overview | `workspace-overview-light.png` | `workspace-overview-dark.png` |
| Evidence split view | `workspace-evidence-light.png` | `workspace-evidence-dark.png` |
| Conflicts | `workspace-conflicts-light.png` | `workspace-conflicts-dark.png` |
| Graph | `workspace-graph-light.png` | `workspace-graph-dark.png` |
| Verification timeline | `workspace-verification-light.png` | `workspace-verification-dark.png` |
| Decision | `workspace-decision-light.png` | `workspace-decision-dark.png` |
| Rules | `rules-light.png` / `rules-dark.png` | |
| Ledger | `ledger-light.png` / `ledger-dark.png` | |
| Metrics | `metrics-light.png` / `metrics-dark.png` | |
| Self-check | `self-check-light.png` / `self-check-dark.png` | |
| Demo | `demo-light.png` / `demo-dark.png` | |

## Measured performance

| Metric | Measured | Budget |
|---|---|---|
| Server cold start → ready | ~660 ms | ≤ 3 s |
| API p95 (10 endpoints) | ≤ 15 ms | ≤ 50 ms |
| First Load JS / (root) | 103 kB | ≤ 150 kB |
| First Load JS /queue | 119 kB | ≤ 150 kB |
| First Load JS /rules | 115 kB | ≤ 150 kB |
| First Load JS /ledger | 117 kB | ≤ 150 kB |
| First Load JS /metrics | 115 kB (was 215 kB before chart split) | ≤ 150 kB |
| First Load JS /self-check | 115 kB | ≤ 150 kB |
| First Load JS /demo | 109 kB | ≤ 150 kB |
| First Load JS /applications/[id]/evidence | 137 kB (heaviest workspace tab; cytoscape lazy) | ≤ 150 kB |

## Requirements traceability

| Round-2 requirement | Screen | Test | Spec section |
|---|---|---|---|
| Configurable rules | `/rules` (pack list, tests, unconfirmed-clause badges) | `packages/engine` rule + injection tests | Architecture §Rules |
| Authorised verification | `/applications/[id]/verification` (statuses, retries, breaker, MOCK labels) | connector status/backoff tests; e2e verification view | Architecture §Verification |
| Evidence-linked findings | Evidence/Conflicts tabs (jump-to-crop, bbox outline) | e2e split-view spec; unit evidence-resolution tests | Architecture §Evidence |
| Secure handling | API error model, RBAC header policy, self-check 403s, ETag/304, rate limit | `apps/web/e2e/api` contract tests; axe/role specs | Architecture §Security |
| Human review | Decision tab (accept/dismiss with mandatory reason) + Letter "Draft. Not sent" | decision-flow `review-flows.spec.ts` | Architecture §Human-in-loop |
| Auditability | `/ledger` chain + tamper cascade; health endpoint exposes chain validity | ledger e2e; `getVerifyResult` unit tests | Architecture §Audit |

## Items not verified

- Interactive-frame screenshots: the Freebuff preview window was not drawable
  during capture; the set is headless Chromium instead (same viewport/build).
- No animated-fps (CLS) Playwright harness was added in this round; motion rules
  were verified by repo grep + code review, not runtime measurement.
- Metrics values are fixture-derived; there is no live-traffic measurement.
