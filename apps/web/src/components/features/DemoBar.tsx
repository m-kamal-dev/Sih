'use client';
import { useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useUiStore } from '@/store/ui-store';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const BEATS = [
  { time: '0:00', label: 'Applications and the main reasons', href: '/queue' },
  { time: '0:45', label: 'Self-check (Pallavaram)', href: '/self-check/INTK-2026-0229' },
  { time: '1:30', label: 'Split-view jump to deed p.3', href: '/applications/EOA-2026-0142/evidence' },
  { time: '2:30', label: 'Link map: same teacher at two colleges', href: '/applications/INTK-2026-0208/graph' },
  { time: '3:20', label: 'Fix a blurred number the AI was unsure about', href: '/applications/EOA-2026-0117/evidence?factKey=faculty.roster_count' },
  { time: '4:00', label: 'Hidden instruction text is ignored and flagged', href: '/applications/NEW-2026-0058/forensics' },
  { time: '4:40', label: 'Re-run old applications with new rules', href: '/rules' },
  { time: '5:20', label: 'Tampering with the history is detected', href: '/ledger' },
] as const;

export function DemoBar() {
  const { demoStep, setDemoStep } = useUiStore();
  const router = useRouter();

  const go = useCallback((step: number) => {
    const beat = BEATS[step];
    if (!beat) return;
    setDemoStep(step);
    router.push(beat.href);
  }, [router, setDemoStep]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'ArrowRight') go(Math.min(demoStep + 1, BEATS.length - 1));
      if (e.key === 'ArrowLeft') go(Math.max(demoStep - 1, 0));
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [demoStep, go]);

  const current = BEATS[demoStep];

  return (
    <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, height: 56, background: 'var(--color-overlay)', borderTop: '1px solid var(--color-border)', zIndex: 9000, display: 'flex', alignItems: 'center', padding: '0 16px', gap: 12 }}>
      <button onClick={() => go(Math.max(demoStep - 1, 0))} aria-label="Previous beat" disabled={demoStep === 0} style={{ background: 'none', border: '1px solid var(--color-border)', borderRadius: 6, padding: '4px 8px', cursor: demoStep === 0 ? 'not-allowed' : 'pointer', color: 'var(--color-text-muted)', opacity: demoStep === 0 ? 0.4 : 1 }}>
        <ChevronLeft size={14} />
      </button>

      {/* Beat chips */}
      <div style={{ display: 'flex', gap: 4, overflow: 'hidden', flex: 1 }}>
        {BEATS.map((beat, i) => (
          <a
            key={i}
            href={beat.href}
            onClick={() => setDemoStep(i)}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 20, border: 'none', cursor: 'pointer', background: i === demoStep ? 'var(--color-accent)' : 'var(--color-raised)', color: i === demoStep ? 'var(--color-accent-contrast)' : 'var(--color-text-muted)', fontSize: 11, fontWeight: i === demoStep ? 700 : 400, whiteSpace: 'nowrap', transition: 'background 150ms ease, color 150ms ease', flexShrink: 0 }}
          >
            <span style={{ fontFamily: 'var(--font-mono)' }}>{beat.time}</span>
            <span style={{ display: i === demoStep ? 'inline' : 'none' }}> · {beat.label}</span>
          </a>
        ))}
      </div>

      <div style={{ fontSize: 12, color: 'var(--color-text-muted)', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {current?.label}
      </div>

      <button
        onClick={async () => {
          const response = await fetch('/api/demo/reset', { method: 'POST', headers: { 'x-eg-role': 'senior_reviewer' } });
          if (response.ok) window.location.reload();
        }}
        style={{ background: 'none', border: '1px solid var(--color-border)', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', color: 'var(--color-text-muted)', fontSize: 11, whiteSpace: 'nowrap' }}
      >
        Reset demo data
      </button>

      <button onClick={() => go(Math.min(demoStep + 1, BEATS.length - 1))} aria-label="Next beat" disabled={demoStep === BEATS.length - 1} style={{ background: 'none', border: '1px solid var(--color-border)', borderRadius: 6, padding: '4px 8px', cursor: demoStep === BEATS.length - 1 ? 'not-allowed' : 'pointer', color: 'var(--color-text-muted)', opacity: demoStep === BEATS.length - 1 ? 0.4 : 1 }}>
        <ChevronRight size={14} />
      </button>
    </div>
  );
}
