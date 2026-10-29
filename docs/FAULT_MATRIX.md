# Fault matrix results

The deterministic fixture test `FAULT_MATRIX matches every planted fault to its expected typed outcome` compares all 13 entries in `packages/fixtures/src/institutions.ts` with the assembled findings and verification results. Severity follows the matching YAML rule where the architecture does not name one; see [ASSUMPTIONS.md](./ASSUMPTIONS.md).

| # | Application(s) | Expected result | Fixture evidence |
|---|---|---|---|
| 1 | EOA-2026-0142 | PDF structure anomaly (medium) and fire NOC validity gap (high) | Incremental-save forensic signal; date-rule finding |
| 2 | EOA-2026-0142 | Land area potential discrepancy (high) | Form/deed fact pair |
| 3 | INTK-2026-0208, EOA-2026-0117 | Cross-institution faculty potential discrepancy (high) | Shared roster identity and overlapping session dates |
| 4 | EOA-2026-0117, NEW-2026-0031 | FDR single-pledge potential discrepancy (high) | Shared FDR hash; classification follows Architecture §09 |
| 5 | EOA-2026-0187, INTK-2026-0229 | Reused classroom photo anomaly (medium) | Shared image hash |
| 6 | INTK-2026-0208, NEW-2026-0031, NEW-2026-0058 | Reused affidavit seal anomaly (medium) | Shared stamp hash |
| 7 | INTK-2026-0229 | Trust affidavit completeness gap (high), present at intake | Typed absence receipt identifies checklist slot and version |
| 8 | NEW-2026-0058 | BCC validity gap (high) | Certificate validity date precedes session |
| 9 | INTK-2026-0208 | Verification mismatch | Mock NAD result differs from certificate holder |
| 10 | NEW-2026-0031 | Signed-PDF modification anomaly (high) | Bytes appended outside signed range |
| 11 | EOA-2026-0117 | Confidence gate; no false mismatch | Blurred roster count remains quarantined |
| 12 | NEW-2026-0058 | Prompt-injection anomaly (low) | Hidden instruction is detected; disabling it leaves other findings unchanged |
| 13 | NEW-2026-0058 | Fire source unavailable after retries; breaker open and manual request queued | Three attempts, 250/500 ms delays and `manual_queue` summary |

Clean controls cover name normalization, poor scan quality, a mismatched document slot, a mid-year faculty move, and an application without planted faults. The fixture tests assert the move is evaluated without reporting a faculty overlap and that controls do not acquire high-severity findings.
