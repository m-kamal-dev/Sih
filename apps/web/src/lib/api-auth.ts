import type { NextRequest, NextResponse } from 'next/server';
import type { ApplicationSummary } from '@evidencegraph/domain';
import { getSummary } from '@/.data/store';
import { apiError } from '@/lib/api-response';

export const DEMO_ROLES = [
  'scrutiny_officer',
  'senior_reviewer',
  'auditor',
  'rule_admin',
  'applicant',
] as const;

export type DemoRole = (typeof DEMO_ROLES)[number];
export const INTERNAL_ROLES = DEMO_ROLES.filter((role) => role !== 'applicant');

export function requireRole(
  request: NextRequest,
  allowedRoles: readonly DemoRole[],
): DemoRole | NextResponse {
  const role = request.headers.get('x-eg-role') ?? 'scrutiny_officer';
  if (!DEMO_ROLES.includes(role as DemoRole)) {
    return apiError('FORBIDDEN_ROLE', 'The requested demo role is not recognized.', 403);
  }
  if (!allowedRoles.includes(role as DemoRole)) {
    return apiError('FORBIDDEN_ROLE', 'This role is not allowed to perform this action.', 403);
  }
  return role as DemoRole;
}

export type CaseAuthorization =
  | { ok: true; summary: ApplicationSummary; role: DemoRole }
  | { ok: false; response: NextResponse };

export function authorizeCase(
  request: NextRequest,
  id: string,
  options: { applicantMayReadOwnHeader?: boolean } = {},
): CaseAuthorization {
  const summary = getSummary(id);
  if (!summary) {
    return { ok: false, response: apiError('RESOURCE_NOT_FOUND', `Case ${id} not found`, 404) };
  }

  const role = requireRole(request, DEMO_ROLES);
  if (typeof role !== 'string') return { ok: false, response: role };
  if (role === 'applicant') {
    const pin = request.headers.get('x-eg-pin') ?? '';
    const applicantCaseId = request.headers.get('x-eg-app-id') ?? '';
    if (
      !options.applicantMayReadOwnHeader ||
      applicantCaseId !== id ||
      !pin ||
      summary.institution.applicantRolePin !== pin
    ) {
      return { ok: false, response: apiError('FORBIDDEN_ROLE', 'Applicant access could not be verified for this case.', 403) };
    }
  }
  return { ok: true, summary, role };
}
