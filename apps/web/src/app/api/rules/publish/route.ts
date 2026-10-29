import { type NextRequest } from 'next/server';
import { getRules, publishRulePack } from '@/.data/store';
import { apiError, apiSuccess } from '@/lib/api-response';
import { requireRole } from '@/lib/api-auth';
import { readRuleDraft, ruleTestResults, validateRuleVersion } from '@/lib/rule-admin';

export async function POST(request: NextRequest) {
  const role = requireRole(request, ['rule_admin']);
  if (typeof role !== 'string') return role;

  const parsed = await readRuleDraft(request);
  if (!parsed.ok) return parsed.response;
  const { author, secondApprover } = parsed.body;
  if (!author || !secondApprover) {
    return apiError('VALIDATION_FAILED', 'Author and second approver names are required.', 400);
  }
  if (author.trim().toLowerCase() === secondApprover.trim().toLowerCase()) {
    return apiError('VALIDATION_FAILED', 'The second approver must be a different person from the author.', 400);
  }

  const activeRules = getRules();
  const versionError = validateRuleVersion(parsed.rule, activeRules);
  if (versionError) return apiError('VALIDATION_FAILED', versionError, 409);
  const tests = ruleTestResults(parsed.rule);
  if (!tests.passed) return apiError('VALIDATION_FAILED', 'Rule tests must pass before publishing.', 422, tests);

  const rules = activeRules.map((rule) => rule.id === parsed.rule.id ? parsed.rule : rule);
  try {
    const auditRow = publishRulePack(rules, author, secondApprover);
    return apiSuccess({ published: true, ruleId: parsed.rule.id, version: parsed.rule.version, auditRow });
  } catch (error) {
    if (error instanceof Error && error.message.includes('different person')) {
      return apiError('VALIDATION_FAILED', error.message, 400);
    }
    console.error('Failed to persist a tested rule publication.', error);
    return apiError('INTERNAL_ERROR', 'The tested rule could not be persisted.', 500);
  }
}
