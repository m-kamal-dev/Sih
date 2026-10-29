/**
 * Single place in the web app that talks to an AI provider. Every AI feature
 * goes through `askAi`, which delegates to the engine's provider interface
 * (Ollama hosted API by default, see packages/engine/src/aiprovider.ts).
 *
 * The function never throws: callers get `{ ok: false, reason }` and fall back
 * to the deterministic rules path. No key means `reason: 'no_key'`.
 */
import { aiFailureNote, aiStatusLabel, resolveAiProvider, type AiContent, type AiFailure, type AiResult } from '@evidencegraph/engine';

export type { AiFailure, AiResult };

export type AiRequest = {
  system: string;
  /** Plain text, or content parts (text, base64 image, base64 document). */
  user: string | AiContent[];
  timeoutMs?: number;
  onToken?: (chunk: string) => void;
};

/** The provider label for the status pill, or "Rules-only mode". */
export function aiStatus(): { mode: 'ai' | 'rules'; label: string } {
  const label = aiStatusLabel(process.env);
  return { mode: label === 'Rules-only mode' ? 'rules' : 'ai', label };
}

export function failureNote(reason: AiFailure): string {
  return aiFailureNote(reason);
}

/** Shown when no provider is configured. */
export const NO_KEY_HELP = 'no AI key is set on the server. Add OLLAMA_API_KEY in apps/web/.env.local to turn on AI reading';

export async function askAi(req: AiRequest): Promise<AiResult> {
  const provider = resolveAiProvider(process.env);
  if (!provider) return { ok: false, reason: 'no_key' };
  return provider.chat({ system: req.system, user: req.user, json: true, timeoutMs: req.timeoutMs, onToken: req.onToken });
}

/** Pull the first JSON object out of a model reply (it may add text or code fences). */
export function extractJsonObject(raw: string): Record<string, unknown> | null {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const data: unknown = JSON.parse(raw.slice(start, end + 1));
    return data && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
