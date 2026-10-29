# PLAN — EvidenceGraph prototype build

## Folder layout

```
/apps/web            Next.js App Router (TS strict) — the whole UI + route handlers
/packages/domain     zod schemas + TS types mirroring spec §06/§07 (and the two-axis model)
/packages/engine     rule engine, cross-check, critic, confidence gate, ledger, triage, connectors (pure, no UI imports)
/packages/fixtures   seeded generator + typed fixture dataset (institutions, documents, pages, facts, forensics, graph edges)
/rules/aph-2024-27   YAML rule packs (machine-readable, replayable)
/scripts             one-off generators (page images, ledgers)
/playwright          e2e tests incl. the 6-minute demo run
```

## Guiding decisions

- **Determinism everywhere**: seeded PRNG; every run from the same seed produces byte-identical documents, facts, findings and ledger rows (except mocked OCR latency fields, which use a fixed schedule).
- **Real-vs-simulated line (prompt §2)**: rule engine, YAML packs, rule replay, critic, confidence gate, SHA-256 hash-chained ledger, RBAC/PII masking = **real code with tests**. OCR, vision models, issuer connectors = **MOCK fixtures**, labelled on-screen.
- **APH numbers**: never invented. Rule packs carry `[fill in: APH reference]` markers, surfaced in UI and README.
- **Theme**: Evidence Desk (spec §5.2 tokens) replaces Monokai Matrix. Monokai survives only in the Cypher drawer + ledger hash column. "Never use" list respected (§5.4).
- **Two-axis model** from the spec is first-class in `domain`: finding class × verification status are independent axes, never conflated.

## Phases (drives the todo list)

1. Docs: SPEC_DIGEST (from architecture HTML), PLAN, ASSUMPTIONS, DEMO_SCRIPT.
2. Monorepo scaffold: pnpm workspace, TS strict, vitest, install deps, git init.
3. `packages/domain`: zod schemas for facts/findings/verifications/ledger/roles/pages/graph.
4. `packages/engine`: safe expression evaluator + YAML rule loader/runner (no eval).
5. `packages/fixtures`: seeded institutions (12), applications (13 faults + 5 controls), documents/pages with layout + bboxes, facts, forensic findings, graph edges, run timeline.
6. Engine services: cross-check, critic, confidence gate, mock connectors, ledger, triage.
7. `rules/aph-2024-27` YAML packs + rule tests (each rule documented ↔ fault id).
8. `apps/web` foundations: tokens/theme, fonts, app shell, role switcher, API layer, PII masking.
9. Screens: queue, application workspace (evidence, conflicts, decision bar), page viewer with bbox overlays.
10. Screens: graph view + Cypher drawer, verification timeline, report + letter, self-check.
11. Screens: pipeline replay, rules admin, ledger, metrics.
12. `/demo` presenter bar + keyboard shortcuts + signature motion moments (reduced-motion aware).
13. Verification: typecheck, lint, tests, build, fault matrix (13/13), controls (0 high), contrast, PII grep, Playwright.
14. README (real-vs-simulated, APH markers), DEMO_SCRIPT, final report.
