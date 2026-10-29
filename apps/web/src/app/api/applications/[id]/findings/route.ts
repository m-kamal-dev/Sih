import { NextResponse, type NextRequest } from 'next/server';
import { getFindings, getSignalStrengths } from '@/.data/store';
import type { FindingClass, Severity } from '@evidencegraph/domain';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const role = request.headers.get('x-eg-role') ?? 'scrutiny_officer';
  if (role === 'applicant') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const url = new URL(request.url);
  const cls = url.searchParams.get('class') as FindingClass | null;
  const sev = url.searchParams.get('severity') as Severity | null;

  let findings = getFindings(id);
  if (cls) findings = findings.filter((f) => f.findingClass === cls);
  if (sev) findings = findings.filter((f) => f.severity === sev);

  const signalStrengths = getSignalStrengths();

  return NextResponse.json({ findings, signalStrengths });
}
