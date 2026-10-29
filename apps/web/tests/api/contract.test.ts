import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getHealth } from '@/app/api/health/route';
import { GET as getCases } from '@/app/api/cases/route';
import { GET as getApplications } from '@/app/api/applications/route';
import { GET as getCaseHeader } from '@/app/api/cases/[id]/route';
import { GET as getCaseDocs } from '@/app/api/cases/[id]/documents/route';
import { GET as getCaseMismatches } from '@/app/api/cases/[id]/mismatches/route';
import { GET as getCaseChecks } from '@/app/api/cases/[id]/checks/route';
import { GET as getCaseConnections } from '@/app/api/cases/[id]/connections/route';
import { GET as getCaseReport } from '@/app/api/cases/[id]/report/route';
import { POST as postDecision } from '@/app/api/cases/[id]/decision/route';
import { POST as postCorrection } from '@/app/api/cases/[id]/facts/[factId]/correct/route';
import { GET as getRules } from '@/app/api/rules/route';
import { POST as postRuleTest } from '@/app/api/rules/test/route';
import { POST as postRuleReplay } from '@/app/api/rules/replay/route';
import { POST as postRulePublish } from '@/app/api/rules/publish/route';
import { GET as getMetrics } from '@/app/api/metrics/route';
import { GET as getLedgerRoute, POST as postTamper } from '@/app/api/ledger/route';
import { POST as postVerify } from '@/app/api/ledger/verify/route';
import { POST as postReset } from '@/app/api/demo/reset/route';
import { GET as getLetter, PATCH as patchLetter, PUT as putLetter } from '@/app/api/applications/[id]/letter/route';
import { getFacts, getFindings, getLedger as getStoreLedger, getLetter as getStoreLetter, getRules as getStoreRules, getSummary, resetToSeed } from '@/.data/store';
import { stringifyRuleYaml } from '@evidencegraph/engine';

function makeRequest(url: string, options: { method?: string; headers?: Record<string, string>; body?: unknown } = {}) {
  const headers = new Headers(options.headers ?? {});
  let body: string | undefined = undefined;
  if (options.body) {
    body = JSON.stringify(options.body);
    headers.set('Content-Type', 'application/json');
  }
  return new NextRequest(new URL(url, 'http://localhost:3100'), {
    method: options.method ?? 'GET',
    headers,
    body,
  });
}

describe('API Contract & Robustness Suite', () => {
  describe('GET /api/health', () => {
    it('returns healthy status with datasetVersion and ledger chain validity', async () => {
      const res = await getHealth(makeRequest('http://localhost:3100/api/health'));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.status).toBe('ok');
      expect(typeof data.datasetVersion).toBe('number');
      expect(typeof data.ledgerHeadHash).toBe('string');
      expect(data.chainValid).toBe(true);
      expect(res.headers.get('ETag')).toBeDefined();
    });

    it('supports exact, weak, list, wildcard and stale If-None-Match values', async () => {
      const first = await getRules(makeRequest('http://localhost:3100/api/rules'));
      const etag = first.headers.get('ETag');
      expect(etag).toBeTruthy();

      for (const ifNoneMatch of [etag!, `W/${etag}`, `"stale", ${etag}`, '*']) {
        const conditional = await getRules(makeRequest('http://localhost:3100/api/rules', {
          headers: { 'if-none-match': ifNoneMatch },
        }));
        expect(conditional.status, ifNoneMatch).toBe(304);
      }

      const stale = await getRules(makeRequest('http://localhost:3100/api/rules', {
        headers: { 'if-none-match': '"stale"' },
      }));
      expect(stale.status).toBe(200);
    });
  });

  describe('GET /api/cases', () => {
    it('returns paginated summaries for scrutiny officer', async () => {
      const res = await getCases(makeRequest('http://localhost:3100/api/cases?page=1&limit=5', {
        headers: { 'x-eg-role': 'scrutiny_officer' },
      }));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data.items)).toBe(true);
      expect(data.items.length).toBeLessThanOrEqual(5);
      expect(data.pagination.page).toBe(1);
    });

    it('rejects applicant role with 403 and uniform error shape', async () => {
      const res = await getCases(makeRequest('http://localhost:3100/api/cases', {
        headers: { 'x-eg-role': 'applicant' },
      }));
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toBeDefined();
      expect(data.error.code).toBe('FORBIDDEN_ROLE');
      expect(typeof data.error.message).toBe('string');
    });

    it('validates query parameters with zod', async () => {
      const res = await getCases(makeRequest('http://localhost:3100/api/cases?page=notanumber', {
        headers: { 'x-eg-role': 'scrutiny_officer' },
      }));
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error.code).toBe('VALIDATION_FAILED');
    });

    it('rejects unknown roles on case and application lists', async () => {
      const cases = await getCases(makeRequest('http://localhost:3100/api/cases', {
        headers: { 'x-eg-role': 'unknown-role' },
      }));
      const applications = await getApplications(makeRequest('http://localhost:3100/api/applications', {
        headers: { 'x-eg-role': 'unknown-role' },
      }));
      expect(cases.status).toBe(403);
      expect(applications.status).toBe(403);

      const rules = await getRules(makeRequest('http://localhost:3100/api/rules', {
        headers: { 'x-eg-role': 'unknown-role' },
      }));
      const metrics = await getMetrics(makeRequest('http://localhost:3100/api/metrics', {
        headers: { 'x-eg-role': 'unknown-role' },
      }));
      expect(rules.status).toBe(403);
      expect(metrics.status).toBe(403);
    });
  });

  describe('GET /api/cases/:id', () => {
    it('returns case header with section counts', async () => {
      const res = await getCaseHeader(
        makeRequest('http://localhost:3100/api/cases/EOA-2026-0142'),
        { params: Promise.resolve({ id: 'EOA-2026-0142' }) },
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.id).toBe('EOA-2026-0142');
      expect(data.counts).toBeDefined();
      expect(typeof data.counts.documents).toBe('number');
      expect(typeof data.counts.mismatches).toBe('number');
      expect(typeof data.counts.checks).toBe('number');
      expect(typeof data.counts.connections).toBe('number');
      expect(data.nextStep).toBeDefined();
    });

    it('returns 404 with uniform error shape for non-existent case', async () => {
      const res = await getCaseHeader(
        makeRequest('http://localhost:3100/api/cases/APP-NONEXISTENT'),
        { params: Promise.resolve({ id: 'APP-NONEXISTENT' }) },
      );
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error.code).toBe('RESOURCE_NOT_FOUND');
    });

    it('requires the matching applicant case id and PIN', async () => {
      const id = 'EOA-2026-0163';
      const pin = getSummary(id)?.institution.applicantRolePin;
      expect(pin).toBeTruthy();

      const allowed = await getCaseHeader(
        makeRequest(`http://localhost:3100/api/cases/${id}`, {
          headers: { 'x-eg-role': 'applicant', 'x-eg-app-id': id, 'x-eg-pin': pin! },
        }),
        { params: Promise.resolve({ id }) },
      );
      expect(allowed.status).toBe(200);

      const wrongCase = await getCaseHeader(
        makeRequest(`http://localhost:3100/api/cases/${id}`, {
          headers: { 'x-eg-role': 'applicant', 'x-eg-app-id': 'EOA-2026-0142', 'x-eg-pin': pin! },
        }),
        { params: Promise.resolve({ id }) },
      );
      expect(wrongCase.status).toBe(403);

      const wrongPin = await getCaseHeader(
        makeRequest(`http://localhost:3100/api/cases/${id}`, {
          headers: { 'x-eg-role': 'applicant', 'x-eg-app-id': id, 'x-eg-pin': 'invalid' },
        }),
        { params: Promise.resolve({ id }) },
      );
      expect(wrongPin.status).toBe(403);
    });
  });

  describe('Section endpoints', () => {
    it('GET /api/cases/:id/documents returns documents', async () => {
      const res = await getCaseDocs(
        makeRequest('http://localhost:3100/api/cases/EOA-2026-0142/documents'),
        { params: Promise.resolve({ id: 'EOA-2026-0142' }) },
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.caseId).toBe('EOA-2026-0142');
      expect(Array.isArray(data.documents)).toBe(true);
    });

    it('GET /api/cases/:id/mismatches returns conflicts and facts', async () => {
      const res = await getCaseMismatches(
        makeRequest('http://localhost:3100/api/cases/EOA-2026-0142/mismatches'),
        { params: Promise.resolve({ id: 'EOA-2026-0142' }) },
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.caseId).toBe('EOA-2026-0142');
      expect(Array.isArray(data.mismatches)).toBe(true);
    });

    it('GET /api/cases/:id/checks returns verification attempts', async () => {
      const res = await getCaseChecks(
        makeRequest('http://localhost:3100/api/cases/EOA-2026-0142/checks'),
        { params: Promise.resolve({ id: 'EOA-2026-0142' }) },
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.caseId).toBe('EOA-2026-0142');
      expect(Array.isArray(data.checks)).toBe(true);
    });

    it('GET /api/cases/:id/connections returns graph nodes and edges', async () => {
      const res = await getCaseConnections(
        makeRequest('http://localhost:3100/api/cases/EOA-2026-0142/connections'),
        { params: Promise.resolve({ id: 'EOA-2026-0142' }) },
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.caseId).toBe('EOA-2026-0142');
      expect(Array.isArray(data.nodes)).toBe(true);
      expect(Array.isArray(data.edges)).toBe(true);
    });

    it('GET /api/cases/:id/report returns findings and notice draft', async () => {
      const res = await getCaseReport(
        makeRequest('http://localhost:3100/api/cases/EOA-2026-0142/report'),
        { params: Promise.resolve({ id: 'EOA-2026-0142' }) },
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.caseId).toBe('EOA-2026-0142');
      expect(Array.isArray(data.findings)).toBe(true);
    });

    it('blocks applicants from every forensic section endpoint', async () => {
      const routes = [
        ['documents', getCaseDocs],
        ['mismatches', getCaseMismatches],
        ['checks', getCaseChecks],
        ['connections', getCaseConnections],
        ['report', getCaseReport],
      ] as const;

      for (const [section, handler] of routes) {
        const res = await handler(
          makeRequest(`http://localhost:3100/api/cases/EOA-2026-0142/${section}`, {
            headers: { 'x-eg-role': 'applicant' },
          }),
          { params: Promise.resolve({ id: 'EOA-2026-0142' }) },
        );
        expect(res.status, section).toBe(403);
        expect((await res.json()).error.code, section).toBe('FORBIDDEN_ROLE');
      }
    });

    it('rejects an unknown role instead of exposing case sections', async () => {
      const res = await getCaseDocs(
        makeRequest('http://localhost:3100/api/cases/EOA-2026-0142/documents', {
          headers: { 'x-eg-role': 'unknown-role' },
        }),
        { params: Promise.resolve({ id: 'EOA-2026-0142' }) },
      );
      expect(res.status).toBe(403);
      expect((await res.json()).error.code).toBe('FORBIDDEN_ROLE');
    });
  });

  describe('Mutations & Validation boundaries', () => {
    it('rejects unknown fields on POST decision (.strict)', async () => {
      const res = await postDecision(
        makeRequest('http://localhost:3100/api/cases/EOA-2026-0142/decision', {
          method: 'POST',
          headers: { 'x-eg-role': 'scrutiny_officer' },
          body: {
            findingId: 'find_1',
            action: 'accept',
            reason: 'Valid proof',
            unknownMaliciousField: 'hack',
          },
        }),
        { params: Promise.resolve({ id: 'EOA-2026-0142' }) },
      );
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error.code).toBe('VALIDATION_FAILED');
    });

    it('rejects applicant role on POST decision', async () => {
      const res = await postDecision(
        makeRequest('http://localhost:3100/api/cases/EOA-2026-0142/decision', {
          method: 'POST',
          headers: { 'x-eg-role': 'applicant' },
          body: {
            findingId: 'find_1',
            action: 'accept',
            reason: 'Valid proof',
          },
        }),
        { params: Promise.resolve({ id: 'EOA-2026-0142' }) },
      );
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error.code).toBe('FORBIDDEN_ROLE');
    });

    it('rejects unknown roles on POST decision', async () => {
      const res = await postDecision(
        makeRequest('http://localhost:3100/api/cases/EOA-2026-0142/decision', {
          method: 'POST',
          headers: { 'x-eg-role': 'unknown-role' },
          body: { findingId: 'find_1', action: 'accept', reason: 'Not authorized' },
        }),
        { params: Promise.resolve({ id: 'EOA-2026-0142' }) },
      );
      expect(res.status).toBe(403);
      expect((await res.json()).error.code).toBe('FORBIDDEN_ROLE');
    });

    it('replays a decision with the same idempotency key and rejects changed payloads', async () => {
      resetToSeed();
      const id = 'EOA-2026-0142';
      const finding = getFindings(id)[0];
      expect(finding).toBeDefined();
      const beforeCount = getStoreLedger().length;
      const body = { findingId: finding!.id, action: 'accept', reason: 'Reviewed evidence' };
      const invoke = (requestBody: typeof body) => postDecision(
        makeRequest(`http://localhost:3100/api/cases/${id}/decision`, {
          method: 'POST',
          headers: { 'x-eg-role': 'scrutiny_officer', 'idempotency-key': 'decision-contract-1' },
          body: requestBody,
        }),
        { params: Promise.resolve({ id }) },
      );

      try {
        const first = await invoke(body);
        const firstRow = (await first.json()).ledgerRow;
        expect(first.status).toBe(200);
        expect(getStoreLedger()).toHaveLength(beforeCount + 1);

        await vi.resetModules();
        const { POST: postDecisionAfterRestart } = await import('@/app/api/cases/[id]/decision/route');
        const restartedStore = await import('@/.data/store');
        const replay = await postDecisionAfterRestart(
          makeRequest(`http://localhost:3100/api/cases/${id}/decision`, {
            method: 'POST',
            headers: { 'x-eg-role': 'scrutiny_officer', 'idempotency-key': 'decision-contract-1' },
            body,
          }),
          { params: Promise.resolve({ id }) },
        );
        const replayRow = (await replay.json()).ledgerRow;
        expect(replay.status).toBe(200);
        expect(replayRow.seq).toBe(firstRow.seq);
        expect(restartedStore.getLedger()).toHaveLength(beforeCount + 1);

        const conflict = await postDecisionAfterRestart(
          makeRequest(`http://localhost:3100/api/cases/${id}/decision`, {
            method: 'POST',
            headers: { 'x-eg-role': 'scrutiny_officer', 'idempotency-key': 'decision-contract-1' },
            body: { ...body, reason: 'Different payload' },
          }),
          { params: Promise.resolve({ id }) },
        );
        expect(conflict.status).toBe(409);
        expect((await conflict.json()).error.code).toBe('IDEMPOTENCY_CONFLICT');
        expect(restartedStore.getLedger()).toHaveLength(beforeCount + 1);
      } finally {
        resetToSeed();
      }
    });

    it('re-evaluates dependent findings and triage after a human fact correction', async () => {
      resetToSeed();
      const id = 'EOA-2026-0142';
      const fact = getFacts(id).find((candidate) => candidate.key === 'land.form_area' && !candidate.supersededBy);
      const originalFinding = getFindings(id).find((finding) => finding.ruleId === 'land_area_form_vs_deed' && finding.status === 'open');
      const before = getSummary(id);
      expect(fact).toBeDefined();
      expect(originalFinding).toBeDefined();
      expect(before).toBeDefined();

      try {
        const response = await postCorrection(
          makeRequest(`http://localhost:3100/api/cases/${id}/facts/${fact!.id}/correct`, {
            method: 'POST',
            headers: { 'x-eg-role': 'scrutiny_officer' },
            body: { correctedValue: 3.2 },
          }),
          { params: Promise.resolve({ id, factId: fact!.id }) },
        );
        expect(response.status).toBe(200);
        expect(getFindings(id).find((finding) => finding.id === originalFinding!.id)?.status).toBe('rectified');
        const after = getSummary(id);
        expect(after?.openFindings).toBe((before?.openFindings ?? 0) - 1);
        expect(after?.triageScore).toBeLessThan(before?.triageScore ?? 0);
      } finally {
        resetToSeed();
      }
    });

    it('replays a fact correction with the same idempotency key', async () => {
      resetToSeed();
      const id = 'EOA-2026-0142';
      const fact = getFacts(id).find((candidate) => !candidate.supersededBy);
      expect(fact).toBeDefined();
      const beforeCount = getStoreLedger().length;
      const body = { correctedValue: 'idempotent correction value' };
      // NOTE: `getStoreLedger` is an alias for `getLedger`, which calls `getDatasetInternal()`.
      // The restarted process replays in-flight corrections from the patch, so the restarted
      // observer sees beforeCount+1 rows before the replay request is sent.
      const invoke = (correctedValue: string) => postCorrection(
        makeRequest(`http://localhost:3100/api/cases/${id}/facts/${fact!.id}/correct`, {
          method: 'POST',
          headers: { 'x-eg-role': 'scrutiny_officer', 'idempotency-key': 'correction-contract-1' },
          body: { correctedValue },
        }),
        { params: Promise.resolve({ id, factId: fact!.id }) },
      );

      try {
        const first = await invoke(body.correctedValue);
        const firstFact = await first.json();
        expect(first.status).toBe(200);

        await vi.resetModules();
        const { POST: postCorrectionAfterRestart } = await import('@/app/api/cases/[id]/facts/[factId]/correct/route');
        const restartedStore = await import('@/.data/store');
        const replay = await postCorrectionAfterRestart(
          makeRequest(`http://localhost:3100/api/cases/${id}/facts/${fact!.id}/correct`, {
            method: 'POST',
            headers: { 'x-eg-role': 'scrutiny_officer', 'idempotency-key': 'correction-contract-1' },
            body,
          }),
          { params: Promise.resolve({ id, factId: fact!.id }) },
        );
        const replayFact = await replay.json();
        expect(replay.status).toBe(200);
        expect(replayFact.id).toBe(firstFact.id);        // The restarted test process replayed the in-flight correction at first access, so its
        // ledger already contains the same row the first request appended. The replay request
        // must be a no-op and must NOT add a second ledger row.
        expect(restartedStore.getLedger().length).toBe(beforeCount + 1);
      expect(restartedStore.getFacts(id).filter((candidate) => candidate.supersededBy === firstFact.id)).toHaveLength(1);

        const conflict = await postCorrectionAfterRestart(
          makeRequest(`http://localhost:3100/api/cases/${id}/facts/${fact!.id}/correct`, {
            method: 'POST',
            headers: { 'x-eg-role': 'scrutiny_officer', 'idempotency-key': 'correction-contract-1' },
            body: { correctedValue: 'different correction' },
          }),
          { params: Promise.resolve({ id, factId: fact!.id }) },
        );
        expect(conflict.status).toBe(409);
        expect((await conflict.json()).error.code).toBe('IDEMPOTENCY_CONFLICT');
      } finally {
        resetToSeed();
      }
    });

    it('rejects applicant on POST correction', async () => {
      const res = await postCorrection(
        makeRequest('http://localhost:3100/api/cases/EOA-2026-0142/facts/fact_1/correct', {
          method: 'POST',
          headers: { 'x-eg-role': 'applicant' },
          body: { correctedValue: '5.00' },
        }),
        { params: Promise.resolve({ id: 'EOA-2026-0142', factId: 'fact_1' }) },
      );
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error.code).toBe('FORBIDDEN_ROLE');
    });
  });

  describe('Auditing & Rules roles', () => {
    it('GET /api/rules rejects applicant role', async () => {
      const res = await getRules(makeRequest('http://localhost:3100/api/rules', {
        headers: { 'x-eg-role': 'applicant' },
      }));
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error.code).toBe('FORBIDDEN_ROLE');
    });

    it('rule administrators can test, replay, and publish a version with persisted second approval', async () => {
      resetToSeed();
      try {
        const activeRule = getStoreRules().find((rule) => rule.id === 'land_area_form_vs_deed');
        expect(activeRule).toBeDefined();
        const makeDraft = (version: number, tolerance: number) => stringifyRuleYaml({
          ...activeRule!,
          version,
          assert: `abs(num(land.form_area) - num(land.deed_area)) <= ${tolerance}`,
          tests: activeRule!.tests.map((test) => test.name === 'form inflates the parcel'
            ? { ...test, expect: 'pass' as const }
            : test),
        });
        const request = (url: string, body: unknown) => makeRequest(url, {
          method: 'POST',
          headers: { 'x-eg-role': 'rule_admin' },
          body,
        });
        const firstDraft = makeDraft(activeRule!.version + 1, 2);
        const unprivileged = await postRuleTest(makeRequest('http://localhost:3100/api/rules/test', {
          method: 'POST',
          headers: { 'x-eg-role': 'applicant' },
          body: { yaml: firstDraft },
        }));
        expect(unprivileged.status).toBe(403);

        const failedTestDraft = stringifyRuleYaml({
          ...activeRule!,
          version: activeRule!.version + 1,
          assert: 'abs(num(land.form_area) - num(land.deed_area)) <= 2',
        });
        const failedTests = await postRuleTest(request('http://localhost:3100/api/rules/test', { yaml: failedTestDraft }));
        expect(failedTests.status).toBe(422);
        expect((await failedTests.json()).error.details.passed).toBe(false);

        const staleReplay = await postRuleReplay(request('http://localhost:3100/api/rules/replay', {
          yaml: makeDraft(activeRule!.version + 2, 2.1),
        }));
        expect(staleReplay.status).toBe(409);

        const tested = await postRuleTest(request('http://localhost:3100/api/rules/test', { yaml: firstDraft }));
        expect(tested.status).toBe(200);
        expect((await tested.json()).passed).toBe(true);

        const replayed = await postRuleReplay(request('http://localhost:3100/api/rules/replay', { yaml: firstDraft }));
        expect(replayed.status).toBe(200);
        expect((await replayed.json()).summary.cleared).toBeGreaterThan(0);

        const sameApprover = await postRulePublish(request('http://localhost:3100/api/rules/publish', {
          yaml: firstDraft,
          author: 'Rule Author',
          secondApprover: 'Rule Author',
        }));
        expect(sameApprover.status).toBe(400);

        const publishedV2 = await postRulePublish(request('http://localhost:3100/api/rules/publish', {
          yaml: firstDraft,
          author: 'Rule Author',
          secondApprover: 'Independent Reviewer',
        }));
        expect(publishedV2.status).toBe(200);
        const v2Result = await publishedV2.json();
        expect(v2Result.auditRow.action).toBe('rules.published');
        expect(v2Result.auditRow.payload.version).toBe(activeRule!.version + 1);

        const secondDraft = makeDraft(activeRule!.version + 2, 2.1);
        const publishedV3 = await postRulePublish(request('http://localhost:3100/api/rules/publish', {
          yaml: secondDraft,
          author: 'Rule Author',
          secondApprover: 'Independent Reviewer',
        }));
        expect(publishedV3.status).toBe(200);
        const v3Result = await publishedV3.json();
        expect(v3Result.auditRow.seq).toBeGreaterThan(v2Result.auditRow.seq);
        expect(v3Result.auditRow.payload.version).toBe(activeRule!.version + 2);

        await vi.resetModules();
        const restartedStore = await import('@/.data/store');
        expect(restartedStore.getRules().find((rule) => rule.id === activeRule!.id)?.version).toBe(activeRule!.version + 2);
        expect(restartedStore.getLedger().filter((row) => row.action === 'rules.published')).toHaveLength(2);
        expect(restartedStore.getVerifyResult().ok).toBe(true);
      } finally {
        resetToSeed();
      }
    });

    it('GET /api/ledger rejects applicant role', async () => {
      const res = await getLedgerRoute(makeRequest('http://localhost:3100/api/ledger', {
        headers: { 'x-eg-role': 'applicant' },
      }));
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error.code).toBe('FORBIDDEN_ROLE');
    });

    it('POST /api/ledger rejects invalid tamper schema', async () => {
      const res = await postTamper(makeRequest('http://localhost:3100/api/ledger', {
        method: 'POST',
        headers: { 'x-eg-role': 'auditor' },
        body: { invalid: 'payload' },
      }));
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error.code).toBe('VALIDATION_FAILED');
    });

    it('rejects unknown roles from ledger mutations and verification', async () => {
      const tamper = await postTamper(makeRequest('http://localhost:3100/api/ledger', {
        method: 'POST',
        headers: { 'x-eg-role': 'unknown-role' },
        body: { seq: 1, patch: { action: 'modified' } },
      }));
      const verify = await postVerify(makeRequest('http://localhost:3100/api/ledger/verify', {
        method: 'POST',
        headers: { 'x-eg-role': 'unknown-role' },
      }));
      expect(tamper.status).toBe(403);
      expect(verify.status).toBe(403);
    });

    it('rejects unauthorized reset and prevents applicant letter reads', async () => {
      const reset = await postReset(makeRequest('http://localhost:3100/api/demo/reset', {
        method: 'POST',
        headers: { 'x-eg-role': 'scrutiny_officer' },
      }));
      expect(reset.status).toBe(403);

      const unknownRoleReset = await postReset(makeRequest('http://localhost:3100/api/demo/reset', {
        method: 'POST',
        headers: { 'x-eg-role': 'unknown-role' },
      }));
      expect(unknownRoleReset.status).toBe(403);

      const letter = await getLetter(
        makeRequest('http://localhost:3100/api/applications/EOA-2026-0142/letter', {
          headers: { 'x-eg-role': 'applicant' },
        }),
        { params: Promise.resolve({ id: 'EOA-2026-0142' }) },
      );
      expect(letter.status).toBe(403);
    });

    it('persists senior reviewer letter edits and prevents editing after release', async () => {
      resetToSeed();
      const id = 'EOA-2026-0142';
      const updatedBody = 'Updated synthetic deficiency notice: please provide verified land documentation.';
      try {
        const forbidden = await patchLetter(
          makeRequest(`http://localhost:3100/api/applications/${id}/letter`, {
            method: 'PATCH',
            headers: { 'x-eg-role': 'scrutiny_officer' },
            body: { body: updatedBody },
          }),
          { params: Promise.resolve({ id }) },
        );
        expect(forbidden.status).toBe(403);

        const response = await patchLetter(
          makeRequest(`http://localhost:3100/api/applications/${id}/letter`, {
            method: 'PATCH',
            headers: { 'x-eg-role': 'senior_reviewer' },
            body: { body: updatedBody },
          }),
          { params: Promise.resolve({ id }) },
        );
        expect(response.status).toBe(200);
        expect((await response.json()).body).toBe(updatedBody);
        expect(getStoreLetter(id)?.body).toBe(updatedBody);
        expect(getStoreLedger().at(-1)?.action).toBe('letter.updated');

        await vi.resetModules();
        const restartedStore = await import('@/.data/store');
        expect(restartedStore.getLetter(id)?.body).toBe(updatedBody);
        expect(restartedStore.getVerifyResult().ok).toBe(true);

        const released = await putLetter(
          makeRequest(`http://localhost:3100/api/applications/${id}/letter`, {
            method: 'PUT',
            headers: { 'x-eg-role': 'senior_reviewer' },
            body: { releasedBy: 'senior_reviewer' },
          }),
          { params: Promise.resolve({ id }) },
        );
        expect(released.status).toBe(200);
        const editAfterRelease = await patchLetter(
          makeRequest(`http://localhost:3100/api/applications/${id}/letter`, {
            method: 'PATCH',
            headers: { 'x-eg-role': 'senior_reviewer' },
            body: { body: 'A later revision should be blocked.' },
          }),
          { params: Promise.resolve({ id }) },
        );
        expect(editAfterRelease.status).toBe(409);
      } finally {
        resetToSeed();
      }
    });
  });
});
