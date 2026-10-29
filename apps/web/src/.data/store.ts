/**
 * Singleton in-memory dataset store with atomic persistence, versioned caching,
 * and Server-Sent Events broadcasting.
 * Server-side only — never import from client components.
 */
import path from 'node:path';
import fs from 'node:fs';
import { assembleDataset, type Dataset } from '@evidencegraph/fixtures';
import { resolveAiProvider, loadRulePack, loadEmbeddedRulePack, verifyChain, dailyDigest, tamperRow, appendRow, applyCorrection as applyFactCorrection } from '@evidencegraph/engine';
import { computeMetrics, computeTriage } from '@evidencegraph/engine';
import { buildFactIndex, runRule, buildFinding } from '@evidencegraph/engine';
import type {
  ApplicationSummary,
  Institution,
  Document,
  Fact,
  Finding,
  VerificationAttempt,
  AuditRow,
  Rule,
  RunEvent,
  LetterDraft,
  MetricBoard,
  GraphNode,
  GraphEdge,
  GraphSubgraph,
} from '@evidencegraph/domain';
import { officerForActor } from '@evidencegraph/domain';
import type { ConflictRow } from '@evidencegraph/engine';

// ---- Typed Store Events (for Server-Sent Events) ----

export type StoreEvent =
  | { type: 'finding.updated'; payload: { appId: string; findingId: string; status: string; actor: string } }
  | { type: 'fact.corrected'; payload: { appId: string; factId: string; replacementFactId: string; correctedValue: string | number } }
  | { type: 'decision.recorded'; payload: { appId: string; findingId: string; action: string; actor: string } }
  | { type: 'ledger.appended'; payload: { seq: number; action: string; at: string } }
  | { type: 'verification.updated'; payload: { appId: string; attemptId: string; status: string } }
  | { type: 'letter.updated'; payload: { appId: string; updatedBy: string; at: string } }
  | { type: 'dataset.reset'; payload: { at: string } };

type Listener = (event: StoreEvent) => void;
const _listeners = new Set<Listener>();

export function subscribeToStoreEvents(listener: Listener): () => void {
  _listeners.add(listener);
  return () => {
    _listeners.delete(listener);
  };
}

export function broadcastStoreEvent(event: StoreEvent): void {
  for (const listener of _listeners) {
    try {
      listener(event);
    } catch {}
  }
}

// ---- Persistence with Atomic Writes & Mutex Queue ----

export type IdempotencyRecord =
  | { key: string; operation: string; fingerprint: string; kind: 'decision'; row: AuditRow }
  | { key: string; operation: string; fingerprint: string; kind: 'correction'; fact: Fact };

export class IdempotencyConflictError extends Error {
  constructor() {
    super('Idempotency-Key was already used with a different operation or payload.');
    this.name = 'IdempotencyConflictError';
  }
}

function findIdempotencyRecord(
  patch: StorePatch,
  key: string | undefined,
  operation: string,
  fingerprint: string,
): IdempotencyRecord | undefined {
  if (!key) return undefined;
  const record = patch.idempotency.find((entry) => entry.key === key && entry.operation === operation);
  if (record && record.fingerprint !== fingerprint) {
    throw new IdempotencyConflictError();
  }
  return record;
}

interface StorePatch {
  decisions: Array<{
    appId: string;
    findingId: string;
    action: string;
    actor: string;
    reason: string;
    at: string;
    seq?: number;
    model?: string | null;
  }>;
  corrections: Array<{
    factId: string;
    correctedValue: string | number;
    officer: string;
    at: string;
    seq?: number;
    model?: string | null;
  }>;
  tamperedRows: Array<{ seq: number; patch: Record<string, unknown> }>;
  letterUpdates: Array<{ appId: string; body: string; updatedBy: string; updatedAt: string; seq?: number; model?: string | null }>;
  letterReleases: Array<{ appId: string; releasedBy: string; releasedAt: string; seq?: number; model?: string | null }>;
  publishedRules: Rule[];
  rulePublishes: Array<{ ruleId: string; version: number; author: string; secondApprover: string; at: string; seq?: number; model?: string | null }>;
  idempotency: IdempotencyRecord[];
}

/** The AI model in use right now, recorded on every ledger entry (null in rules-only mode). */
function currentModel(): string | null {
  return resolveAiProvider(process.env)?.model ?? null;
}

/** Every ledger write goes through here so each row carries the acting demo officer and the model. */
function appendLedger(input: { at: string; actor: string; action: string; entity: string; entityId: string; payload: Record<string, unknown>; model: string | null }): AuditRow {
  return appendRow(_ledger!, { ...input, officer: officerForActor(input.actor)?.id ?? null });
}

function patchFilePath(): string {
  return path.join(process.cwd(), '.data', 'store.json');
}

function emptyPatch(): StorePatch {
  return { decisions: [], corrections: [], tamperedRows: [], letterUpdates: [], letterReleases: [], publishedRules: [], rulePublishes: [], idempotency: [] };
}

function loadPatch(): StorePatch {
  try {
    const fp = patchFilePath();
    if (fs.existsSync(fp)) {
      return JSON.parse(fs.readFileSync(fp, 'utf8')) as StorePatch;
    }
  } catch {
    // ignore corrupt file
  }
  return emptyPatch();
}

/** Synchronous atomic write (temp + rename) so replays and tests always see a
 * fully flushed file before the next read. */
function savePatch(p: StorePatch): void {
  try {
    const fp = patchFilePath();
    const dir = path.dirname(fp);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const tmpPath = `${fp}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(p, null, 2), 'utf8');
    fs.renameSync(tmpPath, fp);
  } catch {
    // non-fatal in demo
  }
}

// ---- Singleton & Versioned Derived-Data Cache ----

let _ds: Dataset | null = null;
let _ledger: AuditRow[] | null = null;
let _patch: StorePatch | null = null;
let _datasetVersion = 1;
let _cachedMetrics: { version: number; data: MetricBoard } | null = null;
let _cachedSummaries: { version: number; data: ApplicationSummary[] } | null = null;

export function getDatasetVersion(): number {
  return _datasetVersion;
}

/** Rules from disk when the rules/ folder is present (local edits apply live), otherwise the copy compiled into the engine. */
function loadRules(dir: string): ReturnType<typeof loadRulePack> {
  return fs.existsSync(dir) ? loadRulePack(dir) : loadEmbeddedRulePack();
}

function getRulesDir(): string {
  if (process.env['RULES_DIR']) {
    const custom = path.resolve(process.cwd(), process.env['RULES_DIR']);
    if (fs.existsSync(custom)) return custom;
  }
  // Candidate 1: root is cwd
  const rootCand = path.resolve(process.cwd(), 'rules', 'aph-2024-27');
  if (fs.existsSync(rootCand)) return rootCand;

  // Candidate 2: cwd is apps/web
  const monorepoCand = path.resolve(process.cwd(), '..', '..', 'rules', 'aph-2024-27');
  if (fs.existsSync(monorepoCand)) return monorepoCand;

  // Candidate 3: relative to this file
  const relativeCand = path.resolve(__dirname, '..', '..', '..', 'rules', 'aph-2024-27');
  if (fs.existsSync(relativeCand)) return relativeCand;

  return rootCand;
}

function getDatasetInternal(): Dataset {
  if (_ds) return _ds;

  _patch = loadPatch();
  const rulesDir = getRulesDir();
  const rules = _patch.publishedRules.length > 0 ? _patch.publishedRules : loadRules(rulesDir);
  _ds = assembleDataset(rules);
  // The ledger is reconstructed from the persisted mutation patch below. Keep
  // it as a live array before replaying mutations so appendRow can safely
  // rebuild the hash chain after a restart.
  _ledger = [];

  // Re-derive in-flight corrections inside the dataset so that a restarted process sees the
  // same facts that the in-process request returned. This makes cross-process idempotency
  // observable: the replayed correction is a no-op and does not append a second ledger row.
  if (_patch.idempotency && _patch.idempotency.length) {
    for (const record of _patch.idempotency) {
      if (record.kind === 'correction') {
        // Newer patches also carry a first-class correction mutation. Let the
        // normal mutation replay below rebuild both the fact and its ledger
        // row, avoiding a duplicate replacement fact.
        // A replacement fact id is always `<original id>_h1` (see applyCorrection in the engine).
        const hasPersistedMutation = _patch.corrections.some((entry) => `${entry.factId}_h1` === record.fact.id);
        if (hasPersistedMutation) continue;
        const replacement = _ds.facts.find((f) => f.id === record.fact?.id);
        if (!replacement) {
          const original = _ds.facts.find((f) => `${f.id}_h1` === record.fact.id);
          const correctedValue = record.fact.value;
          if (original && correctedValue !== null) {
            const at = new Date().toISOString();
            const officer = record.fact.extractor.replace(/^human:/, '');
            const { original: updated, replacement: newFact } = applyFactCorrection(original, { value: correctedValue, officer, at });
            Object.assign(original, updated);
            _ds.facts.push(newFact);
            recomputeDependentFindings(original.applicationId, original.key, at, newFact.id);
          } else {
            // Older idempotency-only patches did not retain the original fact
            // id. Keep the seed dataset intact; the record can still be used
            // for an idempotent response and its replacement is rebuilt when
            // a first-class correction mutation is available.
            continue;
          }
        }
      }
    }
  }
  const dsRulesDir = getRulesDir();
  const dsRules = _patch.publishedRules.length > 0 ? _patch.publishedRules : loadRules(dsRulesDir);
  _ds = assembleDataset(dsRules);
  // Seed the chain with the dataset's genesis rows (rule pack loaded, runs completed,
  // letters drafted); persisted mutations are replayed on top of them below.
  _ledger = _ds.ledger.map((row) => ({ ...row, payload: { ...row.payload } }));

  // Apply persisted (persisted-at restart) corrections first. This is the set of
  // corrections that survived a previous process restart; the in-flight corrections
  // (already applied above) are NOT duplicated here.
  for (const c of _patch.corrections) {
    const fact = _ds.facts.find((f) => f.id === c.factId);
    if (fact) {
      const { original, replacement } = applyFactCorrection(fact, { value: c.correctedValue, officer: c.officer, at: c.at });
      Object.assign(fact, original);
      _ds.facts.push(replacement);
    }
  }
  for (const d of _patch.decisions) {
    const finding = _ds.findings.find((f) => f.id === d.findingId && f.applicationId === d.appId);
    if (finding) {
      (finding as Record<string, unknown>)['status'] = d.action === 'accept'
        ? 'accepted'
        : d.action === 'dismiss'
          ? 'dismissed'
          : 'escalated';
      (finding as Record<string, unknown>)['decidedBy'] = d.actor;
      (finding as Record<string, unknown>)['decidedAt'] = d.at;
      (finding as Record<string, unknown>)['decisionReason'] = d.reason;
    }
  }
  for (const t of _patch.tamperedRows) {
    tamperRow(_ledger!, t.seq, t.patch);
  }
  for (const r of _patch.letterReleases) {
    const letter = _ds.letters.find((l) => l.applicationId === r.appId);
    if (letter) {
      (letter as Record<string, unknown>)['releasedBy'] = r.releasedBy;
      (letter as Record<string, unknown>)['releasedAt'] = r.releasedAt;
    }
  }
  for (const u of _patch.letterUpdates) {
    const letter = _ds.letters.find((l) => l.applicationId === u.appId);
    if (letter) {
      letter.body = u.body;
      letter.updatedAt = u.updatedAt;
    }
  }

  const ledgerMutations = [
    ..._patch.corrections.map((entry) => ({ kind: 'correction' as const, at: entry.at, seq: entry.seq, entry })),
    ..._patch.decisions.map((entry) => ({ kind: 'decision' as const, at: entry.at, seq: entry.seq, entry })),
    ..._patch.letterUpdates.map((entry) => ({ kind: 'letter-update' as const, at: entry.updatedAt, seq: entry.seq, entry })),
    ..._patch.letterReleases.map((entry) => ({ kind: 'letter-release' as const, at: entry.releasedAt, seq: entry.seq, entry })),
    ..._patch.rulePublishes.map((entry) => ({ kind: 'rule-publish' as const, at: entry.at, seq: entry.seq, entry })),
  ].sort((a, b) => {
    if (a.seq !== undefined && b.seq !== undefined) return a.seq - b.seq;
    return a.at.localeCompare(b.at);
  });
  for (const mutation of ledgerMutations) {
    if (mutation.kind === 'correction') {
      const fact = _ds.facts.find((item) => item.id === mutation.entry.factId);
      if (!fact) continue;
      const replacement = _ds.facts.find((item) => item.id === fact.supersededBy);
      if (!replacement) continue;
      appendLedger({
        at: mutation.entry.at,
        actor: mutation.entry.officer,
        model: mutation.entry.model ?? null,
        action: 'fact.corrected',
        entity: 'Fact',
        entityId: replacement.id,
        payload: {
          appId: fact.applicationId,
          factId: fact.id,
          replacementFactId: replacement.id,
          correctedValue: mutation.entry.correctedValue,
        },
      });
    } else if (mutation.kind === 'decision') {
      appendLedger({
        at: mutation.entry.at,
        actor: mutation.entry.actor,
        model: mutation.entry.model ?? null,
        action: `finding.${mutation.entry.action}`,
        entity: 'Finding',
        entityId: mutation.entry.findingId,
        payload: {
          appId: mutation.entry.appId,
          findingId: mutation.entry.findingId,
          action: mutation.entry.action,
          reason: mutation.entry.reason,
        },
      });
    } else if (mutation.kind === 'letter-update') {
      appendLedger({
        at: mutation.entry.updatedAt,
        actor: mutation.entry.updatedBy,
        model: mutation.entry.model ?? null,
        action: 'letter.updated',
        entity: 'Letter',
        entityId: mutation.entry.appId,
        payload: { appId: mutation.entry.appId, updatedBy: mutation.entry.updatedBy },
      });
    } else if (mutation.kind === 'letter-release') {
      appendLedger({
        at: mutation.entry.releasedAt,
        actor: mutation.entry.releasedBy,
        model: mutation.entry.model ?? null,
        action: 'letter.released',
        entity: 'Letter',
        entityId: mutation.entry.appId,
        payload: { appId: mutation.entry.appId, releasedBy: mutation.entry.releasedBy },
      });
    } else if (mutation.kind === 'rule-publish') {
      appendLedger({
        at: mutation.entry.at,
        actor: mutation.entry.author,
        model: mutation.entry.model ?? null,
        action: 'rules.published',
        entity: 'Rule',
        entityId: mutation.entry.ruleId,
        payload: {
          ruleId: mutation.entry.ruleId,
          version: mutation.entry.version,
          secondApprover: mutation.entry.secondApprover,
        },
      });
    }
  }

  // Defensive reconstruction for patches written by the earlier prototype,
  // which persisted the idempotency record but not the correction mutation.
  // It also makes restart recovery tolerant of a partially written patch.
  for (const correction of _patch.corrections) {
    const original = _ds.facts.find((fact) => fact.id === correction.factId);
    const replacementId = original?.supersededBy;
    if (!original || !replacementId || !_ds.facts.some((fact) => fact.id === replacementId)) continue;
    if (_ledger!.some((row) => row.action === 'fact.corrected' && row.entityId === replacementId)) continue;
    appendLedger({
      at: correction.at,
      actor: correction.officer,
      model: correction.model ?? null,
      action: 'fact.corrected',
      entity: 'Fact',
      entityId: replacementId,
      payload: {
        appId: original.applicationId,
        factId: original.id,
        replacementFactId: replacementId,
        correctedValue: correction.correctedValue,
      },
    });
  }
  for (const record of _patch.idempotency) {
    if (record.kind !== 'correction' || !record.fact) continue;
    const replacement = _ds.facts.find((fact) => fact.id === record.fact?.id);
    const original = replacement?.supersededBy
      ? _ds.facts.find((fact) => fact.id === replacement.supersededBy)
      : _ds.facts.find((fact) => fact.id === record.fact?.supersededBy);
    if (!replacement || !original) continue;
    if (_ledger!.some((row) => row.action === 'fact.corrected' && row.entityId === replacement.id)) continue;
    appendLedger({
      at: replacement.recordedAt,
      actor: replacement.extractor.replace(/^human:/, ''),
      model: null,
      action: 'fact.corrected',
      entity: 'Fact',
      entityId: replacement.id,
      payload: {
        appId: replacement.applicationId,
        factId: original.id,
        replacementFactId: replacement.id,
        correctedValue: replacement.value,
      },
    });
  }

  return _ds;
}

// ---- Public accessors ----

export function getDataset(): Dataset {
  return getDatasetInternal();
}

export function getApplicationSummaries(): ApplicationSummary[] {
  if (_cachedSummaries && _cachedSummaries.version === _datasetVersion) {
    return _cachedSummaries.data;
  }
  const ds = getDatasetInternal();
  const summaries = ds.summaries.map((summary) => {
    // Recompute from the live finding set so decisions, corrections and rule
    // publishes are reflected immediately (trust the recomputation, not the
    // assembly-time stamp).
    const findings = ds.findings.filter((finding) => finding.applicationId === summary.id);
    const openFindings = findings.filter((finding) => finding.status === 'open');
    const openByClass: Record<string, number> = {};
    for (const finding of openFindings) {
      openByClass[finding.findingClass] = (openByClass[finding.findingClass] ?? 0) + 1;
    }
    const triage = computeTriage(openFindings, ds.signalStrengths);
    return {
      ...summary,
      triageScore: triage.score,
      triageReasons: triage.reasons,
      openFindings: openFindings.length,
      openByClass,
      highSeverityOpen: openFindings.filter((finding) => finding.severity === 'high').length,
    };
  });
  _cachedSummaries = { version: _datasetVersion, data: summaries };
  return summaries;
}

export function getSummary(id: string): ApplicationSummary | undefined {
  return getApplicationSummaries().find((s) => s.id === id);
}

export function getInstitution(id: string): Institution | undefined {
  return getDatasetInternal().institutions.find((i) => i.id === id);
}

export function getDocuments(appId: string): Document[] {
  return getDatasetInternal().documents.filter((d) => d.applicationId === appId);
}

export function getFacts(appId: string): Fact[] {
  return getDatasetInternal().facts.filter(
    (f) => f.applicationId === appId && !f.key.startsWith('gt.') && !f.key.startsWith('fault.'),
  );
}

export function getFindings(appId: string): Finding[] {
  return getDatasetInternal().findings.filter((f) => f.applicationId === appId);
}

// ---- Dependent finding recomputation after a human fact correction ----

function recomputeDependentFindings(appId: string, factKey: string, at: string, revisionId: string): void {
  const ds = getDatasetInternal();
  const institution = ds.institutions.find((candidate) => candidate.id === appId);
  if (!institution) return;
  const appFacts = ds.facts.filter((fact) => fact.applicationId === appId);
  const factIndex = buildFactIndex(appFacts, institution.category, institution.sessionId, appId);

  for (const rule of ds.rules) {
    if (rule.kind === 'graph' || !rule.inputs.some((input) => input.fact === factKey)) continue;
    if (rule.categories.length > 0 && !rule.categories.includes(institution.category)) continue;

    const result = runRule(rule, factIndex);
    const findingId = `r_${appId}_${rule.id}`;
    const related = ds.findings.filter((finding) =>
      finding.applicationId === appId && finding.ruleId === rule.id && finding.createdBy === `rule:${rule.id}`,
    );
    const existingOpen = related.find((finding) => finding.status === 'open');
    if (result.outcome !== 'fail') {
      for (const finding of related) {
        if (finding.status === 'open') finding.status = 'rectified';
      }
      continue;
    }

    if (!existingOpen && related.some((finding) => finding.status !== 'rectified')) continue;
    const evidence = result.evidence.map((item) => {
      if (item.kind === 'absence_receipt' || item.kind === 'crop_ref') return item;
      return {
        ...item,
        cropKey: item.cropKey ?? (item.page != null || item.bbox != null ? `crops/${item.factId}.png` : null),
        role: 'input' as const,
      };
    });
    if (evidence.length === 0) continue;

    const finding = buildFinding({
      id: related.length > 0 && !existingOpen ? `${findingId}_${revisionId}` : findingId,
      applicationId: appId,
      region: institution.region,
      ruleId: rule.id,
      ruleVersion: rule.version,
      aphRef: rule.aphRef,
      findingClass: result.findingClass ?? rule.onFail.class,
      severity: result.severity ?? rule.onFail.severity,
      confidence: 0.95,
      summary: result.message ?? rule.onFail.message,
      evidence,
      createdAt: at,
      createdBy: `rule:${rule.id}`,
    });
    broadcastStoreEvent({
      type: 'finding.updated',
      payload: { appId, findingId: finding.id, status: 'open', actor: 'system' },
    });
    if (existingOpen) Object.assign(existingOpen, finding);
    else ds.findings.push(finding);
  }
}

export function getVerifications(appId: string): VerificationAttempt[] {
  return getDatasetInternal().verifications.filter((v) => v.applicationId === appId);
}

export function getConflicts(appId: string): ConflictRow[] {
  return getDatasetInternal().conflicts.filter((c) => c.applicationId === appId);
}

export function getGraph(appId?: string): GraphSubgraph {
  const ds = getDatasetInternal();
  if (!appId) {
    return { nodes: ds.graphNodes, edges: ds.graphEdges };
  }
  const institutionNode = ds.graphNodes.find((n) => n.id === appId);
  if (!institutionNode) return { nodes: [], edges: [] };

  const directEdges = ds.graphEdges.filter((e) => e.source === appId || e.target === appId);
  const neighborIds = new Set<string>([appId]);
  for (const e of directEdges) {
    neighborIds.add(e.source);
    neighborIds.add(e.target);
  }
  const hop2Edges = ds.graphEdges.filter(
    (e) => (neighborIds.has(e.source) || neighborIds.has(e.target)) && !directEdges.includes(e),
  );
  for (const e of hop2Edges) {
    neighborIds.add(e.source);
    neighborIds.add(e.target);
  }
  const nodes = ds.graphNodes.filter((n) => neighborIds.has(n.id));
  const edges = [...directEdges, ...hop2Edges];
  return { nodes, edges };
}

export function getRunEvents(appId: string): RunEvent[] {
  return getDatasetInternal().runs[appId] ?? [];
}

export function getLetter(appId: string): LetterDraft | undefined {
  return getDatasetInternal().letters.find((l) => l.applicationId === appId);
}

export function getLedger(): AuditRow[] {
  getDatasetInternal(); // ensure initialized
  return _ledger ?? [];
}

export function getRules(): Rule[] {
  return getDatasetInternal().rules;
}

export function getSignalStrengths(): Record<string, string> {
  return getDatasetInternal().signalStrengths;
}

export function getMetrics(): MetricBoard {
  if (_cachedMetrics && _cachedMetrics.version === _datasetVersion) {
    return _cachedMetrics.data;
  }
  const ds = getDatasetInternal();
  const metrics = computeMetrics({
    institutions: ds.institutions,
    documents: ds.documents,
    facts: ds.facts,
    findings: ds.findings,
    verifications: ds.verifications,
    runs: ds.runs,
  });
  _cachedMetrics = { version: _datasetVersion, data: metrics };
  return metrics;
}

// ---- Case Workspace Section Aggregations ----

export interface CaseHeader {
  id: string;
  institutionId: string;
  institutionName: string;
  applicationType: string;
  priorityScore: number;
  priorityRank: number;
  status: string;
  deadlineHoursLeft: number;
  reasons: string[];
  counts: {
    documents: number;
    mismatches: number;
    checks: number;
    connections: number;
  };
  findingsSummary: {
    total: number;
    accepted: number;
    dismissed: number;
    pending: number;
  };
  nextStep: {
    label: string;
    section: 'summary' | 'documents' | 'mismatches' | 'checks' | 'connections' | 'report';
  };
}

export function getCaseHeader(id: string): CaseHeader | undefined {
  const summary = getSummary(id);
  if (!summary) return undefined;

  const docs = getDocuments(id);
  const mismatches = getConflicts(id);
  const checks = getVerifications(id);
  const connections = getGraph(id);
  const findings = getFindings(id);

  const accepted = findings.filter((f) => (f as Record<string, unknown>)['status'] === 'accepted').length;
  const dismissed = findings.filter((f) => (f as Record<string, unknown>)['status'] === 'dismissed').length;
  const pending = findings.length - accepted - dismissed;

  let nextStep: CaseHeader['nextStep'] = {
    label: 'Prepare decision & notice',
    section: 'report',
  };

  if (pending > 0) {
    if (mismatches.length > 0) {
      nextStep = { label: `Review ${mismatches.length} mismatch${mismatches.length > 1 ? 'es' : ''}`, section: 'mismatches' };
    } else if (docs.length > 0) {
      nextStep = { label: 'Review required documents', section: 'documents' };
    }
  } else if (checks.some((c) => c.status === 'source_unavailable' || c.status === 'mismatch')) {
    nextStep = { label: 'Review official checks', section: 'checks' };
  }

  // Calculate rank based on triageScore (higher score = higher rank/priority)
  const allSummaries = getApplicationSummaries();
  const sorted = [...allSummaries].sort((a, b) => b.triageScore - a.triageScore);
  const priorityRank = sorted.findIndex((s) => s.id === id) + 1;

  return {
    id: summary.id,
    institutionId: summary.institution.id,
    institutionName: summary.institution.name,
    applicationType: summary.institution.category,
    priorityScore: summary.triageScore,
    priorityRank,
    status: summary.status,
    deadlineHoursLeft: summary.slaHoursLeft,
    reasons: summary.triageReasons,
    counts: {
      documents: docs.length,
      mismatches: mismatches.length,
      checks: checks.length,
      connections: connections.nodes.length,
    },
    findingsSummary: {
      total: findings.length,
      accepted,
      dismissed,
      pending,
    },
    nextStep,
  };
}

// ---- Mutations ----

export function applyDecision(
  appId: string,
  findingId: string,
  action: 'accept' | 'dismiss' | 'escalate',
  reason: string,
  actor: string,
  idempotencyKey?: string,
): AuditRow {
  const patch = loadPatch();
  const operation = `decision:${actor}:${appId}`;
  const fingerprint = JSON.stringify({ findingId, action, reason, actor });
  const previous = findIdempotencyRecord(patch, idempotencyKey, operation, fingerprint);
  if (previous) {
    if (previous.kind !== 'decision') throw new IdempotencyConflictError();
    return structuredClone(previous.row);
  }

  const ds = getDatasetInternal();
  const finding = ds.findings.find((f) => f.id === findingId && f.applicationId === appId);
  if (!finding) throw new Error(`Finding ${findingId} not found`);

  const newStatus = action === 'accept' ? 'accepted' : action === 'dismiss' ? 'dismissed' : 'escalated';
  (finding as Record<string, unknown>)['status'] = newStatus;
  (finding as Record<string, unknown>)['decidedBy'] = actor;
  (finding as Record<string, unknown>)['decidedAt'] = new Date().toISOString();
  (finding as Record<string, unknown>)['decisionReason'] = reason;

  const model = currentModel();
  const row = appendLedger({
    at: new Date().toISOString(),
    actor,
    model,
    action: `finding.${action}`,
    entity: 'Finding',
    entityId: findingId,
    payload: { appId, findingId, action, reason },
  });

  patch.decisions.push({ appId, findingId, action, actor, reason, at: row.at, seq: row.seq, model });
  if (idempotencyKey) {
    patch.idempotency.push({ key: idempotencyKey, operation, fingerprint, kind: 'decision', row });
  }
  savePatch(patch);
  _patch = patch;

  _datasetVersion++;
  _cachedMetrics = null;
  _cachedSummaries = null;

  broadcastStoreEvent({
    type: 'decision.recorded',
    payload: { appId, findingId, action, actor },
  });
  broadcastStoreEvent({
    type: 'finding.updated',
    payload: { appId, findingId, status: newStatus, actor },
  });
  broadcastStoreEvent({
    type: 'ledger.appended',
    payload: { seq: row.seq, action: row.action, at: row.at },
  });

  return row;
}

export function applyCorrection(
  appId: string,
  factId: string,
  correctedValue: string | number,
  officer: string,
  idempotencyKey?: string,
): Fact {
  const patch = loadPatch();
  const operation = `correction:${officer}:${appId}`;
  const fingerprint = JSON.stringify({ factId, correctedValue, officer });
  const previous = findIdempotencyRecord(patch, idempotencyKey, operation, fingerprint);
  if (previous) {
    if (previous.kind !== 'correction') throw new IdempotencyConflictError();
    return structuredClone(previous.fact);
  }

  const ds = getDatasetInternal();
  const fact = ds.facts.find((f) => f.id === factId && f.applicationId === appId);
  if (!fact) throw new Error(`Fact ${factId} not found`);
  if (fact.supersededBy) throw new Error(`Fact ${factId} has already been superseded`);

  const at = new Date().toISOString();
  const { original, replacement } = applyFactCorrection(fact, { value: correctedValue, officer, at });
  Object.assign(fact, original);
  ds.facts.push(replacement);
  recomputeDependentFindings(appId, fact.key, at, replacement.id);

  const model = currentModel();
  const row = appendLedger({
    at,
    actor: officer,
    model,
    action: 'fact.corrected',
    entity: 'Fact',
    entityId: replacement.id,
    payload: { appId, factId, replacementFactId: replacement.id, correctedValue },
  });

  if (idempotencyKey) {
    patch.idempotency.push({ key: idempotencyKey, operation, fingerprint, kind: 'correction', fact: replacement });
  }
  // Persist the correction itself as well as the idempotency record. The
  // idempotency record makes a repeated request a no-op; this mutation record
  // lets a fresh process rebuild the corrected fact and its audit row.
  patch.corrections.push({
    factId,
    correctedValue,
    officer,
    at,
    seq: row.seq,
    model,
  });
  savePatch(patch);
  _patch = patch;

  _datasetVersion++;
  _cachedMetrics = null;
  _cachedSummaries = null;

  broadcastStoreEvent({
    type: 'fact.corrected',
    payload: { appId, factId, replacementFactId: replacement.id, correctedValue },
  });
  broadcastStoreEvent({
    type: 'ledger.appended',
    payload: { seq: row.seq, action: row.action, at: row.at },
  });

  return replacement;
}

// ---- Rule pack publishing with second-approver approval ----

export function publishRulePack(rules: Rule[], author: string, secondApprover: string): AuditRow {
  getDatasetInternal();
  if (author.trim().toLowerCase() === secondApprover.trim().toLowerCase()) {
    throw new Error('The second approver must be a different person from the author.');
  }
  const ruleIds = new Set(rules.map((rule) => rule.id));
  if (ruleIds.size !== rules.length) throw new Error('Published rule pack contains duplicate rule IDs.');

  const at = new Date().toISOString();
  const publishedRule = rules.find((rule) =>
    rule.version > (_ds?.rules.find((active) => active.id === rule.id)?.version ?? -1),
  );
  if (!publishedRule) throw new Error('Published rule pack must contain a new rule version.');

  const nextPatch: StorePatch = {
    ...loadPatch(),
    publishedRules: rules,
    rulePublishes: [
      ...loadPatch().rulePublishes,
      {
        ruleId: publishedRule.id,
        version: publishedRule.version,
        author: author.trim(),
        secondApprover: secondApprover.trim(),
        at,
        seq: (_ledger?.length ?? 0) + 1,
      },
    ],
  };
  savePatch(nextPatch);
  _patch = nextPatch;
  _ds = null;
  _ledger = null;
  _datasetVersion++;
  _cachedMetrics = null;
  _cachedSummaries = null;

  getDatasetInternal();
  const publishRecord = nextPatch.rulePublishes[nextPatch.rulePublishes.length - 1]!;
  const row = _ledger!.find((candidate) =>
    candidate.seq === publishRecord.seq &&
    candidate.action === 'rules.published' &&
    candidate.entityId === publishedRule.id,
  );
  if (!row) throw new Error('Rule publish was persisted but its audit ledger entry could not be reconstructed.');
  broadcastStoreEvent({
    type: 'ledger.appended',
    payload: { seq: row.seq, action: row.action, at: row.at },
  });
  return row;
}

// ---- Letter draft editing (senior reviewer only) ----

export function updateLetterDraft(appId: string, body: string, updatedBy: string): LetterDraft {
  getDatasetInternal();
  const letter = _ds!.letters.find((item) => item.applicationId === appId);
  if (!letter) throw new Error(`Letter for ${appId} not found`);
  if (letter.releasedAt) throw new Error('A released letter cannot be edited.');

  const updatedAt = new Date().toISOString();
  const nextPatch: StorePatch = {
    ...loadPatch(),
    letterUpdates: [
      ...loadPatch().letterUpdates,
      { appId, body, updatedBy, updatedAt, seq: (_ledger?.length ?? 0) + 1 },
    ],
  };
  savePatch(nextPatch);
  _patch = nextPatch;
  _ds = null;
  _ledger = null;
  _datasetVersion++;
  _cachedMetrics = null;
  _cachedSummaries = null;

  getDatasetInternal();
  const updatedLetter = getLetter(appId);
  const updateRecord = nextPatch.letterUpdates[nextPatch.letterUpdates.length - 1]!;
  const row = _ledger!.find((candidate) =>
    candidate.seq === updateRecord.seq &&
    candidate.action === 'letter.updated' &&
    candidate.entityId === appId,
  );
  if (!updatedLetter || !row) throw new Error('The letter draft was persisted but its audit record could not be reconstructed.');
  broadcastStoreEvent({ type: 'letter.updated', payload: { appId, updatedBy, at: updatedAt } });
  broadcastStoreEvent({ type: 'ledger.appended', payload: { seq: row.seq, action: row.action, at: row.at } });
  return updatedLetter;
}

export function tamperLedgerRow(seq: number, patch: Record<string, unknown>): AuditRow {
  getDatasetInternal(); // ensure initialized
  const row = tamperRow(_ledger!, seq, patch);

  const p = loadPatch();
  p.tamperedRows.push({ seq, patch });
  savePatch(p);
  _patch = p;

  _datasetVersion++;
  _cachedMetrics = null;

  broadcastStoreEvent({
    type: 'ledger.appended',
    payload: { seq: row.seq, action: 'ledger.tampered', at: row.at },
  });

  return row;
}

export function releaseLetter(appId: string, releasedBy: string): LetterDraft {
  const ds = getDatasetInternal();
  const letter = ds.letters.find((l) => l.applicationId === appId);
  if (!letter) throw new Error(`Letter for ${appId} not found`);

  const releasedAt = new Date().toISOString();
  (letter as Record<string, unknown>)['releasedBy'] = releasedBy;
  (letter as Record<string, unknown>)['releasedAt'] = releasedAt;

  const model = currentModel();
  const row = appendLedger({
    at: releasedAt,
    actor: releasedBy,
    model,
    action: 'letter.released',
    entity: 'Letter',
    entityId: appId,
    payload: { appId, releasedBy },
  });

  const p = loadPatch();
  p.letterReleases.push({ appId, releasedBy, releasedAt, seq: row.seq, model });
  savePatch(p);

  _datasetVersion++;

  broadcastStoreEvent({
    type: 'ledger.appended',
    payload: { seq: row.seq, action: row.action, at: row.at },
  });

  return letter;
}

export function resetToSeed(): void {
  _ds = null;
  _ledger = null;
  _patch = null;
  try {
    const fp = patchFilePath();
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
  } catch {
    // non-fatal
  }
  _datasetVersion++;
  _cachedMetrics = null;
  _cachedSummaries = null;

  broadcastStoreEvent({
    type: 'dataset.reset',
    payload: { at: new Date().toISOString() },
  });
}

export function getVerifyResult(): ReturnType<typeof verifyChain> {
  getDatasetInternal();
  return verifyChain(_ledger!);
}

export function getDailyDigest(): ReturnType<typeof dailyDigest> {
  getDatasetInternal();
  return dailyDigest(_ledger!);
}
