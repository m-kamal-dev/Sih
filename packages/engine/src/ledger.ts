/**
 * Hash-chained audit ledger (§06/§12): hash = sha256(prev_hash || canonical(row)).
 * Tampering with any row genuinely breaks verification from that row onward.
 */
import { createHash, createHmac } from "node:crypto";
import type { AuditRow } from "@evidencegraph/domain";

/** Deterministic canonical JSON (sorted keys, no whitespace). */
export function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`).join(",")}}`;
}

export function rowHash(prevHash: string, row: Omit<AuditRow, "hash" | "prevHash" | "seq"> & { seq: number; prevHash?: string }): string {
  const canonicalRow = canonical({ ...row, prevHash });
  return createHash("sha256").update(prevHash + "|" + canonicalRow).digest("hex");
}

export const GENESIS_HASH = "0".repeat(64);

/** Append a row to the chain. Mutates `rows` in place and returns the new row. */
export function appendRow(
  rows: AuditRow[],
  input: { at: string; actor: string; action: string; entity: string; entityId: string; payload: Record<string, unknown> },
): AuditRow {
  const seq = (rows[rows.length - 1]?.seq ?? 0) + 1;
  const prevHash = rows[rows.length - 1]?.hash ?? GENESIS_HASH;
  const partial = { at: input.at, actor: input.actor, action: input.action, entity: input.entity, entityId: input.entityId, payload: input.payload };
  const hash = rowHash(prevHash, { seq, ...partial });
  const row: AuditRow = { seq, ...partial, prevHash, hash };
  rows.push(row);
  return row;
}

export type VerifyResult = { ok: boolean; brokenAt: number | null; checked: number };

/** Verify the whole chain; returns the first broken row (1-based seq) or null. */
export function verifyChain(rows: AuditRow[]): VerifyResult {
  let prev = GENESIS_HASH;
  for (const row of rows) {
    const expectedPrev = prev;
    const { hash: _storedHash, prevHash: _storedPrev, ...rest } = row;
    void _storedHash;
    void _storedPrev;
    const expectedHash = rowHash(expectedPrev, rest);
    if (row.prevHash !== expectedPrev || row.hash !== expectedHash) {
      return { ok: false, brokenAt: row.seq, checked: row.seq };
    }
    prev = row.hash;
  }
  return { ok: true, brokenAt: null, checked: rows.length };
}

/**
 * Demo-only tamper: rewrite one row's payload in place, leaving its stored hash
 * (and every later hash) stale. Used by the /ledger "tamper one row" action.
 */
export function tamperRow(rows: AuditRow[], seq: number, patch: Record<string, unknown>): AuditRow {
  const row = rows.find((r) => r.seq === seq);
  if (!row) throw new Error(`no ledger row with seq ${seq}`);
  const payload = row.payload as Record<string, unknown>;
  Object.assign(payload, patch);
  return row;
}

/* ---------------- Signed daily digest (demo key) ---------------- */

/** Demo signing key. Documented as such in the UI and README. */
const DEMO_DIGEST_KEY = "evidencegraph-demo-digest-key";

export function signDigest(headHash: string, day: string): string {
  return createHmac("sha256", DEMO_DIGEST_KEY).update(`${day}|${headHash}`).digest("hex");
}

export function dailyDigest(rows: AuditRow[]): { day: string; headHash: string; signature: string } {
  const last = rows[rows.length - 1];
  const headHash = last?.hash ?? GENESIS_HASH;
  const day = last ? last.at.slice(0, 10) : new Date().toISOString().slice(0, 10);
  return { day, headHash, signature: signDigest(headHash, day) };
}
