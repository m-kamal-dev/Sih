'use client';
import { LEDGER_ACTION_LABELS } from '@/lib/constants';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import type { AuditRow } from '@evidencegraph/domain';
import { OfficerTag } from '@/components/atoms/OfficerTag';
import { useRoleStore } from '@/store/role-store';
import { Spinner } from '@/components/atoms/Spinner';
import { CopyButton } from '@/components/atoms/CopyButton';
import { Timestamp } from '@/components/atoms/Timestamp';
import type { VerifyResult } from '@evidencegraph/engine';

interface LedgerResponse {
  rows: AuditRow[];
  integrity: VerifyResult;
  digest: { day: string; headHash: string; signature: string };
}

export function LedgerTable() {
  const { role } = useRoleStore();
  const queryClient = useQueryClient();
  // tracks which row seqs are visually "cascading" after a tamper
  const [cascadeSeqs, setCascadeSeqs] = useState<Set<number>>(new Set());

  const { data, isLoading, error, refetch } = useQuery<LedgerResponse>({
    queryKey: ['ledger'],
    queryFn: async () => {
      const res = await fetch('/api/ledger', { headers: { 'x-eg-role': role } });
      if (!res.ok) throw new Error('Failed to load ledger');
      return res.json() as Promise<LedgerResponse>;
    },
  });

  // when brokenAt changes (chain just broke), cascade-highlight all rows from brokenAt onward
  const brokenAt = data?.integrity?.brokenAt;
  const rows = data?.rows ?? [];
  useEffect(() => {
    if (!brokenAt) {
      setCascadeSeqs(new Set());
      return;
    }
    const affected = rows.filter((r) => r.seq >= brokenAt).map((r) => r.seq);
    // stagger: reveal each row 40ms apart
    affected.forEach((seq, i) => {
      setTimeout(() => {
        setCascadeSeqs((prev) => new Set([...prev, seq]));
      }, i * 40);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brokenAt]);

  const tamperMutation = useMutation({
    mutationFn: async (seq: number) => {
      const res = await fetch('/api/ledger', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-eg-role': role },
        body: JSON.stringify({ seq, patch: { _DEMO_TAMPERED: true, payload_note: 'Row mutated by demo tamper action' } }),
      });
      return res.json() as Promise<unknown>;
    },
    onSuccess: () => {
      setCascadeSeqs(new Set()); // reset so effect fires fresh
      void queryClient.invalidateQueries({ queryKey: ['ledger'] });
    },
  });

  const verifyMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/ledger/verify', { method: 'POST', headers: { 'x-eg-role': role } });
      return res.json() as Promise<unknown>;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['ledger'] }),
  });

  if (isLoading) return <div style={{ padding: 24, display: 'flex', gap: 8, color: 'var(--color-text-muted)' }}><Spinner />Loading decision history…</div>;
  if (error) return <div style={{ padding: 24, color: 'var(--color-danger-text)', fontSize: 13 }}>Could not load the decision history. <button onClick={() => refetch()} style={{ background: 'none', border: '1px solid var(--color-border)', borderRadius: 4, color: 'var(--color-text)', cursor: 'pointer' }}>Retry</button></div>;

  const { integrity, digest } = data ?? {};

  const chainOk = integrity?.ok !== false;

  return (
    <div style={{ padding: 24 }}>
      <p style={{ margin: '0 0 16px', fontSize: 12, color: 'var(--color-text-faint)', maxWidth: 720 }}>
        Every action the system records is written here as a row whose hash includes the previous row&apos;s hash, so records cannot be rewritten later without the chain visibly breaking. Use the demo Tamper action on any row to see the break and how it cascades.
      </p>
      {/* Chain status banner */}
      <div style={{ marginBottom: 16, padding: '10px 16px', background: `color-mix(in srgb, ${chainOk ? 'var(--color-verified)' : 'var(--color-alert)'} 10%, transparent)`, border: `1px solid ${chainOk ? 'var(--color-verified)' : 'var(--color-alert)'}`, borderRadius: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: `color-mix(in srgb, ${chainOk ? 'var(--color-verified)' : 'var(--color-alert)'} 70%, var(--color-text))` }}>
          {chainOk ? '✓ Chain integrity verified' : `⚠ Chain broken at row #${brokenAt ?? '?'}`}
        </span>
        {digest && <span style={{ marginLeft: 'auto', fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)' }}>{digest.day} · {digest.headHash.slice(0, 12)}…</span>}
        <button onClick={() => verifyMutation.mutate()} style={{ padding: '4px 12px', background: 'var(--color-raised)', border: '1px solid var(--color-border)', borderRadius: 6, cursor: 'pointer', fontSize: 12, color: 'var(--color-text-muted)' }}>
          Re-verify
        </button>
      </div>

      {/* Table */}
      <div style={{ overflow: 'auto', border: '1px solid var(--color-border)', borderRadius: 8 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: 'var(--color-raised)' }}>
              {['#', 'At', 'Officer', 'AI model', 'Action', 'Entity', 'Hash', 'Demo tamper'].map((h) => (
                <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid var(--color-border)', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isBreakPoint = brokenAt === row.seq;
              const isCascaded = cascadeSeqs.has(row.seq);
              const showAlert = isCascaded || isBreakPoint;
              return (
                <tr
                  key={row.seq}
                  style={{
                    borderBottom: '1px solid var(--color-border)',
                    background: showAlert
                      ? 'color-mix(in srgb, var(--color-alert) 8%, transparent)'
                      : 'transparent',
                    transition: 'background 200ms ease',
                  }}
                >
                  <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)' }}>{row.seq}</td>
                  <td style={{ padding: '8px 12px' }}><Timestamp iso={row.at} mode="datetime" /></td>
                  <td style={{ padding: '8px 12px' }}><OfficerTag officerId={row.officer} actor={row.actor} /></td>
                  <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>{row.model ?? 'rules only'}</td>
                  <td style={{ padding: '8px 12px', color: 'var(--color-text)' }} title={row.action}>{LEDGER_ACTION_LABELS[row.action] ?? row.action}</td>
                  <td style={{ padding: '8px 12px', color: 'var(--color-text-muted)' }}>{row.entity} · {row.entityId}</td>
                  <td style={{ padding: '8px 12px' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: showAlert ? 'var(--color-alert)' : 'var(--color-ok)', transition: 'color 200ms ease' }}>
                        {row.hash.slice(0, 12)}…
                      </code>
                      <CopyButton text={row.hash} size={11} />
                    </span>
                  </td>
                  <td style={{ padding: '8px 12px' }}>
                    {role !== 'auditor' && (
                      <button
                        onClick={() => tamperMutation.mutate(row.seq)}
                        disabled={tamperMutation.isPending}
                        style={{ fontSize: 11, padding: '3px 8px', background: 'none', border: '1px dashed var(--color-alert)', borderRadius: 4, color: 'var(--color-danger-text)', cursor: 'pointer', opacity: tamperMutation.isPending ? 0.5 : 1 }}
                        title="Demo only — mutates this row's payload to break the chain"
                      >
                        Tamper
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
