import { type NextRequest } from 'next/server';
import { IdempotencyConflictError, applyCorrection } from '@/.data/store';
import { z } from 'zod';
import { apiError, apiSuccess } from '@/lib/api-response';
import { INTERNAL_ROLES, requireRole } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

const CorrectBody = z.object({
  correctedValue: z.union([z.string(), z.number()]),
}).strict();

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; factId: string }> },
) {
  const { id, factId } = await params;
  const role = requireRole(request, INTERNAL_ROLES);
  if (typeof role !== 'string') return role;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError('VALIDATION_FAILED', 'Invalid JSON payload', 400);
  }

  const parsed = CorrectBody.safeParse(body);
  if (!parsed.success) {
    return apiError('VALIDATION_FAILED', 'Invalid request body', 400, parsed.error.format());
  }

  const idempotencyKey = request.headers.get('idempotency-key') ?? undefined;

  try {
    const fact = applyCorrection(id, factId, parsed.data.correctedValue, role, idempotencyKey);
    return apiSuccess(fact, { request });
  } catch (e) {
    if (e instanceof IdempotencyConflictError) {
      return apiError('IDEMPOTENCY_CONFLICT', e.message, 409);
    }
    const message = e instanceof Error ? e.message : String(e);
    return apiError('RESOURCE_NOT_FOUND', message, 404);
  }
}
