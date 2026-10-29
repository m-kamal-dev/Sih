import { type NextRequest } from 'next/server';
import { getCaseHeader } from '@/.data/store';
import { apiError, apiSuccess } from '@/lib/api-response';
import { authorizeCase } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const authorization = authorizeCase(request, id, { applicantMayReadOwnHeader: true });
  if (!authorization.ok) return authorization.response;

  const caseHeader = getCaseHeader(id);
  if (!caseHeader) return apiError('RESOURCE_NOT_FOUND', `Case ${id} not found`, 404);
  return apiSuccess(caseHeader, { request });
}
