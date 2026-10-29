# EvidenceGraph rule pack guide

The demo rule pack lives in [`rules/aph-2024-27/`](../rules/aph-2024-27) and is loaded by
[`packages/engine/src/rules.ts`](../packages/engine/src/rules.ts) with `loadRulePack(dir)`.
One YAML file per rule. Rules are data: the engine never special-cases a rule id.

## YAML format (spec §08)

```yaml
id: <unique snake_case id>
version: 1                      # increment to create a new rule version
aph_ref: "[fill in: APH …]"     # keep [fill in] until the clause is confirmed (see below)
applies_to:
  categories: [EOA, INTAKE_INCREASE, NEW_PROGRAMME]
  sessions: ["2026-27"]
inputs:                         # one entry per fact the expression reads
  - fact: faculty.form_count
    min_confidence: 0.90        # optional; see "Confidence convention"
assert: num(a) == num(b)        # safe expression language (see expr.ts)
on_fail:
  class: potential_discrepancy   # see finding class list (spec §02)
  severity: medium
  message: 'Form states {faculty.form_count}; roster states {faculty.roster_count}.'
on_insufficient_evidence:       # optional; exercised when an input is held by the gate
  route: field_review
  message: '…'
tests:                          # REQUIRED — build fails when empty (rules.ts loader)
  - name: counts agree
    facts: { "faculty.form_count": "123", "faculty.roster_count": "123" }
    expect: pass                # one of: pass | fail | insufficient_evidence
```

Five rule types are supported (spec §08): `presence`, `validity`, `threshold`,
cross-document **equality with tolerance** (equality plus an optional `tolerance` on
`on_fail` or inline in `assert`), and **temporal consistency**. `applies_to` scopes the
rule to categories and sessions; at runtime only facts in scope reach the rule.

## Confidence convention

**A rule test sets a fact's reading confidence with a companion fact key
`<fact_key>_confidence`, e.g. `faculty.roster_count_confidence: "0.62"`.** Test-runner
input marshalling reads that companion and applies it to the named fact. Nothing else
reads it; `runRuleTests` never hard-codes a confidence and never mutates the rule or test
objects, so running the full pack twice in one process yields identical results (tested in
`packages/engine/src/rules.test.ts`, "runRuleTests is pure").

Thresholds themselves are **not** set per rule. They come from one central config,
`CONFIDENCE_THRESHOLDS` in [`packages/engine/src/confidence.ts`](../packages/engine/src/confidence.ts)
keyed by field kind (`identifier` is stricter than `name`, etc., spec §06). Every rule
input that declares `min_confidence` must be **at or above** the central threshold for its
fact's field kind; `parseRuleYaml` throws at load time when an input is looser, which
fails the build (test: "a rule input below the central threshold fails the build"). The
guard test "rule inputs never relax the central per-field-type confidence thresholds" also
checks every shipped rule.

At runtime a fact below threshold is **held** by the confidence gate: it produces
`insufficient_evidence` for the reading rule plus a gate interrupt for the officer. A
human correction (`applyCorrection`) writes a new fact version with `source: "human"`,
marks the original `supersededBy`, and dependent findings recompute. `pending` is never
used for this path.

## Adding a rule

1. Create `rules/aph-2024-27/<rule_id>.yaml` in the format above. `aph_ref` must keep
   `[fill in: …]` until someone with the notified document confirms the clause; set
   `clauseConfirmed: true` **and** a real clause number only after that confirmation.
2. Write at least one `tests:` entry per behavioural branch — pass, fail, and where
   applicable `insufficient_evidence` (use `<key>_confidence` when a test exercises a
   blurred value).
3. `pnpm test`: the loader enforces non-empty per-rule tests and throws
   `RuleLoadError` when a rule has none, and every rule's own tests run in CI.
4. Rules with empty `inputs`' `min_confidence` are fine; rules may omit `min_confidence`
   entirely and still be validated against the central config when they do provide it.

## Rules that still carry [fill in] clause markers

Per ground rules, no APH clause numbers were invented. All 9 shipped rules ship with
`aph_ref: "[fill in: …]"` and `clauseConfirmed: false`; `packages/engine/src/rules.test.ts`
asserts both. The [fill in] marker must be replaced with a confirmed clause reference
before the demo claims regulatory grounding they do not have.

| Rule | Type | Uses min_confidence inputs | aph_ref |
| --- | --- | --- | --- |
| `trust_affidavit_presence` | presence | 0.80 (≥ threshold) | [fill in] |
| `fire_noc_validity` | validity | 0.85/0.90/0.95 (≥ thresholds) | [fill in] |
| `bcc_validity` | validity | 0.85/0.95 | [fill in] |
| `land_area_form_vs_deed` | cross-doc equality | 0.85/0.85 | [fill in] |
| `faculty_count_form_vs_roster` | cross-doc equality | 0.90/0.90 | [fill in] |
| `fdr_endowment_threshold` | threshold | 0.95 | [fill in] |
| `degree_holder_matches_registry` | cross-doc equality | 0.90/0.90/0.95 | [fill in] |
| `fdr_single_pledge` | cross-doc equality | (none) | [fill in] |
| `ghost_faculty_cross_institution` | cross-institution pair | (none) | [fill in] |
