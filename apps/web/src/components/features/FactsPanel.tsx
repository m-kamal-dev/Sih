'use client';
import { factKeyLabel } from '@/lib/constants';
import { useQuery } from '@tanstack/react-query';
import type { Fact, Bbox } from '@evidencegraph/domain';
import { useRoleStore } from '@/store/role-store';
import { ConfidenceBar } from '@/components/atoms/ConfidenceBar';
import { Timestamp } from '@/components/atoms/Timestamp';
import { Spinner } from '@/components/atoms/Spinner';
import { ShieldAlert } from 'lucide-react';

interface FactsPanelProps {
  appId: string;
  selectedFactId?: string | null;
  onFactSelect: (id: string, bbox: Bbox | null) => void;
}

export function FactsPanel({ appId, selectedFactId, onFactSelect }: FactsPanelProps) {
  const { role } = useRoleStore();

  const { data: facts, isLoading } = useQuery<Fact[]>({
    queryKey: ['facts', appId],
    queryFn: async () => {
      const res = await fetch(`/api/applications/${appId}/facts`, { headers: { 'x-eg-role': role } });
      return res.json() as Promise<Fact[]>;
    },
  });

  if (isLoading) return <div style={{ padding: 16, display: 'flex', gap: 8, color: 'var(--color-text-muted)' }}><Spinner />Loading facts…</div>;

  // Group by document
  const byDoc = new Map<string | null, Fact[]>();
  for (const f of (facts ?? [])) {
    const key = f.documentId;
    const list = byDoc.get(key) ?? [];
    list.push(f);
    byDoc.set(key, list);
  }

  return (
    <div tabIndex={0} role="region" aria-label="Extracted facts" style={{ overflow: 'auto', height: '100%' }}>
      {[...byDoc.entries()].map(([docId, docFacts]) => (
        <div key={docId ?? 'no-doc'}>
          <div style={{ padding: '8px 12px', fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)', background: 'var(--color-raised)', borderBottom: '1px solid var(--color-border)', position: 'sticky', top: 0, zIndex: 1 }}>
            {docId ?? 'Issuer / Record facts'}
          </div>
          {docFacts.map((fact) => (
            <FactRow
              key={fact.id}
              fact={fact}
              selected={selectedFactId === fact.id}
              onClick={() => onFactSelect(fact.id, fact.bbox ?? null)}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function FactRow({ fact, selected, onClick }: { fact: Fact; selected: boolean; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: '10px 12px',
        borderBottom: '1px solid var(--color-border)',
        cursor: 'pointer',
        background: selected ? 'color-mix(in srgb, var(--color-accent) 8%, transparent)' : 'transparent',
        transition: 'background 120ms ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-accent-text)' }} title={fact.key}>{factKeyLabel(fact.key)}</span>
        {fact.supersededBy && (
          <span style={{ fontSize: 10, color: 'var(--color-text-faint)', padding: '1px 5px', border: '1px solid var(--color-border)', borderRadius: 3 }}>SUPERSEDED</span>
        )}
        {fact.quarantine && !fact.supersededBy && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: 'var(--color-validity)', padding: '1px 5px', background: 'color-mix(in srgb, var(--color-validity) 12%, transparent)', borderRadius: 3 }}>
            <ShieldAlert size={10} />HELD AT GATE
          </span>
        )}
      </div>
      <div style={{ fontSize: 13, color: 'var(--color-text)', marginBottom: 4 }}>
        {fact.value === null ? <em style={{ color: 'var(--color-text-faint)' }}>null</em> : String(fact.value)}
        {fact.unit && <span style={{ color: 'var(--color-text-muted)', marginLeft: 4, fontSize: 11 }}>{fact.unit}</span>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <ConfidenceBar value={fact.confidence} showLabel height={3} />
        <span style={{ fontSize: 10, color: 'var(--color-text-faint)' }}>{fact.source}</span>
        {fact.asOf && <Timestamp iso={fact.asOf} mode="date" />}
      </div>
      {fact.quarantine && !fact.supersededBy && (
        <div style={{ marginTop: 4, fontSize: 11, color: 'var(--color-validity)', fontStyle: 'italic' }}>{fact.quarantine}</div>
      )}
    </div>
  );
}
