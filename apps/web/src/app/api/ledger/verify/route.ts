import { type NextRequest } from 'next/server';
import { getVerifyResult, getDailyDigest } from '@/.data/store';
import { apiError, apiSuccess } from '@/lib/api-response';
import { INTERNAL_ROLES, requireRole } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const role = requireRole(request, INTERNAL_ROLES);
  if (typeof role !== 'string') return role;
  const integrity = getVerifyResult();
  const digest = getDailyDigest();
  return apiSuccess({ integrity, digest }, { status: 200 });
}
