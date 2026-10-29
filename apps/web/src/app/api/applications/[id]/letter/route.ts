import { type NextRequest } from 'next/server';
import { getLetter, releaseLetter, updateLetterDraft } from '@/.data/store';
import { z } from 'zod';
import { apiError, apiSuccess } from '@/lib/api-response';
import { INTERNAL_ROLES, requireRole } from '@/lib/api-auth';
import { containsBannedWord } from '@evidencegraph/engine';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const role = requireRole(request, INTERNAL_ROLES);
  if (typeof role !== 'string') return role;

  const letter = getLetter(id);
  if (!letter) {
    return apiError('RESOURCE_NOT_FOUND', `Letter for ${id} not found`, 404);
  }
  return apiSuccess(letter, { request });
}

const ReleaseBody = z.object({
  releasedBy: z.string().min(1),
});

const DraftBody = z.object({
  body: z.string().trim().min(1).max(40_000),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const role = requireRole(request, ['senior_reviewer']);
  if (typeof role !== 'string') return role;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError('VALIDATION_FAILED', 'Invalid JSON payload', 400);
  }
  const parsed = DraftBody.safeParse(body);
  if (!parsed.success) {
    return apiError('VALIDATION_FAILED', 'Letter draft must contain 1–40,000 characters.', 400, parsed.error.flatten());
  }
  if (containsBannedWord(parsed.data.body)) {
    return apiError('VALIDATION_FAILED', 'Letter draft contains wording that is not permitted.', 422);
  }
  if (!getLetter(id)) return apiError('RESOURCE_NOT_FOUND', `Letter for ${id} not found`, 404);

  try {
    const letter = updateLetterDraft(id, parsed.data.body, role);
    return apiSuccess(letter, { request });
  } catch (error) {
    if (error instanceof Error && error.message === 'A released letter cannot be edited.') {
      return apiError('ILLEGAL_TRANSITION', error.message, 409);
    }
    return apiError('INTERNAL_ERROR', 'The letter draft could not be saved.', 500);
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const role = requireRole(request, ['senior_reviewer']);
  if (typeof role !== 'string') return role;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError('VALIDATION_FAILED', 'Invalid JSON payload', 400);
  }

  const parsed = ReleaseBody.safeParse(body);
  if (!parsed.success) {
    return apiError('VALIDATION_FAILED', 'Invalid request body', 400, parsed.error.format());
  }

  try {
    const letter = releaseLetter(id, parsed.data.releasedBy);
    return apiSuccess(letter, { request });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return apiError('RESOURCE_NOT_FOUND', message, 404);
  }
}
