import { type NextRequest } from 'next/server';
import { assembleDataset } from '@evidencegraph/fixtures';
import type { Finding, Rule } from '@evidencegraph/domain';
import { getRules } from '@/.data/store';
import { apiError, apiSuccess } from '@/lib/api-response';
import { requireRole } from '@/lib/api-auth';
import { readRuleDraft, ruleTestResults, validateRuleVersion } from '@/lib/rule-admin';

function signature(finding: Finding): string {
  return JSON.stringify({
    findingClass: finding.findingClass,
    severity: finding.severity,
    summary: finding.summary,
    evidence: finding.evidence,
  });
}

function replayDiff(baseRules: Rule[], draft: Rule) {
  const activeRuleError = validateRuleVersion(draft, baseRules);
  if (activeRuleError) return { error: activeRuleError };

  const updatedRules = baseRules.map((rule) => rule.id === draft.id ? draft : rule);
  const baseline = assembleDataset(baseRules).findings.filter((finding) => finding.ruleId === draft.id);
  const replayed = assembleDataset(updatedRules).findings.filter((finding) => finding.ruleId === draft.id);
  const baselineByApp = new Map(baseline.map((finding) => [finding.applicationId, finding]));
  const replayedByApp = new Map(replayed.map((finding) => [finding.applicationId, finding]));
  const activeRule = baseRules.find((rule) => rule.id === draft.id);
  if (!activeRule) return { error: `Rule ${draft.id} is not part of the active pack.` };
  const applications = new Set([...baselineByApp.keys(), ...replayedByApp.keys()]);
  const changed: Array<{ applicationId: string; before: Finding; after: Finding }> = [];
  const added: Finding[] = [];
  const cleared: Finding[] = [];

  for (const applicationId of applications) {
    const before = baselineByApp.get(applicationId);
    const after = replayedByApp.get(applicationId);
    if (!before && after) added.push(after);
    else if (before && !after) cleared.push(before);
    else if (before && after && signature(before) !== signature(after)) changed.push({ applicationId, before, after });
  }

  return {
    ruleId: draft.id,
    fromVersion: activeRule.version,
    toVersion: draft.version,
    summary: { changed: changed.length, new: added.length, cleared: cleared.length },
    changed,
    added,
    cleared,
  };
}

export async function POST(request: NextRequest) {
  const role = requireRole(request, ['rule_admin']);
  if (typeof role !== 'string') return role;

  const parsed = await readRuleDraft(request);
  if (!parsed.ok) return parsed.response;
  const activeRules = getRules();
  const versionError = validateRuleVersion(parsed.rule, activeRules);
  if (versionError) return apiError('VALIDATION_FAILED', versionError, 409);
  const tests = ruleTestResults(parsed.rule);
  if (!tests.passed) return apiError('VALIDATION_FAILED', 'Rule tests must pass before replay.', 422, tests);

  const diff = replayDiff(activeRules, parsed.rule);
  if ('error' in diff && typeof diff.error === 'string') return apiError('VALIDATION_FAILED', diff.error, 409);
  return apiSuccess({ ...diff, tests: tests.tests });
}
