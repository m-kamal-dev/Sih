# EvidenceGraph

EvidenceGraph is a synthetic prototype of an evidence-linked validation layer beside the AICTE approval portal. It demonstrates configurable rules, cross-application checks, source verification states, human review and an audit ledger. It does not connect to AICTE or external issuer services.

## Run locally

Requires Node.js 24 and pnpm 12.9.1 (the version in `package.json`). From the repository root:

```powershell
pnpm install
pnpm dev
```

To turn on the AI features (document reader, case brief, case Q&A), copy `apps/web/.env.example` to `apps/web/.env.local` and set `OLLAMA_API_KEY` (Ollama hosted API, the default provider; see the file for `OLLAMA_MODEL`, `OLLAMA_VISION_MODEL` and the optional local server). In cloud mode the visible text of uploaded documents is sent to ollama.com; hidden text never is, so use the synthetic sample PDFs for demos. Without a key everything still works in **Rules-only mode**.

Open `http://localhost:3100`. Use the **Demo role switch** in the header to change roles. The controls exercise the same role policy at the API boundary.

Useful checks:

```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm verify
```

Browser tests need Chromium once: `pnpm --filter web exec playwright install chromium`.

`pnpm verify` is the one-command gate: typecheck, lint, unit tests, contrast, PII and wording checks, production build with a bundle budget (≤ 150 kB first load JS per route), a 50 ms API p95 timing budget, and the Playwright e2e suite including a 14-route axe accessibility sweep.

Screenshots of every primary screen in both themes (1440×900) live in `docs/screenshots/`; regenerate them with `scripts/capture-screenshots.cjs` while a production server runs on port 3101.

The seed is deterministic and contains 12 fictional institutions: seven with planted scenarios and five clean controls. No real applicant data is used.

## Demo roles

| Role | What the prototype shows |
|---|---|
| Scrutiny officer | Queue, application evidence, decisions and confidence corrections |
| Senior reviewer | Escalations and release approval for draft letters |
| Rule administrator | Rule pack and rule test view |
| Auditor | Ledger, replay and metrics |
| Institution applicant | Own institution’s self-check list |

Demo roles are selected with a request header and are not an identity provider. Applicant access is pinned to a synthetic institution.

## Try it on a real file

Open **Live Check** in the sidebar (`/analyze`). Drop any PDF, or run one of six generated samples (each is a real PDF you can also download). The result lists signals with the evidence behind each one, what changed between file revisions, the signature ranges, the text layer with hidden text marked, and a plain list of what the check did **not** verify. It never says a document is genuine or not.

For a judge-style question list with answers and where to see each one, read [docs/JUDGE_QA.md](docs/JUDGE_QA.md).

## Real vs simulated

| Capability | Implementation in this prototype |
|---|---|
| Rule engine | Real deterministic YAML loading, safe expression evaluation, confidence routing and per-rule tests |
| Cross-check | Real deterministic matching and graph overlap on in-memory fixture data; Neo4j is not connected |
| Critic | Real schema, evidence, rule-version, wording and absence-receipt checks over the fixture store |
| Confidence gate | Real correction and supersession logic over in-memory facts; OCR confidence values are precomputed |
| Ledger | Real SHA-256 hash-chain verification and tamper detection; the daily demo digest uses a fixed demo key |
| Role checks | Real API policy checks for the five demo roles; there is no OIDC provider or production identity store |
| Live Document Check (`/analyze`) | **Real.** Any uploaded PDF is analysed from its own bytes: SHA-256, revision history with a text diff between revisions, signed-range digest recomputation, hidden text, instruction-style text, active content, validity dates. Nothing is stored. Six real sample PDFs are generated for demo and download |
| AI case copilot (case Overview tab) | **Real when `OLLAMA_API_KEY` is set (Ollama hosted API).** A plain-language brief (what matters, next steps, questions to ask the institution) and a Q&A box that answers from the case's findings and cites them. Cited ids are checked against the real findings, output with banned wording or verdict language is discarded, and a deterministic rules-based version runs when there is no key. The AI explains; it never changes a finding, decision or ledger entry |
| AI validation of document fields (`/analyze`) | Deterministic checks over what the AI read: reference number, issuing authority, institution, real calendar dates, expiry, date order, low-confidence fields. Produces a pass / review / not-found checklist |
| AI document reading (`/analyze`) | **Real when an AI key is set**: the uploaded PDF text (or the scanned PDF itself) is sent to a model that returns plain fields, with where each was found and how sure it is. Without a key a simple labelled demo reader runs instead. The AI only reads; rules and people decide |
| OCR and vision on the sample applications | Simulated with prepared extracted facts, page layouts and similarity results |
| Issuer connectors | Simulated registry responses behind the connector interface; every result is marked `isMock` |
| Neo4j and Qdrant | In-memory graph and similarity fixtures; Cypher is displayed as a read-only example |
| Page crops | Synthetic document page geometry and crop references; no original PDFs are stored |

APH clause references that the team has not confirmed remain marked `[fill in]` in the rules and UI.
