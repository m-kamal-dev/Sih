import { type NextRequest } from 'next/server';
import { getRules } from '@/.data/store';
import { apiError, apiSuccess } from '@/lib/api-response';
import { DEMO_ROLES, requireRole } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const role = requireRole(request, DEMO_ROLES);
  if (typeof role !== 'string') return role;
  if (role === 'applicant') {
    return apiError('FORBIDDEN_ROLE', 'Applicants cannot access AICTE rule pack definitions.', 403);
  }
  const rules = getRules();
  return apiSuccess({ rules, ruleCount: rules.length }, { request });
}
