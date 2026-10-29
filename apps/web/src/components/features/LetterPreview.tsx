'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as Dialog from '@radix-ui/react-dialog';
import type { LetterDraft } from '@evidencegraph/domain';
import { useRoleStore } from '@/store/role-store';
import { Spinner } from '@/components/atoms/Spinner';
import { Timestamp } from '@/components/atoms/Timestamp';
import { useState } from 'react';
import { X } from 'lucide-react';

interface LetterPreviewProps {
  appId: string;
}

export function LetterPreview({ appId }: LetterPreviewProps) {
  const { role } = useRoleStore();
  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { data: letter, isLoading } = useQuery<LetterDraft>({
    queryKey: ['letter', appId],
    queryFn: async () => {
      const res = await fetch(`/api/applications/${appId}/letter`, { headers: { 'x-eg-role': role } });
      if (!res.ok) throw new Error('Not found');
      return res.json() as Promise<LetterDraft>;
    },
  });

  const releaseMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/applications/${appId}/letter`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', 'x-eg-role': role },
        body: JSON.stringify({ releasedBy: role }),
      });
      if (!res.ok) throw new Error('Release failed');
      return res.json() as Promise<LetterDraft>;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['letter', appId] });
      setConfirmOpen(false);
    },
  });

  if (isLoading) return <div style={{ padding: 24, display: 'flex', gap: 8, color: 'var(--color-text-muted)' }}><Spinner />Loading letter…</div>;
  if (!letter) return <div style={{ padding: 24, color: 'var(--color-text-muted)' }}>No letter draft available.</div>;

  return (
    <div style={{ padding: 24 }}>
      {/* Draft banner */}
      <div style={{ padding: '10px 16px', background: 'color-mix(in srgb, var(--color-validity) 10%, transparent)', border: '1px solid var(--color-validity)', borderRadius: 8, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 13, color: 'var(--color-validity)', fontWeight: 600 }}>⚠ Draft — Not sent by the system</span>
        {letter.releasedAt ? (
          <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--color-text-muted)' }}>Released by {letter.releasedBy} · <Timestamp iso={letter.releasedAt} mode="datetime" /></span>
        ) : (
          role === 'senior_reviewer' && (
            <button onClick={() => setConfirmOpen(true)} style={{ marginLeft: 'auto', padding: '5px 14px', background: 'var(--color-accent)', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--color-canvas)' }}>
              Release Letter
            </button>
          )
        )}
      </div>

      {/* Clause citations */}
      {letter.clauseCitations.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
          {letter.clauseCitations.map((c) => (
            <span key={c.ruleId} style={{ fontSize: 11, padding: '2px 8px', background: 'var(--color-raised)', border: '1px solid var(--color-border)', borderRadius: 4, fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)' }}>
              {c.ruleId} · {c.aphRef}
            </span>
          ))}
        </div>
      )}

      {/* Letter body */}
      <pre style={{ padding: 20, background: 'var(--color-raised)', border: '1px solid var(--color-border)', borderRadius: 10, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--color-text)', lineHeight: 1.8, whiteSpace: 'pre-wrap', overflow: 'auto' }}>
        {letter.body}
      </pre>

      {/* Release confirm dialog */}
      <Dialog.Root open={confirmOpen} onOpenChange={setConfirmOpen}>
        <Dialog.Portal>
          <Dialog.Overlay style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9998 }} />
          <Dialog.Content style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: 'var(--color-overlay)', border: '1px solid var(--color-border)', borderRadius: 10, padding: 24, width: 440, zIndex: 9999 }}>
            <Dialog.Title style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text)', margin: '0 0 12px' }}>Release Deficiency Letter?</Dialog.Title>
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: '0 0 20px' }}>
              This will mark the letter as released and log it in the audit ledger. The letter is not electronically sent by this system.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <Dialog.Close asChild>
                <button style={{ padding: '6px 16px', background: 'var(--color-raised)', border: '1px solid var(--color-border)', borderRadius: 6, cursor: 'pointer', color: 'var(--color-text-muted)', fontSize: 13 }}>Cancel</button>
              </Dialog.Close>
              <button
                onClick={() => releaseMutation.mutate()}
                disabled={releaseMutation.isPending}
                style={{ padding: '6px 16px', background: 'var(--color-accent)', border: 'none', borderRadius: 6, cursor: releaseMutation.isPending ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--color-canvas)', opacity: releaseMutation.isPending ? 0.7 : 1 }}
              >
                {releaseMutation.isPending ? 'Releasing…' : 'Confirm Release'}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
