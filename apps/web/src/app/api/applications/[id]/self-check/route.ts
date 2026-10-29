/**
 * Self-check route — applicant-facing fix list.
 * Returns only completeness_gap and validity_gap findings (no anomaly signals,
 * no triage score, no other institutions' data) and no forensic detail.
 * Spec §12: "applicant: upload, self-check, own report, respond —
 *   cannot see forensic internals, triage scores, or other institutions."
 */
import { NextResponse, type NextRequest } from 'next/server';
import { getSummary, getFindings } from '@/.data/store';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const role = request.headers.get('x-eg-role') ?? 'applicant';

  const summary = getSummary(id);
  if (!summary) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // All roles can get the self-check list, but non-applicant roles see it via
  // the main findings endpoint. The self-check endpoint strips forensic detail.
  let findings = getFindings(id).filter(
    (f) => f.status === 'open' && f.findingClass !== 'anomaly_signal',
  );

  // Applicants see only their own application (no cross-application details).
  findings = findings.map((f) => ({
    ...f,
    // Strip cross-application details for the applicant view.
    relatedApplicationIds: role === 'applicant' ? [] : f.relatedApplicationIds,
    // Strip forensic detail fields.
    detail: undefined,
    suggestedAction: f.findingClass === 'completeness_gap' || f.findingClass === 'validity_gap'
      ? f.suggestedAction
      : undefined,
  }));

  return NextResponse.json({
    findings,
    institution: summary.institution.name,
    openCount: findings.length,
  });
}
