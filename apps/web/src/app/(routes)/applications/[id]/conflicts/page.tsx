'use client';
import { useQuery } from '@tanstack/react-query';
import { useRoleStore } from '@/store/role-store';
import type { ConflictRow } from '@evidencegraph/engine';
import { Spinner } from '@/components/atoms/Spinner';
import { Timestamp } from '@/components/atoms/Timestamp';
import { useParams } from 'next/navigation';

export default function ConflictsPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { role } = useRoleStore();

  const { data: conflicts, isLoading } = useQuery<ConflictRow[]>({
    queryKey: ['conflicts', id],
    queryFn: async () => {
      const res = await fetch(`/api/applications/${id}/conflicts`, { headers: { 'x-eg-role': role } });
      return res.json() as Promise<ConflictRow[]>;
    },
  });

  if (isLoading) return <div style={{ padding: 24, display: 'flex', gap: 8, color: 'var(--color-text-muted)' }}><Spinner />Loading conflicts…</div>;

  if (!conflicts?.length) {
    return <div style={{ padding: 24, color: 'var(--color-verified)', fontSize: 13 }}>No cross-source conflicts found.</div>;
  }

  return (
    <div style={{ padding: 24 }}>
      <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-muted)', marginTop: 0, marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Cross-Source Conflicts</h3>
      {conflicts.map((conflict) => (
        <div key={conflict.concept} style={{ marginBottom: 20, background: 'var(--color-surface)', border: `1px solid ${conflict.divergentSameDate ? 'var(--color-alert)' : 'var(--color-border)'}`, borderRadius: 10 }}>
          <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)' }}>{conflict.label}</span>
            <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)' }}>{conflict.concept}</span>
            {conflict.divergentSameDate && (
              <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--color-alert)', padding: '2px 6px', background: 'color-mix(in srgb, var(--color-alert) 10%, transparent)', borderRadius: 3 }}>
                DIVERGENT SAME DATE
              </span>
            )}
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                {['Value', 'Source', 'Document', 'As Of'].map((h) => (
                  <th key={h} style={{ padding: '6px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {conflict.rows.map((row) => {
                const isDivergent = conflict.divergentSameDate && conflict.compared.includes(row.asOf ?? '');
                return (
                  <tr key={row.factId} style={{ borderBottom: '1px solid var(--color-border)', background: isDivergent ? 'color-mix(in srgb, var(--color-alert) 5%, transparent)' : 'transparent' }}>
                    <td style={{ padding: '8px 16px', color: isDivergent ? 'var(--color-alert)' : 'var(--color-text)', fontFamily: 'var(--font-mono)' }}>{row.value}</td>
                    <td style={{ padding: '8px 16px', color: 'var(--color-text-muted)' }}>{row.source}</td>
                    <td style={{ padding: '8px 16px', color: 'var(--color-text-faint)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>{row.documentId ?? '—'}</td>
                    <td style={{ padding: '8px 16px' }}><Timestamp iso={row.asOf} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
