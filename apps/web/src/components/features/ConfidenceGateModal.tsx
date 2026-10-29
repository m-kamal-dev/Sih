'use client';
/**
 * ConfidenceGateModal — HITL checkpoint.
 *
 * Shows a quarantined fact (extracted value + confidence + bbox crop context),
 * lets the officer confirm or correct the value, then POSTs to the correct API
 * endpoint. On success the fact is un-quarantined and dependent findings
 * recompute server-side.
 *
 * Spec §03/§04 — "officer correction creates a new fact version with
 * source=human; the original is marked superseded; dependent findings
 * recompute live."
 */
import * as Dialog from '@radix-ui/react-dialog';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check, X } from 'lucide-react';
import type { Fact } from '@evidencegraph/domain';
import { useRoleStore } from '@/store/role-store';
import { ConfidenceBar } from '@/components/atoms/ConfidenceBar';

interface ConfidenceGateModalProps {
  appId: string;
  fact: Fact;
  open: boolean;
  onClose: () => void;
}

export function ConfidenceGateModal({ appId, fact, open, onClose }: ConfidenceGateModalProps) {
  const { role } = useRoleStore();
  const queryClient = useQueryClient();
  const [correctedValue, setCorrectedValue] = useState<string>(String(fact.value ?? ''));
  const [confirmed, setConfirmed] = useState(false);

  const mutation = useMutation({
    mutationFn: async (value: string | number) => {
      const res = await fetch(`/api/applications/${appId}/facts/${fact.id}/correct`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-eg-role': role },
        body: JSON.stringify({ correctedValue: value }),
      });
      if (!res.ok) {
        const err = await res.json() as { error: string };
        throw new Error(err.error);
      }
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['facts', appId] });
      void queryClient.invalidateQueries({ queryKey: ['findings', appId] });
      void queryClient.invalidateQueries({ queryKey: ['application-full', appId] });
      setConfirmed(true);
      setTimeout(() => {
        onClose();
        setConfirmed(false);
      }, 900);
    },
  });

  const numericKeys = ['faculty.roster_count', 'faculty.form_count', 'land.deed_area', 'land.form_area', 'fdr.amount'];
  const isNumeric = numericKeys.some((k) => fact.key.includes(k.split('.')[1] ?? ''));

  function submit() {
    const val = isNumeric ? Number(correctedValue) : correctedValue;
    mutation.mutate(val);
  }

  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.65)',
            zIndex: 50,
            animation: 'fadeIn 200ms var(--ease-enter)',
          }}
        />
        <Dialog.Content
          style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 480,
            maxWidth: '90vw',
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border-strong)',
            borderRadius: 10,
            padding: 24,
            zIndex: 51,
            animation: 'slideUp 220ms var(--ease-enter)',
            boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
          }}
          aria-describedby="cg-desc"
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 20 }}>
            <AlertTriangle size={18} style={{ color: 'var(--color-validity)', flexShrink: 0, marginTop: 2 }} />
            <div>
              <Dialog.Title style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text)', margin: 0 }}>
                Please confirm this reading — officer check needed
              </Dialog.Title>
              <p id="cg-desc" style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '4px 0 0' }}>
                This extraction fell below the confidence threshold for its type. Confirm the value is correct, or enter the correct value before continuing.
              </p>
            </div>
          </div>

          {/* Fact detail */}
          <div style={{ background: 'var(--color-raised)', border: '1px solid var(--color-border)', borderRadius: 6, padding: 14, marginBottom: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{fact.key}</span>
              <span style={{ fontSize: 11, color: 'var(--color-text-faint)' }}>extractor: {fact.extractor}</span>
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-text)', fontFamily: 'var(--font-mono)' }}>
              {String(fact.value)}
              {fact.unit && <span style={{ fontSize: 13, color: 'var(--color-text-muted)', marginLeft: 4 }}>{fact.unit}</span>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Confidence</span>
              <ConfidenceBar value={fact.confidence} />
              <span style={{ fontSize: 11, color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>
                {(fact.confidence * 100).toFixed(0)}%
              </span>
            </div>
            {fact.asOf && (
              <div style={{ fontSize: 11, color: 'var(--color-text-faint)' }}>
                as_of: {fact.asOf} · page: {fact.page ?? '—'}
                {fact.bbox && (
                  <span style={{ fontFamily: 'var(--font-mono)', marginLeft: 6 }}>
                    bbox [{fact.bbox.map((n) => Math.round(n)).join(', ')}]
                  </span>
                )}
              </div>
            )}
            {fact.quarantine && (
              <div style={{ fontSize: 11, color: 'var(--color-validity)', background: 'color-mix(in srgb, var(--color-validity) 10%, transparent)', borderRadius: 4, padding: '4px 8px' }}>
                ⚠ Held: {fact.quarantine}
              </div>
            )}
          </div>

          {/* Correction input */}
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 18 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)' }}>
              Correct value (edit if needed, then confirm)
            </span>
            <input
              type={isNumeric ? 'number' : 'text'}
              value={correctedValue}
              onChange={(e) => setCorrectedValue(e.target.value)}
              style={{
                background: 'var(--color-raised)',
                border: '1px solid var(--color-border-strong)',
                borderRadius: 6,
                color: 'var(--color-text)',
                fontSize: 16,
                fontFamily: 'var(--font-mono)',
                padding: '8px 12px',
                outline: 'none',
              }}
            />
            <span style={{ fontSize: 11, color: 'var(--color-text-faint)' }}>
              Submitting this creates a new fact version with source=human. The original is marked superseded.
            </span>
          </label>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <Dialog.Close asChild>
              <button
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: 13 }}
              >
                <X size={13} /> Cancel
              </button>
            </Dialog.Close>
            <button
              onClick={submit}
              disabled={mutation.isPending || !correctedValue.trim()}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 20px',
                borderRadius: 6,
                border: confirmed ? '1px solid var(--color-verified)' : '1px solid var(--color-accent)',
                background: confirmed
                  ? 'color-mix(in srgb, var(--color-verified) 15%, transparent)'
                  : 'color-mix(in srgb, var(--color-accent) 15%, transparent)',
                color: confirmed ? 'var(--color-verified)' : 'var(--color-accent)',
                cursor: mutation.isPending ? 'not-allowed' : 'pointer',
                fontSize: 13,
                fontWeight: 600,
                transition: 'background 200ms ease, border-color 200ms ease, color 200ms ease',
                opacity: mutation.isPending ? 0.7 : 1,
              }}
            >
              <Check size={13} />
              {confirmed ? 'Confirmed ✓' : mutation.isPending ? 'Saving…' : 'Confirm value'}
            </button>
          </div>
          {mutation.error instanceof Error && (
            <div style={{ marginTop: 10, fontSize: 12, color: 'var(--color-danger-text)' }}>
              {mutation.error.message}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { opacity: 0; transform: translate(-50%, calc(-50% + 12px)); } to { opacity: 1; transform: translate(-50%, -50%); } }
      `}</style>
    </Dialog.Root>
  );
}
