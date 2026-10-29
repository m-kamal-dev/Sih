'use client';
import { useQuery } from '@tanstack/react-query';
import { useRoleStore } from '@/store/role-store';
import type { Finding } from '@evidencegraph/domain';
import { FindingChip } from '@/components/atoms/FindingChip';
import { Spinner } from '@/components/atoms/Spinner';

interface SelfCheckListProps {
  appId: string;
}

export function SelfCheckList({ appId }: SelfCheckListProps) {
  const { role } = useRoleStore();

  const { data, isLoading, error, refetch } = useQuery<{ findings: Finding[]; institution: string; openCount: number }>({
    queryKey: ['self-check', appId],
    queryFn: async () => {
      // Self-check endpoint returns only fix-list items (no forensic signals,
      // no triage score, no cross-app data). All roles can call this.
      const res = await fetch(`/api/applications/${appId}/self-check`, { headers: { 'x-eg-role': role } });
      if (!res.ok) throw new Error('Failed to load self-check');
      return res.json() as Promise<{ findings: Finding[]; institution: string; openCount: number }>;
    },
  });

  if (role !== 'applicant') {
    return (
      <div style={{ padding: 24, color: 'var(--color-alert)', fontSize: 13 }}>
        Access restricted — this view is only available to the applicant role.
      </div>
    );
  }

  if (isLoading) return <div style={{ padding: 16, display: 'flex', gap: 8, color: 'var(--color-text-muted)' }}><Spinner />Loading fix list…</div>;
  if (error) return <div style={{ padding: 24, color: 'var(--color-alert)', fontSize: 13 }}>Could not load your list. <button onClick={() => refetch()} style={{ background: 'none', border: '1px solid var(--color-border)', borderRadius: 4, color: 'var(--color-text)', cursor: 'pointer' }}>Retry</button></div>;

  const findings = (data?.findings ?? []).filter((f) => f.findingClass !== 'anomaly_signal' && f.status === 'open');

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 16, padding: '10px 16px', background: 'color-mix(in srgb, var(--color-accent) 8%, transparent)', border: '1px solid var(--color-accent)', borderRadius: 8, fontSize: 13, color: 'var(--color-accent)' }}>
        This is your self-check summary. No triage details, forensic signals, or other institutions are shown here.
      </div>

      {findings.length === 0 ? (
        <div style={{ padding: 20, color: 'var(--color-verified)', fontSize: 14, textAlign: 'center' }}>
          ✓ No issues found with your application.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {findings.map((f) => (
            <div key={f.id} style={{ padding: 16, background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 10 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                <FindingChip findingClass={f.findingClass} />
                <span style={{ fontSize: 11, color: 'var(--color-text-muted)', textTransform: 'capitalize' }}>{f.severity} severity</span>
              </div>
              <div style={{ fontSize: 13, color: 'var(--color-text)', marginBottom: f.suggestedAction ? 8 : 0 }}>{f.summary}</div>
              {f.suggestedAction && (
                <div style={{ fontSize: 12, color: 'var(--color-accent)', marginTop: 6 }}>
                  <strong>Suggested action:</strong> {f.suggestedAction}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
