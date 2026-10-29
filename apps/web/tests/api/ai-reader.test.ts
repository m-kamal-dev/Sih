import { afterEach, describe, expect, it, vi } from 'vitest';
import { demoRead, parseModelJson, readDocument } from '@/lib/ai-reader';
import { ollamaStream } from './ollama-stream';

const TEXT = 'FIRE SAFETY CERTIFICATE\nCertificate No: FS/2026/00123\nInstitution: Vikramsheela Institute of Technology\nIssued on 12/03/2025\nValid until 11/03/2026';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('AI reader', () => {
  it('uses the labelled demo reader when no key is set', async () => {
    vi.stubEnv('OLLAMA_API_KEY', '');
    const r = await readDocument({ fileName: 'a.pdf', text: TEXT, pdfBase64: null });
    expect(r.mode).toBe('demo');
    expect(r.modeNote).toMatch(/Rules-only mode/);
    expect(r.fields.map((f) => f.label)).toContain('Valid until');
  });

  it('demo reader finds reference, dates and institution', () => {
    const r = demoRead(TEXT);
    const byLabel = Object.fromEntries(r.fields.map((f) => [f.label, f.value]));
    expect(byLabel['Reference number']).toBe('FS/2026/00123');
    expect(byLabel['Valid until']).toBe('11/03/2026');
    expect(byLabel['Institution']).toBe('Vikramsheela Institute of Technology');
  });

  it('returns AI mode when the model answers with valid JSON', async () => {
    vi.stubEnv('OLLAMA_API_KEY', 'test-key');
    const fetchMock = vi.fn(async () => ollamaStream('{"documentType":"Fire certificate","summary":"ok","fields":[{"label":"Valid until","value":"11/03/2026","where":"page 1","confidence":0.9},{"label":"Seats","value":"240","where":"page 2","confidence":0.8}],"attention":[]}'));
    vi.stubGlobal('fetch', fetchMock);
    const r = await readDocument({ fileName: 'a.pdf', text: TEXT, pdfBase64: null });
    expect(r.mode).toBe('ai');
    // "240" is not in the document text: it is dropped and reported, never shown as read.
    expect(r.fields.map((f) => f.value)).toEqual(['11/03/2026']);
    expect(r.droppedCount).toBe(1);
    expect(r.attention.join(' ')).toMatch(/could not be found word-for-word.*Seats/);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('rejects the whole reply when it uses verdict-like wording', async () => {
    vi.stubEnv('OLLAMA_API_KEY', 'test-key');
    vi.stubGlobal('fetch', vi.fn(async () => ollamaStream('{"documentType":"Fire certificate","summary":"This certificate is not genuine.","fields":[{"label":"Valid until","value":"11/03/2026","where":"p1","confidence":0.9}],"attention":[]}')));
    const r = await readDocument({ fileName: 'a.pdf', text: TEXT, pdfBase64: null });
    expect(r.mode).toBe('demo');
    expect(r.modeNote).toMatch(/verdict-like wording/);
  });

  it('falls back to demo mode when the call fails or the reply is unreadable', async () => {
    vi.stubEnv('OLLAMA_API_KEY', 'test-key');
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network'); }));
    expect((await readDocument({ fileName: 'a.pdf', text: TEXT, pdfBase64: null })).mode).toBe('demo');
    vi.stubGlobal('fetch', vi.fn(async () => ollamaStream('sorry')));
    expect((await readDocument({ fileName: 'a.pdf', text: TEXT, pdfBase64: null })).mode).toBe('demo');
  });

  it('parses fenced JSON, clamps confidence and drops empty fields', () => {
    const p = parseModelJson('```json\n{"documentType":"X","summary":"s","fields":[{"label":"A","value":"B","confidence":5},{"label":"","value":"x"}],"attention":["a",1]}\n```');
    expect(p?.fields).toHaveLength(1);
    expect(p?.fields[0]?.confidence).toBe(1);
    expect(p?.attention).toEqual(['a']);
    expect(parseModelJson('no json')).toBeNull();
  });
});
