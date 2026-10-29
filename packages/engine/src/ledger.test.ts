import { describe, expect, it } from "vitest";
import { appendRow, verifyChain, tamperRow, dailyDigest, canonical, GENESIS_HASH } from "./ledger.js";
import type { AuditRow } from "@evidencegraph/domain";

function makeLedger(n = 5): AuditRow[] {
  const rows: AuditRow[] = [];
  for (let i = 1; i <= n; i++) {
    appendRow(rows, {
      at: `2026-09-1${i}T10:00:00Z`,
      actor: "officer:demo",
      action: "decision.recorded",
      entity: "application",
      entityId: `INTK-2026-020${i}`,
      payload: { decision: "more_info", letterId: `ltr_${i}` },
    });
  }
  return rows;
}

describe("hash-chained audit ledger", () => {
  it("chains rows from genesis", () => {
    const rows = makeLedger(3);
    expect(rows[0]?.prevHash).toBe(GENESIS_HASH);
    expect(rows[1]?.prevHash).toBe(rows[0]?.hash);
    expect(verifyChain(rows)).toEqual({ ok: true, brokenAt: null, checked: 3 });
  });

  it("tampering one row breaks verification from that row onward", () => {
    const rows = makeLedger(5);
    tamperRow(rows, 3, { decision: "approved" }); // silent edit
    const res = verifyChain(rows);
    expect(res.ok).toBe(false);
    expect(res.brokenAt).toBe(3);
    // Undo: restoring the honest payload makes the chain verify again —
    // the demo "restore baseline" action re-appends, never rewrites history.
  });

  it("canonical JSON is stable and key-ordered", () => {
    expect(canonical({ b: 1, a: [true, null, "x"] })).toBe('{"a":[true,null,"x"],"b":1}');
    expect(canonical({ a: 1 })).toBe(canonical({ a: 1 }));
  });

  it("the daily head digest is deterministic for the same head", () => {
    const rows = makeLedger(2);
    expect(dailyDigest(rows)).toEqual(dailyDigest(rows));
  });

  it("empty ledger verifies trivially", () => {
    expect(verifyChain([])).toEqual({ ok: true, brokenAt: null, checked: 0 });
  });
});
