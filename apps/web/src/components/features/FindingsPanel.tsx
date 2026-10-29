'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { EvidenceRef, Finding, FindingClass } from '@evidencegraph/domain';
import { useRoleStore } from '@/store/role-store';
import { FindingChip } from '@/components/atoms/FindingChip';
import { Spinner } from '@/components/atoms/Spinner';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { FINDING_CLASS_LABELS } from '@/lib/constants';

interface FindingsPanelProps {
  appId: string;
  filterClass?: FindingClass;
  onEvidenceSelect?: (evidence: EvidenceRef) => void;
}

export function FindingsPanel({ appId, filterClass, onEvidenceSelect }: FindingsPanelProps) {
  const { role } = useRoleStore();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const { data, isLoading } = useQuery<{ findings: Finding[]; signalStrengths: Record<string, string> }>({
    queryKey: ['findings', appId, filterClass],
    queryFn: async () => {
      const url = filterClass ? `/api/applications/${appId}/findings?class=${filterClass}` : `/api/applications/${appId}/findings`;
      const res = await fetch(url, { headers: { 'x-eg-role': role } });
      return res.json() as Promise<{ findings: Finding[]; signalStrengths: Record<string, string> }>;
    },
  });

  if (isLoading) return <div style={{ padding: 16, display: 'flex', gap: 8, color: 'var(--color-text-muted)' }}><Spinner />Loading findings…</div>;

  const findings = data?.findings ?? [];
  const signalStrengths = data?.signalStrengths ?? {};

  // Group by class
  const byClass = new Map<FindingClass, Finding[]>();
  for (const f of findings) {
    const list = byClass.get(f.findingClass) ?? [];
    list.push(f);
    byClass.set(f.findingClass, list);
  }

  if (findings.length === 0) {
    return <div style={{ padding: 24, color: 'var(--color-verified)', fontSize: 13 }}>No findings{filterClass ? ` of class ${filterClass}` : ''}.</div>;
  }

  return (
    <div tabIndex={0} role="region" aria-label="Findings" style={{ overflow: 'auto' }}>
      {([...byClass.entries()] as [FindingClass, Finding[]][]).map(([cls, clsFindings]) => {
        const isCollapsed = collapsed.has(cls);
        return (
          <div key={cls} style={{ borderBottom: '1px solid var(--color-border)' }}>
            <button
              onClick={() => setCollapsed((s) => { const next = new Set(s); if (next.has(cls)) next.delete(cls); else next.add(cls); return next; })}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'var(--color-surface)', border: 'none', cursor: 'pointer', textAlign: 'left', borderBottom: '1px solid var(--color-border)' }}
              aria-expanded={!isCollapsed}
            >
              {isCollapsed ? <ChevronRight size={13} style={{ color: 'var(--color-text-muted)' }} /> : <ChevronDown size={13} style={{ color: 'var(--color-text-muted)' }} />}
              <FindingChip findingClass={cls} />
              <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--color-text-muted)' }}>{clsFindings.length}</span>
            </button>
            {!isCollapsed && clsFindings.map((f) => (
              <FindingCard key={f.id} finding={f} signalStrength={signalStrengths[f.id] as 'weak' | 'medium' | 'strong' | undefined} onEvidenceSelect={onEvidenceSelect} />
            ))}
          </div>
        );
      })}
    </div>
  );
}

function FindingCard({ finding, signalStrength, onEvidenceSelect }: { finding: Finding; signalStrength?: 'weak' | 'medium' | 'strong'; onEvidenceSelect?: (evidence: EvidenceRef) => void }) {
  const [expanded, setExpanded] = useState(false);
  const sevColor = finding.severity === 'high' ? 'var(--color-alert)' : finding.severity === 'medium' ? 'var(--color-validity)' : 'var(--color-text-muted)';

  return (
    <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-border)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, padding: '1px 5px', borderRadius: 3, color: sevColor, background: `color-mix(in srgb, ${sevColor} 12%, transparent)` }}>{finding.severity}</span>
            <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)' }}>{finding.ruleId}</span>
            <span style={{ fontSize: 11, color: 'var(--color-text-faint)' }}>{finding.aphRef}</span>
            {signalStrength && <span style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>({signalStrength})</span>}
          </div>
          <div style={{ fontSize: 13, color: 'var(--color-text)', lineHeight: 1.4 }}>{finding.summary}</div>
          {finding.status !== 'open' && (
            <div style={{ marginTop: 4, fontSize: 11, color: 'var(--color-verified)' }}>
              {finding.status.toUpperCase()} by {finding.decidedBy} — {finding.decisionReason}
            </div>
          )}
        </div>
        {finding.detail && (
          <button onClick={() => setExpanded((v) => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', flexShrink: 0 }}>
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        )}
      </div>
      {expanded && finding.detail && (
        <div style={{ marginTop: 8, padding: 10, background: 'var(--color-raised)', borderRadius: 6, fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
          {finding.detail}
        </div>
      )}
      {finding.suggestedAction && (
        <div style={{ marginTop: 6, fontSize: 11, color: 'var(--color-accent)', fontStyle: 'italic' }}>
          ▸ {finding.suggestedAction}
        </div>
      )}
      <div style={{ display: 'grid', gap: 5, marginTop: 8 }}>
        {finding.evidence.map((evidence, index) => evidence.kind === 'absence_receipt' ? (
          <div key={`${finding.id}-receipt-${index}`} role="note" style={{ padding: '8px 10px', border: '1px solid var(--color-border)', borderRadius: 6, background: 'var(--color-raised)', fontSize: 11, color: 'var(--color-text-muted)' }}>
            <strong style={{ display: 'block', color: 'var(--color-text)', fontWeight: 600 }}>Required item not found in the submission</strong>
            <span>Checklist slot: {evidence.checklist_slot} · Version: {evidence.checklist_version}</span>
          </div>
        ) : (
          <button
            key={`${finding.id}-evidence-${index}`}
            type="button"
            onClick={() => onEvidenceSelect?.(evidence)}
            disabled={!onEvidenceSelect}
            style={{ width: 'fit-content', padding: 0, border: 0, background: 'transparent', color: 'var(--color-accent)', fontSize: 11, textAlign: 'left', cursor: onEvidenceSelect ? 'pointer' : 'default' }}
          >
            View evidence · {evidence.factId ?? evidence.cropKey}
          </button>
        ))}
      </div>
    </div>
  );
}
