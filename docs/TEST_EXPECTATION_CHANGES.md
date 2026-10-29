# Test expectation changes

| Test | Old expectation | New expectation | Specification basis |
|---|---|---|---|
| `packages/fixtures/src/dataset.test.ts`: fault 4 reused-FDR finding on `EOA-2026-0117` and `NEW-2026-0031` | `anomaly_signal` | `potential_discrepancy` | Architecture §09 classifies a reused FDR pledged by two institutions as `potential_discrepancy`; the demo fault table in §16 repeats that class. The rule now uses that class, and both member applications retain the counterpart link and paired fact evidence. |

No other existing expected outcomes have been changed.
