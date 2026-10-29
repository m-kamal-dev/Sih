# ASSUMPTIONS — decisions taken where the spec left room

The prompt says: work autonomously, record assumptions, continue. Each one below is the
option judged closest to the architecture file.

1. **Package consumption via TS path aliases.** `packages/*` are real folders with
   `package.json`, but the app imports them through `@domain/*` / `@engine/*` /
   `@fixtures/*` aliases pointing at `src/`, so neither Next nor vitest needs a
   pre-build of the packages. `packages/engine` remains pure (zero UI imports).

2. **UI primitives.** Small local components built directly on Radix primitives
   (dialog, dropdown-menu, tabs, tooltip, switch) styled with the Evidence Desk tokens,
   instead of pulling the shadcn registry. Same visual language, fewer moving parts,
   works offline.

3. **Fonts.** Geist is not available as a self-hosted `@fontsource` package in every
   environment, so the UI font is **Inter variable** (`@fontsource-variable/inter`) and
   monospace is **JetBrains Mono** (`@fontsource/jetbrains-mono`) — the prompt allows
   "Geist Sans or Inter".

4. **Demo identity.** There is no real OIDC. The demo role switcher (header) sends
   `X-Demo-Role`, and the API layer validates every request against the §12 RBAC table
   (pure policy function in `packages/engine`, unit-tested at API level). Applicant
   institutions are pinned 1:1 (`applicant:Lumencrest` etc.).

5. **Ledger anchor.** The signed daily digest uses an HMAC-SHA256 with a fixed demo key,
   labelled "demo key" in the UI — the property being demonstrated is the hash chain,
   not real PKI.

6. **`confirmed_violation`** does not occur in the seed data (no fault in §16 requires
   it); the decision bar and Critic support it, and the rule engine can produce it when
   all inputs are verified/human-confirmed.

7. **Runs.** Each application has exactly one deterministic run (`runId = application id`).
   `/pipeline/[runId]` replays its timeline; it is honest in the UI ("replay of recorded
   run events") and in the README.

8. **Metrics timing.** "Time per application" and "alert latency" are derived from the
   seeded run-timeline timestamps (interleave generated deterministically), not a live
   stopwatch; this is stated on the metrics board.

9. **PDF.js variant of the page viewer.** The prompt makes the React/SVG synthetic page
   renderer the requirement and PDF.js optional. We ship the synthetic renderer behind a
   `PageViewer` interface (declared in `packages/fixtures`) so a PDF.js implementation is
   a drop-in swap; the swap itself is not built.

10. **Recharts** for the metrics board (thin strokes, direct labels, colour-blind-safe).

11. **Letter "send".** Per §12 the system cannot send letters. Senior reviewer's action
    is "release for dispatch", which stamps the draft `approved_for_release` in the
    ledger — no external channel is touched, and the banner truthfully reads
    "Draft. Not sent" until then.

12. **Windows shell.** Scripts are plain `node` invocations (no bash-isms) because the
    target laptop is Windows.

13. **`[fill in]` APH markers** remain in every rule file whose exact clause was not
    confirmed by the team; the UI renders a "clause to be confirmed" badge wherever such
    a rule is cited. No regulatory number is invented anywhere in the rule pack.

14. **Fault severity.** Where the architecture fault table specifies a finding but no
    severity, the fixture uses the severity already declared by the matching rule YAML.
    This is a prototype behavior assumption, not a regulatory judgment.

15. **Synthetic crop evidence.** Fixture crop references point to deterministic keys in
    the synthetic crop inventory; the prototype does not store or display applicant PDF
    images. Page and bounding-box geometry is retained so a real crop renderer can replace
    the fixture renderer.
