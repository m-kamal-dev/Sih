import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ollamaStream } from './ollama-stream';
import { getApplicationSummaries, resetToSeed } from '@/.data/store';
import {
  askCase,
  briefCase,
  contextSignature,
  isNeutral,
  loadCaseContext,
  parseAnswer,
  parseBrief,
  rulesAnswer,
  rulesBrief,
  suggestedQuestions,
  type CaseContext,
} from '@/lib/ai-case';
import { GET as getBrief } from '@/app/api/applications/[id]/ai-brief/route';
import { POST as postAsk } from '@/app/api/applications/[id]/ai-ask/route';

function req(url: string, init: { method?: string; role?: string; body?: unknown } = {}) {
  const headers = new Headers();
  if (init.role) headers.set('x-eg-role', init.role);
  let body: string | undefined;
  if (init.body !== undefined) {
    body = typeof init.body === 'string' ? init.body : JSON.stringify(init.body);
    headers.set('content-type', 'application/json');
  }
  return new NextRequest(new URL(url, 'http://localhost:3100'), { method: init.method ?? 'GET', headers, body });
}
const params = (id: string) => ({ params: Promise.resolve({ id }) });

let caseId = '';
let ctx: CaseContext;

beforeAll(() => {
  resetToSeed();
  const withFindings = getApplicationSummaries().find((s) => s.openFindings > 1);
  if (!withFindings) throw new Error('fixture has no application with open findings');
  caseId = withFindings.id;
  const loaded = loadCaseContext(caseId);
  if (!loaded) throw new Error('context missing');
  ctx = loaded;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function modelReply(text: string) {
  return vi.fn(async () => ollamaStream(text));
}

describe('case context and rules-based fallbacks', () => {
  it('builds a context with open findings only', () => {
    expect(ctx.findings.length).toBeGreaterThan(1);
    expect(ctx.findings.every((x) => x.id && x.summary)).toBe(true);
    expect(contextSignature(ctx)).toContain(ctx.findings[0]!.id);
  });

  it('returns null for an unknown case', () => {
    expect(loadCaseContext('nope')).toBeNull();
  });

  it('writes a neutral rules-based brief that cites real findings', () => {
    const b = rulesBrief(ctx, 'note');
    const ids = new Set(ctx.findings.map((x) => x.id));
    expect(b.mode).toBe('rules');
    expect(b.concerns.length).toBeGreaterThan(0);
    expect(b.concerns.every((c) => c.findingIds.every((i) => ids.has(i)))).toBe(true);
    expect([b.headline, b.summary, ...b.nextSteps].every(isNeutral)).toBe(true);
  });

  it('handles a case with no open findings', () => {
    const empty: CaseContext = { ...ctx, findings: [] };
    const b = rulesBrief(empty, 'note');
    expect(b.headline).toMatch(/No open findings/);
    expect(b.concerns).toEqual([]);
    expect(rulesAnswer(empty, 'what is wrong?', 'n').findingIds).toEqual([]);
  });

  it('answers a question by matching the findings it relates to', () => {
    const target = ctx.findings[0]!;
    const word = target.summary.split(/\W+/).find((w) => w.length > 5) ?? 'document';
    const a = rulesAnswer(ctx, `Tell me about ${word}`, 'n');
    expect(a.mode).toBe('rules');
    expect(a.findingIds.length).toBeGreaterThan(0);
    expect(rulesAnswer(ctx, 'zzzz qqqq', 'n').findingIds.length).toBeGreaterThan(0);
  });

  it('suggests relevant questions', () => {
    const q = suggestedQuestions(ctx);
    expect(q.length).toBeLessThanOrEqual(4);
    expect(q[0]).toBe('What should I look at first?');
  });
});

describe('output safety', () => {
  it('rejects banned words and verdict language', () => {
    expect(isNeutral('This looks like a fake certificate')).toBe(false);
    expect(isNeutral('The certificate is not genuine')).toBe(false);
    expect(isNeutral('You should reject this application')).toBe(false);
    expect(isNeutral('The expiry date has passed and needs verification')).toBe(true);
  });

  it('drops finding ids the model made up', () => {
    const real = ctx.findings[0]!.id;
    const raw = JSON.stringify({
      headline: 'h', summary: 's',
      concerns: [{ text: 'c', findingIds: [real, 'made-up-id'] }],
      nextSteps: ['n'], questionsForInstitution: ['q'],
    });
    const parsed = parseBrief(raw, ctx);
    expect(parsed?.concerns[0]?.findingIds).toEqual([real]);
  });

  it('rejects a brief or answer that breaks the wording rules', () => {
    const bad = JSON.stringify({ headline: 'h', summary: 'This is a fake document', concerns: [], nextSteps: [], questionsForInstitution: [] });
    expect(parseBrief(bad, ctx)).toBeNull();
    expect(parseAnswer(JSON.stringify({ answer: 'You must reject it', findingIds: [] }), ctx)).toBeNull();
    expect(parseAnswer('not json', ctx)).toBeNull();
  });
});

describe('AI mode', () => {
  it('uses the rules-based brief when no key is set', async () => {
    vi.stubEnv('OLLAMA_API_KEY', '');
    const b = await briefCase(ctx);
    expect(b.mode).toBe('rules');
    expect(b.modeNote).toMatch(/no AI key/);
  });

  it('returns an AI brief when the model answers with valid JSON', async () => {
    vi.stubEnv('OLLAMA_API_KEY', 'test-key');
    const real = ctx.findings[0]!.id;
    const fetchMock = modelReply(JSON.stringify({
      headline: 'Two things to check', summary: 'Short summary.',
      concerns: [{ text: 'Check the first finding', findingIds: [real] }],
      nextSteps: ['Ask for the missing paper'], questionsForInstitution: ['Please share the paper'],
    }));
    vi.stubGlobal('fetch', fetchMock);
    const b = await briefCase(ctx);
    expect(b.mode).toBe('ai');
    expect(b.concerns[0]?.findingIds).toEqual([real]);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('falls back to rules when the call fails or the reply is unusable', async () => {
    vi.stubEnv('OLLAMA_API_KEY', 'test-key');
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network'); }));
    expect((await briefCase(ctx)).mode).toBe('rules');
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })));
    expect((await askCase(ctx, 'What is wrong?')).mode).toBe('rules');
    vi.stubGlobal('fetch', modelReply('sorry, no json'));
    expect((await askCase(ctx, 'What is wrong?')).mode).toBe('rules');
  });

  it('returns an AI answer with validated citations', async () => {
    vi.stubEnv('OLLAMA_API_KEY', 'test-key');
    const real = ctx.findings[0]!.id;
    vi.stubGlobal('fetch', modelReply(JSON.stringify({ answer: 'Look at the first finding.', findingIds: [real, 'bogus'] })));
    const a = await askCase(ctx, 'What first?');
    expect(a.mode).toBe('ai');
    expect(a.findingIds).toEqual([real]);
  });

  it('sends case data between markers so the model treats it as data', async () => {
    vi.stubEnv('OLLAMA_API_KEY', 'test-key');
    const fetchMock = modelReply('{}');
    vi.stubGlobal('fetch', fetchMock);
    await briefCase(ctx);
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, { body: string }])[1].body) as { messages: { role: string; content: string }[] };
    expect(body.messages.find((m) => m.role === 'user')!.content).toContain('<<<CASE_START>>>');
    expect(body.messages.find((m) => m.role === 'system')!.content).toMatch(/untrusted/);
  });
});

describe('AI case routes', () => {
  it('GET ai-brief returns a brief for internal roles', async () => {
    vi.stubEnv('OLLAMA_API_KEY', '');
    const res = await getBrief(req(`/api/applications/${caseId}/ai-brief`, { role: 'scrutiny_officer' }), params(caseId));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.brief.mode).toBe('rules');
    expect(Array.isArray(data.suggestedQuestions)).toBe(true);
  });

  it('blocks applicants and unknown cases', async () => {
    expect((await getBrief(req(`/api/applications/${caseId}/ai-brief`, { role: 'applicant' }), params(caseId))).status).toBe(403);
    expect((await getBrief(req('/api/applications/nope/ai-brief'), params('nope'))).status).toBe(404);
  });

  it('POST ai-ask validates the question and answers', async () => {
    vi.stubEnv('OLLAMA_API_KEY', '');
    const ok = await postAsk(req(`/api/applications/${caseId}/ai-ask`, { method: 'POST', body: { question: 'What should I look at first?' } }), params(caseId));
    expect(ok.status).toBe(200);
    expect((await ok.json()).answer.length).toBeGreaterThan(0);

    const short = await postAsk(req(`/api/applications/${caseId}/ai-ask`, { method: 'POST', body: { question: 'a' } }), params(caseId));
    expect(short.status).toBe(422);
    const long = await postAsk(req(`/api/applications/${caseId}/ai-ask`, { method: 'POST', body: { question: 'x'.repeat(501) } }), params(caseId));
    expect(long.status).toBe(422);
    const bad = await postAsk(req(`/api/applications/${caseId}/ai-ask`, { method: 'POST', body: '{oops' }), params(caseId));
    expect(bad.status).toBe(400);
    const denied = await postAsk(req(`/api/applications/${caseId}/ai-ask`, { method: 'POST', role: 'applicant', body: { question: 'hello there' } }), params(caseId));
    expect(denied.status).toBe(403);
  });
});
