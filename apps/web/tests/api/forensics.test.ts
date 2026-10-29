import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { buildSample } from '@evidencegraph/fixtures';
import { POST as postAnalyze } from '@/app/api/forensics/analyze/route';
import { GET as getSample } from '@/app/api/forensics/samples/[name]/route';

function jsonRequest(body: unknown, role = 'scrutiny_officer') {
  return new NextRequest(new URL('/api/forensics/analyze', 'http://localhost:3100'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-eg-role': role },
    body: JSON.stringify(body),
  });
}

describe('live PDF forensics API', () => {
  it('analyses an uploaded PDF from its bytes and returns signals, not verdicts', async () => {
    const pdf = buildSample('signed-then-modified');
    const res = await postAnalyze(jsonRequest({ fileName: 'noc.pdf', contentBase64: pdf.toString('base64') }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { level: string; sha256: string; signals: { id: string }[]; limits: string[] };
    expect(body.level).toBe('high');
    expect(body.sha256).toHaveLength(64);
    expect(body.signals.some((s) => s.id.startsWith('signature_digest_mismatch'))).toBe(true);
    expect(body.limits.length).toBeGreaterThan(0);
    expect(JSON.stringify(body)).not.toMatch(/forged|fraud/i);
  });

  it('keeps forensic detail away from institutions', async () => {
    const pdf = buildSample('clean-fire-noc');
    const res = await postAnalyze(jsonRequest({ contentBase64: pdf.toString('base64') }, 'applicant'));
    expect(res.status).toBe(403);
  });

  it('rejects an empty upload', async () => {
    const res = await postAnalyze(jsonRequest({ contentBase64: '' }));
    expect(res.status).toBe(422);
  });

  it('reports a non-PDF plainly', async () => {
    const res = await postAnalyze(jsonRequest({ contentBase64: Buffer.from('plain text file').toString('base64') }));
    const body = (await res.json()) as { signals: { id: string }[] };
    expect(res.status).toBe(200);
    expect(body.signals[0]?.id).toBe('not_a_pdf');
  });

  it('serves real sample PDFs and rejects unknown names', async () => {
    const ok = await getSample(new NextRequest(new URL('/api/forensics/samples/clean-fire-noc', 'http://localhost:3100')), { params: Promise.resolve({ name: 'clean-fire-noc' }) });
    expect(ok.status).toBe(200);
    expect(ok.headers.get('content-type')).toBe('application/pdf');
    const missing = await getSample(new NextRequest(new URL('/api/forensics/samples/nope', 'http://localhost:3100')), { params: Promise.resolve({ name: 'nope' }) });
    expect(missing.status).toBe(404);
  });
});
