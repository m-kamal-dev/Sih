import { type NextRequest } from 'next/server';
import { getSummary, getDocuments, getFacts, getFindings, getVerifications, getConflicts, getLetter } from '@/.data/store';
import { apiError, apiSuccess } from '@/lib/api-response';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const role = request.headers.get('x-eg-role') ?? 'scrutiny_officer';

  const summary = getSummary(id);
  if (!summary) {
    return apiError('RESOURCE_NOT_FOUND', `Application ${id} not found`, 404);
  }

  // Applicant pin check
  if (role === 'applicant') {
    const pin = request.headers.get('x-eg-pin') ?? '';
    if (summary.institution.applicantRolePin !== pin) {
      return apiError('FORBIDDEN_ROLE', 'Applicant PIN mismatch or missing', 403);
    }
  }

  const documents = getDocuments(id);
  const facts = getFacts(id);
  let findings = getFindings(id);
  // Applicant: no forensic/anomaly findings
  if (role === 'applicant') {
    findings = findings.filter((f) => f.findingClass !== 'anomaly_signal');
  }
  const verifications = getVerifications(id);
  const conflicts = getConflicts(id);
  const letter = getLetter(id) ?? null;

  return apiSuccess(
    {
      summary,
      institution: summary.institution,
      documents,
      facts,
      findings,
      verifications,
      conflicts,
      letter,
    },
    { request },
  );
}
