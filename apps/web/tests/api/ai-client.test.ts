import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { aiStatus, askAi, extractJsonObject } from '@/lib/ai-client';
import { groundVerbatim, resolveAiProvider } from '@evidencegraph/engine';
import { ollamaStream } from './ollama-stream';

const KEYS = ['OLLAMA_API_KEY', 'OLLAMA_BASE_URL', 'OLLAMA_MODEL', 'OLLAMA_VISION_MODEL'];

beforeEach(() => {
  for (const k of KEYS) vi.stubEnv(k, '');
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const status = (code: number) => new Response('{}', { status: code });

type Call = [string, { headers: Record<string, string>; body: string }];
const call = (m: ReturnType<typeof vi.fn>, i = 0) => m.mock.calls[i] as unknown as Call;

describe('provider selection', () => {
  it('is rules-only with no key and no base URL', async () => {
    expect(resolveAiProvider(process.env)).toBeNull();
    expect(aiStatus()).toEqual({ mode: 'rules', label: 'Rules-only mode' });
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    expect(await askAi({ system: 's', user: 'u' })).toEqual({ ok: false, reason: 'no_key' });
    expect(f).not.toHaveBeenCalled();
  });

  it('uses Ollama cloud by default when OLLAMA_API_KEY is set', () => {
    vi.stubEnv('OLLAMA_API_KEY', 'k');
    vi.stubEnv('OLLAMA_MODEL', 'qwen3-coder:480b');
    expect(aiStatus()).toEqual({ mode: 'ai', label: 'Ollama cloud: qwen3-coder:480b' });
  });

  it('can use a local Ollama server without a key', () => {
    vi.stubEnv('OLLAMA_BASE_URL', 'http://localhost:11434');
    expect(aiStatus().label).toBe('Ollama local: llama3.1');
  });
});

describe('Ollama chat', () => {
  it('posts to /api/chat with Bearer auth, temperature 0, JSON format and streaming, and joins the stream', async () => {
    vi.stubEnv('OLLAMA_API_KEY', 'oll-key');
    const f = vi.fn(async () => ollamaStream('{"a":', '1}'));
    vi.stubGlobal('fetch', f);
    const tokens: string[] = [];
    const r = await askAi({ system: 'sys', user: [{ type: 'text', text: 'one' }, { type: 'text', text: 'two' }], onToken: (t) => tokens.push(t) });
    expect(r).toEqual({ ok: true, text: '{"a":1}', model: 'gpt-oss:120b' });
    expect(tokens).toEqual(['{"a":', '1}']);
    const [url, init] = call(f);
    expect(url).toBe('https://ollama.com/api/chat');
    expect(init.headers.authorization).toBe('Bearer oll-key');
    expect(init.headers['x-api-key']).toBeUndefined();
    const body = JSON.parse(init.body) as { model: string; stream: boolean; format: string; options: { temperature: number }; messages: { role: string; content: string }[] };
    expect(body).toMatchObject({ model: 'gpt-oss:120b', stream: true, format: 'json', options: { temperature: 0 } });
    expect(body.messages.map((m) => m.role)).toEqual(['system', 'user']);
    expect(body.messages[1]!.content).toBe('one\n\ntwo');
  });

  it('honours OLLAMA_BASE_URL and sends no auth header to a local server', async () => {
    vi.stubEnv('OLLAMA_BASE_URL', 'http://localhost:11434/');
    const f = vi.fn(async () => ollamaStream('hi'));
    vi.stubGlobal('fetch', f);
    expect(await askAi({ system: 's', user: 'u' })).toMatchObject({ ok: true, text: 'hi' });
    expect(call(f)[0]).toBe('http://localhost:11434/api/chat');
    expect(call(f)[1].headers.authorization).toBeUndefined();
  });

  it('sends images as base64 to the vision model', async () => {
    vi.stubEnv('OLLAMA_API_KEY', 'k');
    vi.stubEnv('OLLAMA_VISION_MODEL', 'qwen3-vl:235b');
    const f = vi.fn(async () => ollamaStream('{}'));
    vi.stubGlobal('fetch', f);
    await askAi({ system: 's', user: [{ type: 'image', mediaType: 'image/png', base64: 'AAA' }, { type: 'text', text: 'read' }] });
    const body = JSON.parse(call(f)[1].body) as { model: string; messages: { images?: string[] }[] };
    expect(body.model).toBe('qwen3-vl:235b');
    expect(body.messages[1]!.images).toEqual(['AAA']);
  });

  it('reports a PDF document as unsupported without calling out', async () => {
    vi.stubEnv('OLLAMA_API_KEY', 'k');
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    expect(await askAi({ system: 's', user: [{ type: 'document', mediaType: 'application/pdf', base64: 'A' }] })).toEqual({ ok: false, reason: 'unsupported' });
    expect(f).not.toHaveBeenCalled();
  });

  it('maps 401, 403 and 429 to friendly reasons without retrying', async () => {
    vi.stubEnv('OLLAMA_API_KEY', 'k');
    for (const [code, reason] of [[401, 'unauthorized'], [403, 'forbidden'], [429, 'rate_limited']] as const) {
      const f = vi.fn(async () => status(code));
      vi.stubGlobal('fetch', f);
      expect(await askAi({ system: 's', user: 'u' })).toEqual({ ok: false, reason });
      expect(f).toHaveBeenCalledOnce();
    }
  });

  it('retries once on a network error or 5xx, then gives up', async () => {
    vi.stubEnv('OLLAMA_API_KEY', 'k');
    const flaky = vi.fn().mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce(ollamaStream('ok'));
    vi.stubGlobal('fetch', flaky);
    expect(await askAi({ system: 's', user: 'u' })).toMatchObject({ ok: true, text: 'ok' });
    expect(flaky).toHaveBeenCalledTimes(2);

    const broken = vi.fn(async () => status(500));
    vi.stubGlobal('fetch', broken);
    expect(await askAi({ system: 's', user: 'u' })).toEqual({ ok: false, reason: 'bad_status' });
    expect(broken).toHaveBeenCalledTimes(2);

    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('down'); }));
    expect(await askAi({ system: 's', user: 'u' })).toEqual({ ok: false, reason: 'unreachable' });
  });

  it('treats an empty stream as empty', async () => {
    vi.stubEnv('OLLAMA_API_KEY', 'k');
    vi.stubGlobal('fetch', vi.fn(async () => ollamaStream()));
    expect(await askAi({ system: 's', user: 'u' })).toEqual({ ok: false, reason: 'empty' });
  });
});

describe('groundVerbatim', () => {
  it('keeps values found word-for-word (ignoring case and spacing) and drops the rest', () => {
    const { kept, dropped } = groundVerbatim(
      [{ value: 'FS/2026/00123' }, { value: 'valid  until 11/03/2026' }, { value: '31 Dec 2030' }, { value: '' }],
      'Certificate No: FS/2026/00123\nValid until 11/03/2026',
    );
    expect(kept.map((k) => k.value)).toEqual(['FS/2026/00123', 'valid  until 11/03/2026']);
    expect(dropped.map((d) => d.value)).toEqual(['31 Dec 2030', '']);
  });
});

describe('extractJsonObject', () => {
  it('finds JSON inside fences and rejects non-objects', () => {
    expect(extractJsonObject('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJsonObject('[1,2]')).toBeNull();
    expect(extractJsonObject('nothing')).toBeNull();
  });
});
