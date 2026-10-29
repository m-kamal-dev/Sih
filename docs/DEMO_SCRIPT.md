# DEMO_SCRIPT — six-minute presenter run (matches spec §16)

The `/demo` route exposes the presenter bar. Each chip puts the app in the exact state
for the beat — no manual clicking between steps. "Reset demo data" restores the seed.

| Chip | Beat | What the judge sees |
|---|---|---|
| 0:00 | Officer queue | `/queue` sorted by triage score; top row shows its top-3 reasons, SLA timer and open-item counts. |
| 0:45 | Self-check | Institution-view fix list: the missing trust affidavit and the expiring fire NOC, before submission — no forensic internals, no triage score. |
| 1:30 | Evidence split view | Land-area finding opens the deed on page 3; the bbox outline draws in and pulses; the fact row highlights. "No finding without evidence." |
| 2:30 | Graph + Cypher | Ghost-faculty finding: one person, two institutions, same session; the Cypher drawer runs the real §09 query on the fixture graph. |
| 3:20 | Confidence gate | The blurred faculty count modal; the officer confirms the crop value; the sharpened crop crossfades in; no mismatch finding ever appears; triage updates. |
| 4:00 | Prompt injection | The document with hidden instruction text; Doc reader treats text as data; only an `anomaly_signal` is raised; nothing else changes. |
| 4:40 | Rule replay | A threshold change in a new rule version re-runs last session's applications; diff summary "N changed · N new · N cleared". |
| 5:20 | Ledger + metrics | Hash chain table; "tamper one row" flips hashes red in a 40 ms cascade with "Chain broken at #n"; verify restores; metrics board computed from fixtures. |

## Optional beat: "is this real?" (60 seconds, not on the presenter bar)

Open **Live Check**. Run *Signed, then edited*: a strong signal appears because the digest recomputed from the signed byte ranges no longer matches the digest inside the signature. Run *Edited after creation*: the page shows the exact line that changed between file revisions (`31/03/2026` became `31/03/2029`). Then drag in any PDF from the judge's own laptop and read the result aloud, including the "Not verified by this check" list.

## Wording rules

UI copy never uses "forged", "fake" or "fraud" — anomaly signal, potential discrepancy,
needs verification. The Critic and the letter generator are guarded by a unit test, and a
repo scan fails the build if banned words appear in UI strings, fixtures or templates.
