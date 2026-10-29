import { type NextRequest } from 'next/server';
import { getFindings, getLetter, getSummary } from '@/.data/store';
import { apiError, apiSuccess } from '@/lib/api-response';
import { requireRole } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const role = requireRole(request, ['scrutiny_officer', 'senior_reviewer', 'auditor', 'rule_admin']);
  if (typeof role !== 'string') return role;
  const summary = getSummary(id);
  if (!summary) {
    return apiError('RESOURCE_NOT_FOUND', `Case ${id} not found`, 404);
  }

  const findings = getFindings(id);
  const letter = getLetter(id);

  return apiSuccess(
    {
      caseId: id,
      summary,
      findings,
      notice: letter,
    },
    { request },
  );
}
