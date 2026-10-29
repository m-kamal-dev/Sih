import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { buildSample } from '@evidencegraph/fixtures';
import { getRules } from '@/.data/store';
import { buildChecklist, guessDocType, type FileCheck } from '@/lib/apply';
import { POST as postCheck } from '@/app/api/apply/check/route';
import { GET as getChecklist } from '@/app/api/apply/checklist/route';

afterEach(() => vi.unstubAllEnvs());

function upload(bytes: Buffer, fileName: string, docType: string, role = 'applicant') {
  const form = new FormData();
  form.append('file', new File([new Uint8Array(bytes)], fileName, { type: 'application/pdf' }));
  form.append('docType', docType);
  return new NextRequest(new URL('/api/apply/check', 'http://localhost:3100'), { method: 'POST', headers: { 'x-eg-role': role }, body: form });
}

describe('apply checklist', () => {
  it('is derived from the loaded rules and keeps unconfirmed APH references pending', () => {
    const items = buildChecklist(getRules(), 'EOA');
    const types = items.map((i) => i.docType);
    expect(types).toEqual(expect.arrayContaining(['fire_noc', 'land', 'faculty', 'trust']));
    expect(items.every((i) => i.reference === 'pending')).toBe(true);
    expect(items.find((i) => i.docType === 'fire_noc')?.ruleIds).toContain('fire_noc_validity');
  });

  it('guesses a document type from the file name', () => {
    expect(guessDocType('Fire-NOC-2026.pdf')).toBe('fire_noc');
    expect(guessDocType('sale_deed.pdf')).toBe('land');
    expect(guessDocType('scan001.pdf')).toBe('other');
  });

  it('GET checklist validates the category', async () => {
    const ok = await getChecklist(new NextRequest(new URL('/api/apply/checklist?category=NEW_PROGRAMME', 'http://localhost:3100'), { headers: { 'x-eg-role': 'applicant' } }));
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { items: unknown[] }).items.length).toBeGreaterThan(0);
    const bad = await getChecklist(new NextRequest(new URL('/api/apply/checklist?category=NOPE', 'http://localhost:3100')));
    expect(bad.status).toBe(422);
  });
});

describe('apply per-file check', () => {
  it('runs real forensics in rules-only mode and returns plain-language fixes', async () => {
    vi.stubEnv('OLLAMA_API_KEY', '');
    vi.stubEnv('OLLAMA_BASE_URL', '');
    const res = await postCheck(upload(buildSample('signed-then-modified'), 'fire-noc.pdf', 'fire_noc'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as FileCheck;
    expect(body.level).toBe('high');
    expect(body.docType).toBe('fire_noc');
    expect(body.reading.mode).toBe('demo');
    expect(body.signals.length).toBeGreaterThan(0);
    expect(body.signals.every((s) => s.fix.length > 10)).toBe(true);
    expect(JSON.stringify(body)).not.toMatch(/forged|fraud/i);
  });

  it('rejects an empty upload and unknown document types fall back to "other"', async () => {
    expect((await postCheck(upload(Buffer.alloc(0), 'a.pdf', 'fire_noc'))).status).toBe(422);
    const res = await postCheck(upload(buildSample('clean-fire-noc'), 'a.pdf', 'not-a-type'));
    expect(((await res.json()) as FileCheck).docType).toBe('other');
  });
});
