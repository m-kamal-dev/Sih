/**
 * AI provider interface. The engine never depends on a specific vendor: the
 * web app asks `resolveAiProvider(env)` for whatever is configured and gets
 * `null` (rules-only mode) when nothing is. Providers never throw; failures
 * come back as a reason so callers can fall back to the deterministic path.
 *
 * Default: Ollama's hosted API (https://ollama.com) with an OLLAMA_API_KEY.
 * Optional: a local Ollama server (OLLAMA_BASE_URL=http://localhost:11434, no key).
 * In cloud mode the visible document text leaves this machine; hidden text never does.
 */

export type AiFailure =
  | 'no_key'
  | 'timeout'
  | 'unreachable'
  | 'unauthorized'
  | 'forbidden'
  | 'rate_limited'
  | 'bad_status'
  | 'empty'
  | 'unsupported';

export type AiResult = { ok: true; text: string; model: string } | { ok: false; reason: AiFailure };

/** Text, or a base64 image (image URLs are not supported by the hosted API). */
export type AiContent = { type: 'text'; text: string } | { type: 'image'; mediaType: string; base64: string } | { type: 'document'; mediaType: string; base64: string };

export interface AiChatRequest {
  system: string;
  user: string | AiContent[];
  /** Ask for a JSON object reply. Default true. */
  json?: boolean;
  timeoutMs?: number;
  /** Called with each streamed chunk of text, as it arrives. */
  onToken?: (chunk: string) => void;
}

export interface AiProvider {
  readonly id: 'ollama-cloud' | 'ollama-local';
  readonly model: string;
  /** Short label for the status pill, e.g. "Ollama cloud: gpt-oss:120b". */
  readonly label: string;
  chat(request: AiChatRequest): Promise<AiResult>;
}

export type AiEnv = Record<string, string | undefined>;

export const OLLAMA_CLOUD_URL = 'https://ollama.com';
export const OLLAMA_DEFAULT_CLOUD_MODEL = 'gpt-oss:120b'; // direct ollama.com API names have no "-cloud" suffix
export const OLLAMA_DEFAULT_LOCAL_MODEL = 'llama3.1';
const DEFAULT_TIMEOUT_MS = 120_000;

function read(env: AiEnv, name: string): string {
  return env[name]?.trim() ?? '';
}

/** Plain-language reason shown to the officer when the AI could not be used. */
export function aiFailureNote(reason: AiFailure): string {
  switch (reason) {
    case 'no_key':
      return 'no AI key is set on the server';
    case 'timeout':
      return 'the AI service took too long to answer';
    case 'unauthorized':
      return 'the AI service did not accept the key (401). Check OLLAMA_API_KEY';
    case 'forbidden':
      return 'the key is not allowed to use this model (403). Check OLLAMA_MODEL and your Ollama plan';
    case 'rate_limited':
      return 'the AI service is busy or the usage limit was reached (429). Try again in a minute';
    case 'bad_status':
      return 'the AI service returned an error';
    case 'empty':
      return 'the AI service sent an empty reply';
    case 'unsupported':
      return 'the AI service cannot read this kind of file';
    default:
      return 'the AI service could not be reached';
  }
}

type OllamaMessage = { role: 'system' | 'user'; content: string; images?: string[] };

function toMessages(req: AiChatRequest): { messages: OllamaMessage[]; hasImages: boolean } | 'unsupported' {
  const parts: AiContent[] = typeof req.user === 'string' ? [{ type: 'text', text: req.user }] : req.user;
  if (parts.some((p) => p.type === 'document')) return 'unsupported';
  const text = parts.filter((p): p is Extract<AiContent, { type: 'text' }> => p.type === 'text').map((p) => p.text).join('\n\n');
  const images = parts.filter((p): p is Extract<AiContent, { type: 'image' }> => p.type === 'image').map((p) => p.base64);
  const user: OllamaMessage = { role: 'user', content: text };
  if (images.length) user.images = images;
  return { messages: [{ role: 'system', content: req.system }, user], hasImages: images.length > 0 };
}

/** Reads Ollama's NDJSON stream (one JSON object per line) and joins message.content. */
async function readStream(res: Response, onToken?: (chunk: string) => void): Promise<string> {
  const handle = (line: string, out: string[]) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    try {
      const obj = JSON.parse(trimmed) as { message?: { content?: string }; error?: string };
      const chunk = obj.message?.content ?? '';
      if (chunk) {
        out.push(chunk);
        onToken?.(chunk);
      }
    } catch {
      /* ignore a partial or non-JSON line */
    }
  };
  const out: string[] = [];
  if (!res.body) {
    for (const line of (await res.text()).split('\n')) handle(line, out);
    return out.join('');
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) handle(line, out);
  }
  handle(buffer + decoder.decode(), out);
  return out.join('');
}

function statusReason(status: number): AiFailure {
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 429) return 'rate_limited';
  return 'bad_status';
}

class OllamaProvider implements AiProvider {
  readonly label: string;

  constructor(
    readonly id: 'ollama-cloud' | 'ollama-local',
    private readonly baseUrl: string,
    private readonly key: string,
    readonly model: string,
    private readonly visionModel: string,
  ) {
    this.label = `${id === 'ollama-cloud' ? 'Ollama cloud' : 'Ollama local'}: ${model}`;
  }

  async chat(req: AiChatRequest): Promise<AiResult> {
    const prepared = toMessages(req);
    if (prepared === 'unsupported') return { ok: false, reason: 'unsupported' };
    const model = prepared.hasImages ? this.visionModel : this.model;
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (this.key) headers.authorization = `Bearer ${this.key}`;
    const body = JSON.stringify({
      model,
      messages: prepared.messages,
      stream: true,
      ...(req.json === false ? {} : { format: 'json' }),
      options: { temperature: 0 },
    });

    // One retry for transient failures (network, timeout, 5xx). Auth and quota errors are not retried.
    let last: AiFailure = 'unreachable';
    for (let attempt = 0; attempt < 2; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), req.timeoutMs ?? DEFAULT_TIMEOUT_MS);
      try {
        const res = await fetch(`${this.baseUrl}/api/chat`, { method: 'POST', headers, body, signal: controller.signal });
        if (!res.ok) {
          last = statusReason(res.status);
          if (res.status < 500) return { ok: false, reason: last };
          continue;
        }
        const text = (await readStream(res, req.onToken)).trim();
        if (!text) return { ok: false, reason: 'empty' };
        return { ok: true, text, model };
      } catch (e) {
        last = e instanceof Error && e.name === 'AbortError' ? 'timeout' : 'unreachable';
      } finally {
        clearTimeout(timer);
      }
    }
    return { ok: false, reason: last };
  }
}

/**
 * The configured provider, or null for rules-only mode.
 *  - OLLAMA_API_KEY set → Ollama cloud (OLLAMA_BASE_URL, default https://ollama.com)
 *  - no key but OLLAMA_BASE_URL set → that (local) Ollama server, no auth
 */
export function resolveAiProvider(env: AiEnv): AiProvider | null {
  const key = read(env, 'OLLAMA_API_KEY');
  const base = read(env, 'OLLAMA_BASE_URL').replace(/\/+$/, '');
  if (key) {
    const model = read(env, 'OLLAMA_MODEL') || OLLAMA_DEFAULT_CLOUD_MODEL;
    return new OllamaProvider('ollama-cloud', base || OLLAMA_CLOUD_URL, key, model, read(env, 'OLLAMA_VISION_MODEL') || model);
  }
  if (base) {
    const model = read(env, 'OLLAMA_MODEL') || OLLAMA_DEFAULT_LOCAL_MODEL;
    return new OllamaProvider('ollama-local', base, '', model, read(env, 'OLLAMA_VISION_MODEL') || model);
  }
  return null;
}

/** Status pill text: "Ollama cloud: <model>" or "Rules-only mode". */
export function aiStatusLabel(env: AiEnv): string {
  return resolveAiProvider(env)?.label ?? 'Rules-only mode';
}

const normalise = (s: string) => s.toLowerCase().replace(/[\s ]+/g, ' ').replace(/[’‘]/g, "'").trim();

/**
 * Verbatim grounding: keeps only values that appear word-for-word (ignoring
 * case and spacing) in the source text. Everything else is dropped and
 * returned so it can be reported, never shown as if it were read.
 */
export function groundVerbatim<T extends { value: string }>(items: T[], source: string): { kept: T[]; dropped: T[] } {
  const haystack = normalise(source);
  const kept: T[] = [];
  const dropped: T[] = [];
  for (const item of items) (haystack.includes(normalise(item.value)) && normalise(item.value) ? kept : dropped).push(item);
  return { kept, dropped };
}
