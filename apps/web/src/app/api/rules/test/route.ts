import { type NextRequest } from 'next/server';
import { apiError, apiSuccess } from '@/lib/api-response';
import { readRuleDraft, ruleTestResults } from '@/lib/rule-admin';
import { requireRole } from '@/lib/api-auth';

export async function POST(request: NextRequest) {
  const role = requireRole(request, ['rule_admin']);
  if (typeof role !== 'string') return role;

  const parsed = await readRuleDraft(request);
  if (!parsed.ok) return parsed.response;
  const result = ruleTestResults(parsed.rule);
  return result.passed
    ? apiSuccess({ ruleId: parsed.rule.id, version: parsed.rule.version, ...result })
    : apiError('VALIDATION_FAILED', 'One or more rule tests failed.', 422, {
      ruleId: parsed.rule.id,
      version: parsed.rule.version,
      ...result,
    });
}
