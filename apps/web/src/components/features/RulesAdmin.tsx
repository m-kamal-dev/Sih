'use client';
import { useQuery } from '@tanstack/react-query';
import type { Rule } from '@evidencegraph/domain';
import { useRoleStore } from '@/store/role-store';
import { Spinner } from '@/components/atoms/Spinner';
import { FindingChip } from '@/components/atoms/FindingChip';
import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

export function RulesAdmin() {
  const { role } = useRoleStore();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const { data, isLoading, error, refetch } = useQuery<{ rules: Rule[]; ruleCount: number }>({
    queryKey: ['rules'],
    queryFn: async () => {
      const res = await fetch('/api/rules', { headers: { 'x-eg-role': role } });
      if (!res.ok) throw new Error('Failed to load rules');
      return res.json() as Promise<{ rules: Rule[]; ruleCount: number }>;
    },
  });

  if (isLoading) return <div style={{ padding: 24, display: 'flex', gap: 8, color: 'var(--color-text-muted)' }}><Spinner />Loading rules…</div>;
  if (error) return <div style={{ padding: 24, color: 'var(--color-alert)', fontSize: 13 }}>Could not load rules. <button onClick={() => refetch()} style={{ background: 'none', border: '1px solid var(--color-border)', borderRadius: 4, color: 'var(--color-text)', cursor: 'pointer' }}>Retry</button></div>;

  const rules = data?.rules ?? [];

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 16, fontSize: 13, color: 'var(--color-text-muted)' }}>
        {rules.length} rules in pack · {rules.filter((r) => !r.clauseConfirmed).length} with unconfirmed clause references
        <span style={{ display: 'block', marginTop: 2, fontSize: 12, color: 'var(--color-text-faint)' }}>
          Each rule runs automatically against every application pack. When a rule fails, the system opens a finding for officer review — it never blocks one by itself. Click a rule to see its condition and built-in tests.
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {rules.map((rule) => {
          const isExpanded = expanded.has(rule.id);
          return (
            <div key={rule.id} style={{ background: 'var(--color-surface)', border: `1px solid ${rule.clauseConfirmed ? 'var(--color-border)' : 'var(--color-validity)'}`, borderRadius: 8, overflow: 'hidden' }}>
              <button
                onClick={() => setExpanded((s) => { const next = new Set(s); if (next.has(rule.id)) next.delete(rule.id); else next.add(rule.id); return next; })}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                aria-expanded={isExpanded}
              >
                {isExpanded ? <ChevronDown size={13} style={{ color: 'var(--color-text-muted)' }} /> : <ChevronRight size={13} style={{ color: 'var(--color-text-muted)' }} />}
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--color-ok)', width: 200, flexShrink: 0 }}>{rule.id}</span>
                <span style={{ fontSize: 11, color: 'var(--color-text-muted)', width: 80 }}>v{rule.version}</span>
                <span style={{ fontSize: 11, color: 'var(--color-text-faint)', flex: 1 }}>{rule.aphRef}</span>
                <FindingChip findingClass={rule.onFail.class} />
                {!rule.clauseConfirmed && (
                  <span style={{ fontSize: 10, color: 'var(--color-validity)', padding: '1px 6px', border: '1px solid var(--color-validity)', borderRadius: 3 }}>UNCONFIRMED REF</span>
                )}
              </button>
              {isExpanded && (
                <div style={{ padding: '12px 16px', borderTop: '1px solid var(--color-border)' }}>
                  <div style={{ marginBottom: 10 }}>
                    <span style={{ fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 4, display: 'block', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Assert</span>
                    <code style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--color-ok)', background: 'var(--color-canvas)', padding: '6px 10px', borderRadius: 4, display: 'block' }}>{rule.assert}</code>
                  </div>
                  <div>
                    <span style={{ fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 4, display: 'block', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Tests ({rule.tests.length})</span>
                    {rule.tests.map((t, i) => (
                      <div key={i} style={{ fontSize: 12, color: 'var(--color-text-muted)', padding: '3px 0' }}>
                        <span style={{ color: t.expect === 'pass' ? 'var(--color-verified)' : 'var(--color-mismatch)' }}>●</span>
                        {' '}{t.name} → <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{t.expect}</code>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
