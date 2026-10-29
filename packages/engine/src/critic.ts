/**
 * Critic (§04): checks every finding for resolvable evidence, a valid rule
 * reference, contradictions and neutral wording. Drops or downgrades failing
 * findings. Sends work back to Cross-check once, then routes to a human.
 * Also computes explainability coverage as a headline metric — findings with
 * full evidence and a rule that survived the Critic.
 *
 * Evidence is the domain discriminated union (§06): fact_ref, crop_ref or
 * absence_receipt. An absence receipt is the ONLY evidence form allowed on a
 * finding whose cited fact does not exist — it is restricted to
 * completeness_gap findings produced by a rule that guards a checklist item,
 * and the Critic validates the receipt against the checklist definition and
 * the documents actually filed in that slot for this application.
 */
import type { Fact, Finding, Rule } from "@evidencegraph/domain";
import { CHECKLIST_VERSION, EvidenceRef, Finding as FindingSchema } from "@evidencegraph/domain";
import { containsBannedWord } from "./wording.js";

export type CriticVerdict =
  | { decision: "keep" }
  | { decision: "drop"; reason: string }
  | { decision: "downgrade"; reason: string; severity: "low" }
  | { decision: "send_back"; reason: string };

/** Checklist definition shared with the Critic: slot → expected doc types. */
export type ChecklistDef = {
  version: string;
  slots: Map<string, readonly string[]>; // slot name → expected doc types
};

export type CriticContext = {
  facts: Map<string, Fact>; // all facts incl. superseded, by id
  knownRuleIds: Set<string>;
  /** Published versions by rule id, when the caller has the complete rule pack. */
  knownRuleVersions?: Map<string, readonly number[]>;
  /** checklist definition — required to validate absence receipts */
  checklist?: ChecklistDef;
  /** documents filed, keyed `${applicationId}|${slot}` → doc types present */
  documentsByAppSlot?: Map<string, readonly string[]>;
  /** Stored crop objects available at this boundary; omitted only by small unit fixtures. */
  cropKeys?: Set<string>;
  /** Rules that may mint absence receipts, including the slot they guard. */
  presenceRules?: Map<string, Pick<Rule, "checklistItem">>;
};

/** Live fact lookup used by every evidence check. */
function liveFact(ctx: CriticContext, factId: string): Fact | undefined {
  if (!factId || factId === "none") return undefined; // legacy unresolved pointer
  const f = ctx.facts.get(factId);
  return f && !f.supersededBy ? f : undefined;
}

function appSlotKey(finding: Finding, slot: string): string {
  return `${finding.applicationId}|${slot}`;
}

/** Validate one absence receipt against the checklist + filed documents. */
function validateReceipt(finding: Finding, receipt: { checklist_slot: string; expected_doc_type: string; checklist_version: string }, ctx: CriticContext): string | null {
  if (finding.findingClass !== "completeness_gap") {
    return `absence receipt is only valid evidence for completeness_gap findings (this is ${finding.findingClass})`;
  }
  const ruleId = finding.createdBy.startsWith("rule:") ? finding.createdBy.slice("rule:".length) : "";
  const presenceRule = ctx.presenceRules?.get(ruleId);
  if (!presenceRule?.checklistItem) {
    return `absence receipt requires a known presence rule with a checklist item (finding cites ${ruleId || "no rule"})`;
  }
  if (presenceRule.checklistItem.slot !== receipt.checklist_slot || presenceRule.checklistItem.docType !== receipt.expected_doc_type) {
    return `absence receipt does not match the checklist item guarded by presence rule ${ruleId}`;
  }
  const cl = ctx.checklist;
  if (!cl || !ctx.documentsByAppSlot) {
    // Fail closed: without the checklist definition the receipt is unverifiable.
    return "absence receipt cannot be validated (no checklist provided to the Critic)";
  }
  if (receipt.checklist_version !== cl.version) {
    return `absence receipt cites unknown checklist version ${receipt.checklist_version} (expected ${cl.version})`;
  }
  const expected = cl.slots.get(receipt.checklist_slot);
  if (!expected) {
    return `absence receipt cites slot ${receipt.checklist_slot} which does not exist in checklist ${cl.version}`;
  }
  if (!expected.includes(receipt.expected_doc_type)) {
    return `absence receipt claims ${receipt.expected_doc_type} is expected in slot ${receipt.checklist_slot}, checklist ${cl.version} disagrees`;
  }
  const filed = ctx.documentsByAppSlot.get(appSlotKey(finding, receipt.checklist_slot)) ?? [];
  // The receipt asserts the required ITEM is missing, not that the slot is
  // empty: other document types legitimately file into the same slot (e.g. a
  // trust registration beside a missing trust affidavit). The Critic checks
  // that no document OF THE EXPECTED TYPE is filed there.
  if (filed.includes(receipt.expected_doc_type)) {
    return `absence receipt claims ${receipt.expected_doc_type} was not filed, but documents of that type are filed in ${receipt.checklist_slot} (${filed.filter((d) => d === receipt.expected_doc_type).join(", ")})`;
  }
  return null;
}

export function critique(finding: Finding, ctx: CriticContext): CriticVerdict {
  const parsedFinding = FindingSchema.safeParse(finding);
  if (!parsedFinding.success) return { decision: "drop", reason: `finding failed schema validation: ${parsedFinding.error.issues[0]?.message ?? "invalid finding"}` };
  finding = parsedFinding.data;
  for (const evidence of finding.evidence) {
    const parsedEvidence = EvidenceRef.safeParse(evidence);
    if (!parsedEvidence.success) return { decision: "drop", reason: `evidence failed schema validation: ${parsedEvidence.error.issues[0]?.message ?? "invalid evidence"}` };
  }
  /* 1. wording guard */
  const wordHit = containsBannedWord(finding.summary);
  if (wordHit) return { decision: "drop", reason: `banned wording "${wordHit.word}" in summary` };

  /* 2. rule reference must exist */
  if (finding.createdBy.startsWith("rule:") && !ctx.knownRuleIds.has(finding.ruleId)) {
    return { decision: "drop", reason: `rule ${finding.ruleId} v${finding.ruleVersion} does not exist` };
  }
  if (finding.createdBy.startsWith("rule:") && ctx.knownRuleVersions && !ctx.knownRuleVersions.get(finding.ruleId)?.includes(finding.ruleVersion)) {
    return { decision: "drop", reason: `unknown rule version ${finding.ruleId} v${finding.ruleVersion}` };
  }

  /* 3. evidence must resolve. Fact/crop pointers need at least one live fact;
   * receipts are validated slot-by-slot. Receipts may only back presence gaps. */
  const resolved: Fact[] = [];
  let resolvedCropCount = 0;
  const receipts: Finding["evidence"] = [];
  const unresolvedPointers: string[] = [];
  for (const e of finding.evidence) {
    if (e.kind === "absence_receipt") {
      receipts.push(e);
      continue;
    }
    if (e.kind === "fact_ref" && (!e.factId || e.factId === "none")) {
      unresolvedPointers.push('fact_ref "none"');
      continue;
    }
    const fact = e.factId ? liveFact(ctx, e.factId) : undefined;
    const cropResolves = Boolean(e.cropKey) && (!ctx.cropKeys || ctx.cropKeys.has(e.cropKey!));
    const visualNeedsCrop = e.page != null || e.bbox != null;
    const visualResolves = !visualNeedsCrop || cropResolves;
    if (e.factId && !fact) unresolvedPointers.push(`fact ${e.factId}`);
    if (e.cropKey && !cropResolves) unresolvedPointers.push(`crop ${e.cropKey}`);
    if (visualNeedsCrop && !e.cropKey) unresolvedPointers.push(`visual evidence for ${e.factId ?? "crop"} has no stored crop`);
    if (e.kind === "fact_ref") {
      if (fact && visualResolves && (!e.cropKey || cropResolves)) resolved.push(fact);
    } else if (e.factId && !fact) {
      // A crop ref that names a fact must resolve both pointers.
    } else if (cropResolves && visualResolves) {
      resolvedCropCount += 1;
    }
  }
  for (const r of receipts) {
    if (r.kind !== "absence_receipt") continue;
    const bad = validateReceipt(finding, r, ctx);
    if (bad) return { decision: "drop", reason: bad };
  }
  if (receipts.length > 0) {
    // A presence gap may be receipt-only. Any fact pointer alongside a receipt
    // must also resolve, otherwise the mixture is unresolvable.
    if (resolved.length === 0 && resolvedCropCount === 0 && unresolvedPointers.length > 0) {
      return { decision: "drop", reason: `unresolvable evidence beside absence receipt: ${unresolvedPointers.join(", ")}` };
    }
  } else if (resolved.length === 0 && resolvedCropCount === 0 && finding.evidence.length > 0) {
    return { decision: "drop", reason: `no evidence pointer resolves to a stored live fact or crop${unresolvedPointers.length ? `: ${unresolvedPointers.join(", ")}` : ""}` };
  }

  /* 4. a finding that cites a page/bbox must have a crop (stored evidence crop) */
  const visualEvidence = finding.evidence.filter(
    (e): e is Exclude<typeof e, { kind: "absence_receipt" }> =>
      e.kind !== "absence_receipt" && (e.bbox != null || e.page != null),
  );
  if (visualEvidence.length > 0 && visualEvidence.every((e) => !e.cropKey || (ctx.cropKeys && !ctx.cropKeys.has(e.cropKey)))) {
    return {
      decision: "drop",
      reason: "visual evidence does not resolve to a stored crop",
    };
  }

  /* 5. quarantined facts may not back findings */
  if (resolved.length > 0 && resolved.every((f) => f.quarantine)) {
    return { decision: "drop", reason: "evidence is quarantined at the confidence gate" };
  }

  return { decision: "keep" };
}

export type CriticRun = {
  kept: Finding[];
  dropped: Array<{ finding: Finding; reason: string }>;
  downgraded: Array<{ finding: Finding; reason: string }>;
  sentBackOnce: boolean;
  /** Findings returned to Cross-check on the first contradiction pass. */
  sentBack: Array<{ finding: Finding; reason: string }>;
};

/** Full pass over a findings list. On the first pass (default) a
 * contradiction sends the work back to Cross-check once; on the re-run the
 * same contradiction is removed from the automated report and routed to a
 * human review queue via onDroppedToHuman (architecture §04: "sends work
 * back once, then escalates to a human"). */
export function critiqueAll(
  findings: Finding[],
  ctx: CriticContext,
  opts: {
    onDroppedToHuman?: (finding: Finding, reason: string) => void;
    /** false when re-running after the first send-back (default true). */
    allowSendBack?: boolean;
    /** finding ids already sent back once in this session — a repeat routes to a human. */
    sentBackAlready?: Set<string>;
  } = {},
): CriticRun {
  const kept: Finding[] = [];
  const dropped: CriticRun["dropped"] = [];
  const downgraded: CriticRun["downgraded"] = [];
  const sentBack: CriticRun["dropped"] = [];
  for (const f of findings) {
    const v = critique(f, ctx);
    if (v.decision === "keep") {
      kept.push(pruneUnresolvable(f, ctx));
    } else if (v.decision === "downgrade") {
      downgraded.push({ finding: { ...f, severity: v.severity, detail: `${f.detail ?? ""}\nCritic: ${v.reason}`.trim() }, reason: v.reason });
      kept.push({ ...pruneUnresolvable(f, ctx), severity: v.severity, detail: `${f.detail ?? ""}\nCritic: ${v.reason}`.trim() });
    } else {
      dropped.push({ finding: f, reason: v.reason });
      opts.onDroppedToHuman?.(f, v.reason);
    }
  }
  /* Contradiction leg: kept findings that violate contradictingPair are sent
   * back once — then, on the re-run, routed to a human. Deterministic: the
   * later-created (id-tiebroken) finding of the pair is the one returned. */
  if (opts.allowSendBack !== false) {
    const conflicted = new Map<string, string>(); // finding id → reason
    for (let i = 0; i < kept.length; i++) {
      for (let j = i + 1; j < kept.length; j++) {
        if (!contradictingPair(kept[i] as Finding, kept[j] as Finding)) continue;
        const first = kept[i] as Finding;
        const second = kept[j] as Finding;
        const loser = [first, second].sort((x, y) => (x.createdAt === y.createdAt ? x.id.localeCompare(y.id) : (x.createdAt < y.createdAt ? -1 : 1)))[1] as Finding;
        conflicted.set(loser.id, `contradicts ${loser === first ? second.id : first.id} on shared evidence`);
      }
    }
    for (const f of kept.slice()) {
      const reason = conflicted.get(f.id);
      if (!reason) continue;
      if (opts.sentBackAlready?.has(f.id)) {
        dropped.push({ finding: f, reason });
        opts.onDroppedToHuman?.(f, reason);
      } else {
        sentBack.push({ finding: f, reason });
      }
      kept.splice(kept.indexOf(f), 1);
    }
  }
  return { kept, dropped, downgraded, sentBackOnce: sentBack.length > 0, sentBack };
}

/** Keep only evidence that actually resolved (§04: list only resolvable evidence). */
function pruneUnresolvable(f: Finding, ctx: CriticContext): Finding {
  const ev = f.evidence.filter((e) => {
    if (e.kind === "absence_receipt") return validateReceipt(f, e, ctx) === null;
    const factResolves = !e.factId || liveFact(ctx, e.factId) !== undefined;
    const cropResolves = !e.cropKey || !ctx.cropKeys || ctx.cropKeys.has(e.cropKey);
    const visualHasCrop = (e.page == null && e.bbox == null) || Boolean(e.cropKey && cropResolves);
    return factResolves && cropResolves && visualHasCrop;
  });
  return ev.length === f.evidence.length ? f : { ...f, evidence: ev };
}

/** Explainability coverage (§17): kept findings with full evidence + a rule. */
export function explainabilityCoverage(kept: Finding[]): number {
  if (kept.length === 0) return 1;
  const good = kept.filter((f) => f.evidence.length > 0 && f.ruleId != null && f.aphRef != null).length;
  return good / kept.length;
}

/** Shared-fact contradiction check used by the Critic's "contradictions" leg.
 * Two findings on the same live fact contradict when one is accepted and the
 * other is still open (post-review inconsistency). Advisory layering
 * (anomaly_signal next to potential_discrepancy on the same fact) is not a
 * contradiction — signals can coexist with open findings. */
export function contradictingPair(a: Finding, b: Finding): boolean {
  const fa = a.evidence.map((e) => (e.kind === "absence_receipt" ? null : e.factId)).filter((x): x is string => Boolean(x));
  const fb = b.evidence.map((e) => (e.kind === "absence_receipt" ? null : e.factId)).filter((x): x is string => Boolean(x));
  const shared = fa.some((x) => fb.includes(x));
  if (!shared) return false;
  // Advisory layering is not a contradiction.
  if (
    (a.findingClass === "anomaly_signal" && b.findingClass === "potential_discrepancy") ||
    (a.findingClass === "potential_discrepancy" && b.findingClass === "anomaly_signal")
  ) {
    return false;
  }
  // Post-review: an accepted finding alongside one still open on the same
  // evidence means either acceptance was wrong or the other must be cleared.
  if ((a.status === "accepted" && b.status === "open") || (b.status === "accepted" && a.status === "open")) return true;
  return false;
}
