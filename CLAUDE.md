# EvidenceGraph: working rules

SIH26261 (AICTE): AI-Powered Application Validation, Document Authentication and Regulatory
Compliance Verification. pnpm monorepo: apps/web (Next.js), packages/domain, engine, fixtures;
rules/; docs/; scripts/; apps/web/e2e. Windows + PowerShell, Node 24, pnpm.

Resume with: "continue from PROGRESS.md".

## HARD RULES
- Never disable or loosen a check: no ts-ignore, no eslint-disable, no `any`, no weakened tests,
  budgets or contrast rules. Fix root causes.
- Findings are SIGNALS, never verdicts. Never use the words forged / fake / fraud in UI or source.
  AI reads, explains, drafts and proposes; the deterministic engine sets signals; a human decides.
- Never invent AICTE APH clause numbers, statistics or citations. Mark unconfirmed references
  "pending".
- No secrets in committed files. Keys live only in apps/web/.env.local.
- Windows-safe scripts only. Never claim a pass you did not see; paste real command output.
- Keep working pieces: engine pdfforensics.ts, aireview.ts, YAML rule engine, hash-chained ledger,
  confidence gate, sample-PDF generator, /analyze Live Check and its API routes.
- Do not raise the bundle budget (scripts/check-bundles.mjs). Ask first if it blocks.

## Process
- One phase at a time, then stop and report. Update PROGRESS.md after every step.
- Gates: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm check:contrast`, `pnpm check:wording`,
  `pnpm build`, `node scripts/check-bundles.mjs`.
