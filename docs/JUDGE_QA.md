# Judge Q&A — SIH26261 (AICTE): the hard questions, answered with where to see it

Each answer names what is real, what is simulated and where a judge can check it in
under a minute. Nothing here relies on a claim the prototype cannot show.

## 1. "Is any of this real, or is it a slideshow with fixtures?"

Two layers, both visible.

- **Live Check (`/analyze`)** is real on any PDF. Drop a file from your own laptop.
  The server reads the bytes and reports the SHA-256, the revision history, the signed
  byte ranges with the digest recomputed, hidden text, instruction-style text, active
  content and validity dates. Six generated sample PDFs reproduce the cases below.
- **The case workspace** runs real deterministic code (rule engine, cross-check,
  Critic, confidence gate, triage, hash-chained ledger) over a synthetic dataset of
  12 institutions with 13 planted faults and 5 clean controls. `docs/FAULT_MATRIX.md`
  lists every fault and the test that proves it is caught.

What is simulated is stated in the README table and in `docs/KNOWN_LIMITATIONS.md`:
OCR and vision output, issuer registry responses (every one marked `isMock`), Neo4j and
Qdrant (in-memory equivalents).

## 2. "Can you detect a document that was changed after it was signed?"

Yes, and you can test it. Run **Signed, then edited** in Live Check. One date digit was
overwritten inside a signed file. The check recomputes the SHA-256 of the two signed byte
ranges and compares it with the digest stored in the signature. They differ, so a strong
signal is raised with the byte ranges as evidence. Run **Signed, untouched** to see the
same file pass.

Honest limit: certificate chain, revocation and timestamp trust are not validated.
That is listed on the result page under "Not verified by this check".

## 3. "Does an AI model decide who gets approved?"

No. Findings come from YAML rules with a safe expression evaluator, cross-document
matching and typed signals. A person records every decision. The Critic blocks any
finding that lacks evidence, a rule version or a source citation. Models, where used in
a production path, would only read pages into candidate fields that pass a confidence
gate; they never classify or decide.

## 4. "What stops a malicious PDF from instructing your system to approve it?"

Document text is data, never instructions. Run **Hidden instruction text** in Live Check:
the file contains invisible text addressed to an automated reader. The check marks the
hidden run, raises a signal, and changes nothing else. In the workspace, fault 12 shows
the same: disabling the instruction leaves all other findings unchanged.

## 5. "Do you call a document forged?"

No. The vocabulary is fixed: completeness gap, validity gap, potential discrepancy,
anomaly signal, confirmed violation (human only). A repo gate (`pnpm check:wording`)
fails the build if banned wording reaches the UI, fixtures, rules or letters. Weak
signals alone never raise the overall level above low (spec §10).

## 6. "Why trust the evidence? Show me where a finding comes from."

Open any finding in the workspace. It links to the page, the cropped region and the
extracted fact, plus the rule id, version and APH reference. A finding with no evidence
cannot be created; the Critic rejects it. Absence is also evidence: a missing document
produces a typed receipt naming the checklist slot and version.

## 7. "What happens when an issuer system is down?"

Fault 13. The connector retries three times with 250 ms and 500 ms delays, opens a
circuit breaker, records `source_unavailable` and queues a manual request. The officer
sees the state; the application is never silently passed or failed.

## 8. "How do you stop bad OCR from creating false accusations?"

The confidence gate. Low-confidence values are quarantined, not compared. Fault 11:
a blurred faculty count never produces a mismatch; the officer confirms the crop value,
the correction is superseded in the ledger and triage updates.

## 9. "Can an officer or admin quietly rewrite history?"

The ledger is a SHA-256 hash chain. In the Ledger view, tamper with one row and the
chain shows the first broken sequence number; verify restores it. Rule changes need a
second approver and replay against last session's applications with a change summary.

## 10. "Is it safe for institutions to use?"

The applicant role sees only a fix list. Forensic detail, triage score and other
institutions' data return 403 for that role, including on the Live Check endpoint.
Live uploads are processed in memory and not stored. Role checks are header-based in
this prototype; production replaces them with an identity provider.

## 11. "Why does the queue show that score?"

It orders work and nothing else. The overview page lists the findings behind the score
and states that it is not a verdict. A clean case still goes through issuer verification
and officer review.

## 12. "Some APH clauses say `[fill in]`. Isn't that unfinished?"

It is deliberate. The team has not confirmed those clause numbers against the handbook,
and the prototype will not invent a citation. The rule and its checklist item are real;
only the clause number is pending.

## 13. "What would it take to run this at AICTE?"

Replace the in-memory store with a database, the header roles with the organisation's
identity provider, the fixture OCR with a vision pipeline behind the confidence gate,
and the mock connectors with the issuer APIs. The rule pack, Critic, ledger and Live
Check engine are already framework-free packages (`packages/engine`) that carry over
unchanged. Out of scope today: multi-instance concurrency, real issuer endpoints, signer
certificate validation.

## 14. Fast verification for the room

| Claim | Where to see it | Time |
|---|---|---|
| Real forensics on any PDF | `/analyze`, drop your own file | 30 s |
| Post-signature edit detected | `/analyze` → Signed, then edited | 15 s |
| Revision diff | `/analyze` → Edited after creation | 15 s |
| Injection ignored | `/analyze` → Hidden instruction text | 15 s |
| Evidence-linked finding | `/applications/EOA-2026-0142/evidence` | 30 s |
| Hash chain tamper | `/ledger` → tamper, then verify | 30 s |
| Recall and precision against the planted-fault list | `/metrics` (computed from the runs, not typed in) | 15 s |
| Every planted fault matched to its expected outcome | `pnpm test` → fault matrix test (`docs/FAULT_MATRIX.md`) | 20 s |
