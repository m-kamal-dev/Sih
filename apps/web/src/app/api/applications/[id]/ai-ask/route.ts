import { type NextRequest } from 'next/server';
import { apiError, apiSuccess } from '@/lib/api-response';
import { authorizeCase } from '@/lib/api-auth';
import { askCase, loadCaseContext, MAX_QUESTION_CHARS } from '@/lib/ai-case';

export const dynamic = 'force-dynamic';

/** Ask a free-text question about one case. The answer cites the findings it used. Internal roles only. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = authorizeCase(request, id);
  if (!auth.ok) return auth.response;

  let question = '';
  try {
    const body = (await request.json()) as { question?: unknown };
    question = typeof body.question === 'string' ? body.question.trim() : '';
  } catch {
    return apiError('VALIDATION_FAILED', 'Send a JSON body like {"question": "..."}.', 400);
  }
  if (question.length < 3) return apiError('VALIDATION_FAILED', 'Type a question of at least a few words.', 422);
  if (question.length > MAX_QUESTION_CHARS) {
    return apiError('VALIDATION_FAILED', `Keep the question under ${MAX_QUESTION_CHARS} characters.`, 422);
  }

  const ctx = loadCaseContext(id);
  if (!ctx) return apiError('RESOURCE_NOT_FOUND', `Case ${id} not found`, 404);
  return apiSuccess(await askCase(ctx, question));
}
