import { type NextRequest } from 'next/server';
import { apiError, apiSuccess } from '@/lib/api-response';
import { authorizeCase } from '@/lib/api-auth';
import { briefCase, contextSignature, loadCaseContext, suggestedQuestions, type CaseBrief } from '@/lib/ai-case';

export const dynamic = 'force-dynamic';

/** Real AI briefs are cached until the case changes, so reopening a case does not cost another model call. */
const MAX_CACHED = 50;
const cache = new Map<string, CaseBrief>();

/** AI brief for one case. Internal roles only (applicants get 403 from authorizeCase). */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = authorizeCase(request, id);
  if (!auth.ok) return auth.response;

  const ctx = loadCaseContext(id);
  if (!ctx) return apiError('RESOURCE_NOT_FOUND', `Case ${id} not found`, 404);

  const key = `${id}#${contextSignature(ctx)}`;
  let brief = cache.get(key);
  if (!brief) {
    brief = await briefCase(ctx);
    if (brief.mode === 'ai') {
      if (cache.size >= MAX_CACHED) cache.delete(cache.keys().next().value as string);
      cache.set(key, brief);
    }
  }
  return apiSuccess({ brief, suggestedQuestions: suggestedQuestions(ctx) });
}
