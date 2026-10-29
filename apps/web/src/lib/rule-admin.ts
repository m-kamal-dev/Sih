import type { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { RuleLoadError, parseRuleYaml, runRuleTests } from '@evidencegraph/engine';
import type { Rule } from '@evidencegraph/domain';
import { apiError } from '@/lib/api-response';

const RuleDraftPayload = z.object({
  yaml: z.string().min(1, 'A YAML rule draft is required.'),
  author: z.string().trim().min(1).optional(),
  secondApprover: z.string().trim().min(1).optional(),
});

export type RuleDraftRequest = z.infer<typeof RuleDraftPayload>;
export type RuleDraftParseResult =
  | { ok: true; body: RuleDraftRequest; rule: Rule }
  | { ok: false; response: NextResponse };

export async function readRuleDraft(request: NextRequest): Promise<RuleDraftParseResult> {
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return {
      ok: false,
      response: apiError('VALIDATION_FAILED', 'Request body must be valid JSON.', 400),
    };
  }

  const payload = RuleDraftPayload.safeParse(input);
  if (!payload.success) {
    return {
      ok: false,
      response: apiError('VALIDATION_FAILED', 'Rule draft is invalid.', 400, payload.error.flatten()),
    };
  }

  try {
    return { ok: true, body: payload.data, rule: parseRuleYaml(payload.data.yaml, 'draft') };
  } catch (error) {
    if (error instanceof RuleLoadError) {
      return { ok: false, response: apiError('VALIDATION_FAILED', error.message, 400) };
    }
    throw error;
  }
}

export function ruleTestResults(rule: Rule) {
  const tests = runRuleTests(rule);
  return { tests, passed: tests.every((test) => test.passed) };
}

export function validateRuleVersion(draft: Rule, activeRules: Rule[]): string | null {
  const active = activeRules.find((rule) => rule.id === draft.id);
  if (!active) return `Rule ${draft.id} is not part of the active pack.`;
  if (draft.version !== active.version + 1) {
    return `Draft version must be exactly v${active.version + 1} for ${draft.id}.`;
  }
  return null;
}
