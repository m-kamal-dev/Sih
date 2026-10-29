import { type NextRequest } from 'next/server';
import { getLedger, tamperLedgerRow, getVerifyResult, getDailyDigest } from '@/.data/store';
import { z } from 'zod';
import { apiError, apiSuccess } from '@/lib/api-response';
import { requireRole } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const role = requireRole(request, ['auditor', 'senior_reviewer', 'scrutiny_officer', 'rule_admin']);
  if (typeof role !== 'string') return role;

  const rows = getLedger();
  const integrity = getVerifyResult();
  const digest = getDailyDigest();

  return apiSuccess({ rows, integrity, digest }, { request });
}

const TamperBody = z.object({
  seq: z.number().int().positive(),
  patch: z.record(z.unknown()),
}).strict();

export async function POST(request: NextRequest) {
  const role = requireRole(request, ['auditor', 'senior_reviewer']);
  if (typeof role !== 'string') return role;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError('VALIDATION_FAILED', 'Invalid JSON payload', 400);
  }

  const parsed = TamperBody.safeParse(body);
  if (!parsed.success) {
    return apiError('VALIDATION_FAILED', 'Invalid request body', 400, parsed.error.format());
  }

  try {
    const row = tamperLedgerRow(parsed.data.seq, parsed.data.patch);
    const integrity = getVerifyResult();
    return apiSuccess({ row, integrity });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return apiError('INTERNAL_ERROR', message, 400);
  }
}
