# Judge-review pass: what was found and what changed

A hostile-judge read of the prototype against the problem statement (SIH26261, AICTE:
application validation, document authentication, regulatory compliance verification).

| # | Rejection risk a judge would raise | Fix |
|---|---|---|
| 1 | "Everything is fixture data; nothing works on a real document." | New **Live Document Check** (`/analyze`, `POST /api/forensics/analyze`): real SHA-256, revision history with text diff, signed-range digest recomputation, hidden text, instruction-style text, active content, validity dates. Six generated real PDFs to demo and download. 15 new unit tests and 5 API contract tests. |
| 2 | Queue and overview printed "2 potential discrepancypotential discrepancies". | Plural phrase builder in `triage.ts` no longer double-prints the noun. |
| 3 | Triage bar colours were inverted (a low score red, a high score blue). | `ConfidenceBar` has a `risk` mode: high is red, middle amber, low green. Used for triage in queue and overview. |
| 4 | Overview said "application appears compliant" when no findings were open, which contradicts the no-verdict principle. | Now: no open findings from the checks that ran; this does not replace issuer verification and officer review. |
| 5 | Overview was thin and a chip tried to look up strengths by class (always empty). | Overview now has a case-at-a-glance row (documents, findings, conflicts, issuer checks), plain-language category names, the top three findings with their APH reference, and a note that the score orders work and is not a verdict. |
| 6 | No single page answering the judge's likely questions. | `docs/JUDGE_QA.md` with where to see each answer in under a minute. |
| 7 | Docs did not mention the new capability. | README, API, KNOWN_LIMITATIONS and DEMO_SCRIPT updated, including what the live check does not verify. |
| 8 | New route had no accessibility coverage. | `/analyze` added to the axe sweep. |

Not changed on purpose: APH clause numbers marked `[fill in]` (unconfirmed, so not invented).

## Verification status of this pass

Run in an offline sandbox without `pnpm install`: all 117 package tests pass (102 existing
plus 15 new) using stand-ins for `zod`, `vitest` and `yaml`; wording, PII and contrast
gates pass. The Next.js app, the API contract tests, `next build`, lint and Playwright could
not be run there. Run `pnpm install && pnpm verify` once before presenting.
