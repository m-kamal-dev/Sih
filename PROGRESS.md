# PROGRESS  (resume with: "continue from PROGRESS.md")

Gate commands (pnpm.exe is blocked by Windows App Control on this machine, so use node):
`node scripts/verify.mjs typecheck typecheck-engine typecheck-fixtures typecheck-web lint "unit tests" "contrast check" "wording gate" "production build" "bundle budget"`

- [x] 0. Typecheck/lint/test green; removed deprecated `baseUrl` (tsconfig editor error)
- [x] 1. AI provider interface (packages/engine/src/aiprovider.ts), Ollama hosted default, Anthropic and other providers removed, verbatim grounding + verdict rejection in reader, status pill, .env.example
- [x] 2. Four named demo officers; officer + model in every ledger entry; shown in ledger + decision ("demo identity")
- [x] 3. Design system (Iris tokens, dark-first, glass), Motion only (LazyMotion), Reduce effects + prefers-reduced-motion
- [x] 4. Landing "/" (canvas hero, story, scan demo, real counters, guardrails, CTA)
- [x] 5. /analyze restyle, queue + case overview restyle
- [x] 6. Command palette (Ctrl+K), plain-language copy, tooltips on terms
- [x] 7. Judge Mode (offline 3-minute guided demo + Reset)
- [x] 8. /apply flow (checklist from rule pack, refs pending; per-file forensics + reader; one summary)
- [x] Proof: e2e/smoke.spec.ts (all routes + Apply + Live Check; console/page errors, failed requests, axe any impact). 38/38 e2e pass on prod build, rules-only mode
- [ ] Not run: cloud-mode e2e (no OLLAMA_API_KEY in .env.local)

## Round 2 (colour + polish)
- [x] Saffron default theme + live colour picker (Saffron, Aurora, Jade, Mono), light + dark
- [x] Contrast checker rewritten: the old one never checked text tokens (destructuring bug); now checks 8 palettes, button text 4.5:1
- [x] Fixed: Decision history started empty (genesis rows were dropped); test added
- [x] Plain language: rule titles + "APH reference pending", ledger action labels, document/fact labels, metric units
- [x] Polish: ambient accent glow, card highlights, button sheen, unified page headers
- [x] e2e: 38/38 on production build (E2E_BASE_URL lets it run on another port)

## Round 3 (deployability)
- [x] Rule pack embedded in the engine (scripts/embed-rules.mjs); drift test keeps it equal to rules/ on disk
- [x] Simulated serverless (rules/ folder hidden): 25 routes + APIs, 0 failures
- [x] Removed dangerouslyAllowAllBuilds (pnpm 10 refused to install with it); lockfile verified with pnpm 10 --frozen-lockfile
- [ ] Not verified: an actual Vercel/Render deploy (needs your account)
