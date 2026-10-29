'use client';
import { useQuery } from '@tanstack/react-query';
import type { VerificationAttempt } from '@evidencegraph/domain';
import { useRoleStore } from '@/store/role-store';
import { VerificationPill } from '@/components/atoms/VerificationPill';
import { MockLabel } from '@/components/atoms/MockLabel';
import { Timestamp } from '@/components/atoms/Timestamp';
import { Spinner } from '@/components/atoms/Spinner';

interface VerificationTimelineProps {
  appId: string;
}

export function VerificationTimeline({ appId }: VerificationTimelineProps) {
  const { role } = useRoleStore();

  const { data: verifications, isLoading } = useQuery<VerificationAttempt[]>({
    queryKey: ['verifications', appId],
    queryFn: async () => {
      const res = await fetch(`/api/applications/${appId}/verifications`, { headers: { 'x-eg-role': role } });
      return res.json() as Promise<VerificationAttempt[]>;
    },
  });

  if (isLoading) return <div style={{ padding: 16, display: 'flex', gap: 8, color: 'var(--color-text-muted)' }}><Spinner />Loading verification attempts…</div>;

  if (!verifications?.length) {
    return <div style={{ padding: 24, color: 'var(--color-text-muted)', fontSize: 13 }}>No verification attempts recorded.</div>;
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {verifications.map((v, idx) => (
          <div key={v.id} style={{ display: 'flex', gap: 16, position: 'relative' }}>
            {/* Timeline line */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 24 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: v.status === 'verified' ? 'var(--color-verified)' : v.status === 'mismatch' ? 'var(--color-mismatch)' : 'var(--color-pending)', flexShrink: 0, marginTop: 4 }} />
              {idx < verifications.length - 1 && <div style={{ flex: 1, width: 2, background: 'var(--color-border)', minHeight: 20 }} />}
            </div>
            <div style={{ flex: 1, paddingBottom: 20, paddingTop: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)' }}>{v.connector}</span>
                <VerificationPill status={v.status} isMock={v.isMock} />
                {v.isMock && <MockLabel />}
                {v.refId && <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)' }}>{v.refId}</span>}
                <Timestamp iso={v.requestedAt} mode="datetime" />
              </div>

              {v.fieldMatches.length > 0 && (
                <div style={{ background: 'var(--color-raised)', borderRadius: 6, overflow: 'hidden', marginBottom: 6 }}>
                  {v.fieldMatches.map((fm) => {
                    const matchBase = fm.match === 'match' ? 'var(--color-verified)' : fm.match === 'differs' ? 'var(--color-mismatch)' : 'var(--color-pending)';
                      const matchColor = `color-mix(in srgb, ${matchBase} 70%, var(--color-text))`;
                    return (
                      <div key={fm.field} style={{ display: 'flex', gap: 12, padding: '6px 12px', borderBottom: '1px solid var(--color-border)', fontSize: 12 }}>
                        <span style={{ color: 'var(--color-text-muted)', width: 120, flexShrink: 0 }}>{fm.field}</span>
                        <span style={{ color: 'var(--color-text)' }}>{fm.claimed ?? '—'}</span>
                        <span style={{ color: 'var(--color-text-muted)' }}>vs</span>
                        <span style={{ color: 'var(--color-text)' }}>{fm.issuer ?? '—'}</span>
                        <span style={{ marginLeft: 'auto', color: matchColor, fontWeight: 600 }}>{fm.match}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              {v.note && (
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)', fontStyle: 'italic' }}>{v.note}</div>
              )}

              {v.status === 'source_unavailable' && (
                <div style={{ fontSize: 12, color: 'var(--color-validity)', marginTop: 4 }}>
                  <strong>Retry history:</strong> {v.attempts ?? 0} attempts{v.retryDelaysMs?.length ? ` · backoff ${v.retryDelaysMs.map((delay) => `${delay}ms`).join(', ')}` : ''}.
                  {' '}Circuit breaker: {v.circuitBreaker ? 'open' : 'closed'}.
                </div>
              )}
              {v.manualRequest && (
                <div style={{ marginTop: 8, padding: 10, border: '1px dashed var(--color-border-strong)', borderRadius: 6, background: 'var(--color-raised)' }}>
                  <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 3 }}>Manual verification request · {v.manualRequest.status}</div>
                  <div style={{ fontSize: 12, color: 'var(--color-text)' }}>{v.manualRequest.request}</div>
                  <div style={{ marginTop: 4, fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--color-text-faint)' }}>{v.manualRequest.id}</div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
