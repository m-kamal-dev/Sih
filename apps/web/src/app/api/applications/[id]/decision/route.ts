import { type NextRequest } from 'next/server';
import { IdempotencyConflictError, applyDecision } from '@/.data/store';
import { z } from 'zod';
import { apiError, apiSuccess } from '@/lib/api-response';
import { INTERNAL_ROLES, requireRole } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

const DecisionBody = z.object({
  findingId: z.string().min(1),
  action: z.enum(['accept', 'dismiss', 'escalate']),
  reason: z.string().min(1, 'Reason is required'),
}).strict();

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const role = requireRole(request, INTERNAL_ROLES);
  if (typeof role !== 'string') return role;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError('VALIDATION_FAILED', 'Invalid JSON payload', 400);
  }

  const parsed = DecisionBody.safeParse(body);
  if (!parsed.success) {
    return apiError('VALIDATION_FAILED', 'Invalid request body', 400, parsed.error.format());
  }

  const { findingId, action, reason } = parsed.data;

  // Role check for escalate
  if (action === 'escalate' && role !== 'senior_reviewer') {
    return apiError('FORBIDDEN_ROLE', 'Only senior_reviewer can escalate findings', 403);
  }

  const idempotencyKey = request.headers.get('idempotency-key') ?? undefined;

  try {
    const ledgerRow = applyDecision(id, findingId, action, reason, role, idempotencyKey);
    return apiSuccess({ ledgerRow }, { status: 200 });
  } catch (e) {
    if (e instanceof IdempotencyConflictError) {
      return apiError('IDEMPOTENCY_CONFLICT', e.message, 409);
    }
    const message = e instanceof Error ? e.message : String(e);
    return apiError('RESOURCE_NOT_FOUND', message, 404);
  }
}
