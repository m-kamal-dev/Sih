'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Finding } from '@evidencegraph/domain';
import { useRoleStore } from '@/store/role-store';
import { FindingChip } from '@/components/atoms/FindingChip';
import { Spinner } from '@/components/atoms/Spinner';
import { CheckCircle, XCircle, ArrowUpCircle } from 'lucide-react';

interface DecisionBarProps {
  appId: string;
}

export function DecisionBar({ appId }: DecisionBarProps) {
  const { role } = useRoleStore();
  const queryClient = useQueryClient();
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [lastResult, setLastResult] = useState<string | null>(null);

  const { data, isLoading } = useQuery<{ findings: Finding[]; signalStrengths: Record<string, string> }>({
    queryKey: ['findings', appId],
    queryFn: async () => {
      const res = await fetch(`/api/applications/${appId}/findings`, { headers: { 'x-eg-role': role } });
      return res.json() as Promise<{ findings: Finding[]; signalStrengths: Record<string, string> }>;
    },
  });

  const decideMutation = useMutation({
    mutationFn: async (action: 'accept' | 'dismiss' | 'escalate') => {
      const res = await fetch(`/api/applications/${appId}/decision`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-eg-role': role },
        body: JSON.stringify({ findingId: selectedFindingId, action, reason }),
      });
      if (!res.ok) {
        const err = await res.json() as { error: string };
        throw new Error(err.error);
      }
      return res.json() as Promise<unknown>;
    },
    onSuccess: (_data, action) => {
      setLastResult(`Decision recorded: ${action}`);
      setReason('');
      setSelectedFindingId(null);
      void queryClient.invalidateQueries({ queryKey: ['findings', appId] });
    },
    onError: (err: Error) => {
      setLastResult(`Error: ${err.message}`);
    },
  });

  if (role === 'applicant') return null;

  const openFindings = (data?.findings ?? []).filter((f) => f.status === 'open');
  const selected = openFindings.find((f) => f.id === selectedFindingId);

  return (
    <div style={{ display: 'flex', gap: 0, height: '100%', overflow: 'hidden' }}>
      {/* Left: findings list */}
      <div style={{ width: 280, borderRight: '1px solid var(--color-border)', overflow: 'auto' }}>
        <div style={{ padding: '8px 12px', fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid var(--color-border)' }}>
          Open Findings
        </div>
        {isLoading && <div style={{ padding: 12 }}><Spinner /></div>}
        {openFindings.map((f) => (
          <button
            key={f.id}
            onClick={() => setSelectedFindingId(f.id)}
            style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 4, padding: '10px 12px', background: selectedFindingId === f.id ? 'color-mix(in srgb, var(--color-accent) 8%, transparent)' : 'none', border: 'none', borderBottom: '1px solid var(--color-border)', cursor: 'pointer', textAlign: 'left' }}
          >
            <FindingChip findingClass={f.findingClass} />
            <span style={{ fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.4 }}>{f.summary.slice(0, 80)}{f.summary.length > 80 ? '…' : ''}</span>
          </button>
        ))}
        {openFindings.length === 0 && !isLoading && (
          <div style={{ padding: 12, fontSize: 12, color: 'var(--color-text-faint)' }}>No open findings.</div>
        )}
      </div>

      {/* Center: finding detail */}
      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        {selected ? (
          <div>
            <FindingChip findingClass={selected.findingClass} />
            <h4 style={{ margin: '8px 0', fontSize: 14, color: 'var(--color-text)' }}>{selected.summary}</h4>
            {selected.detail && <p style={{ fontSize: 13, color: 'var(--color-text-muted)', lineHeight: 1.5 }}>{selected.detail}</p>}
            {selected.suggestedAction && <p style={{ fontSize: 12, color: 'var(--color-accent)', fontStyle: 'italic' }}>▸ {selected.suggestedAction}</p>}
          </div>
        ) : (
          <div style={{ color: 'var(--color-text-faint)', fontSize: 13 }}>Select a finding to review.</div>
        )}
      </div>

      {/* Right: action panel */}
      <div style={{ width: 260, borderLeft: '1px solid var(--color-border)', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Decision</div>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason (required)…"
          rows={4}
          style={{ width: '100%', background: 'var(--color-raised)', border: '1px solid var(--color-border)', borderRadius: 6, color: 'var(--color-text)', fontSize: 13, padding: 8, resize: 'vertical', boxSizing: 'border-box' }}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {(['accept', 'dismiss', ...(role === 'senior_reviewer' ? ['escalate'] : [])] as const).map((action) => {
            const colors: Record<string, string> = { accept: 'var(--color-verified)', dismiss: 'var(--color-mismatch)', escalate: 'var(--color-accent)' };
            const Icons: Record<string, React.ComponentType<{ size?: number }>> = { accept: CheckCircle, dismiss: XCircle, escalate: ArrowUpCircle };
            const Icon = Icons[action] ?? CheckCircle;
            const disabled = !selectedFindingId || !reason.trim() || decideMutation.isPending;
            return (
              <button
                key={action}
                onClick={() => decideMutation.mutate(action as 'accept' | 'dismiss' | 'escalate')}
                disabled={disabled}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', background: `color-mix(in srgb, ${colors[action]} 12%, transparent)`, border: `1px solid ${colors[action]}`, borderRadius: 6, cursor: disabled ? 'not-allowed' : 'pointer', color: colors[action], fontSize: 13, fontWeight: 600, opacity: disabled ? 0.5 : 1, textTransform: 'capitalize' }}
              >
                <Icon size={14} />
                {action}
              </button>
            );
          })}
        </div>
        {lastResult && <div style={{ fontSize: 12, color: 'var(--color-verified)', marginTop: 4 }}>{lastResult}</div>}
        {decideMutation.error instanceof Error && <div style={{ fontSize: 12, color: 'var(--color-alert)' }}>{decideMutation.error.message}</div>}
      </div>
    </div>
  );
}
