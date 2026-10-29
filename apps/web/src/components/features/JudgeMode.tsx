'use client';
import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw, X, Minimize2, Maximize2 } from 'lucide-react';
import { JUDGE_BEATS, useJudgeStore } from '@/store/judge-store';

const TOTAL_SECONDS = JUDGE_BEATS.reduce((sum, beat) => sum + beat.seconds, 0);

/**
 * Guided 3-minute walkthrough ("Judge mode"). Auto-advances through the
 * beats, can be paused, stepped and reset. Uses only local routes and
 * fixture data, so it works with no network. Enables projector-friendly
 * type via <html data-demo="on"> while active.
 */
export default function JudgeMode() {
  const { step, paused, go, setPaused, stop, start } = useJudgeStore();
  const router = useRouter();
  const pathname = usePathname();
  const [elapsed, setElapsed] = useState(0);
  const [mini, setMini] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const beat = JUDGE_BEATS[step] ?? JUDGE_BEATS[0]!;
  const last = useRef(0);

  useEffect(() => {
    document.documentElement.setAttribute('data-demo', 'on');
    return () => document.documentElement.removeAttribute('data-demo');
  }, []);

  // Navigate once per beat change (not on every pathname change, so officers can click around).
  const navigatedStep = useRef(-1);
  useEffect(() => {
    if (navigatedStep.current === step) return;
    navigatedStep.current = step;
    setElapsed(0);
    if (pathname + window.location.search !== beat.href) router.push(beat.href);
  }, [step, beat.href, pathname, router]);

  // Step timer.
  useEffect(() => {
    if (paused) return;
    last.current = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      const delta = (now - last.current) / 1000;
      last.current = now;
      setElapsed((e) => e + delta);
    }, 250);
    return () => window.clearInterval(id);
  }, [paused, step]);

  useEffect(() => {
    if (elapsed < beat.seconds) return;
    if (step < JUDGE_BEATS.length - 1) go(step + 1);
    else setPaused(true);
  }, [elapsed, beat.seconds, step, go, setPaused]);

  async function reset() {
    setResetting(true);
    setNote(null);
    try {
      const res = await fetch('/api/demo/reset', { method: 'POST', headers: { 'x-eg-role': 'senior_reviewer' } });
      if (!res.ok) throw new Error();
      start();
      router.push('/');
      router.refresh();
      setNote('Demo data restored.');
    } catch {
      setNote('Reset could not reach the local server. The walkthrough still works.');
    } finally {
      setResetting(false);
    }
  }

  const before = JUDGE_BEATS.slice(0, step).reduce((sum, b) => sum + b.seconds, 0);
  const overall = Math.min(1, (before + Math.min(elapsed, beat.seconds)) / TOTAL_SECONDS);
  const stepProgress = Math.min(1, elapsed / beat.seconds);

  return (
    <section
      aria-label="Guided demo"
      className="eg-glass"
      style={{
        position: 'fixed', right: 16, bottom: 16, zIndex: 9500, width: mini ? 300 : 'min(560px, calc(100vw - 32px))',
        padding: mini ? 12 : 18, borderColor: 'color-mix(in oklab, var(--color-accent) 45%, transparent)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span className="eg-eyebrow">Demo · {step + 1} of {JUDGE_BEATS.length}</span>
        <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }} aria-live="polite">{beat.title}</span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          <button type="button" className="eg-icon-btn" onClick={() => setMini(!mini)} aria-label={mini ? 'Expand demo panel' : 'Minimise demo panel'}>
            {mini ? <Maximize2 size={14} aria-hidden /> : <Minimize2 size={14} aria-hidden />}
          </button>
          <button type="button" className="eg-icon-btn" onClick={stop} aria-label="Exit demo">
            <X size={14} aria-hidden />
          </button>
        </span>
      </div>

      {!mini && (
        <p style={{ margin: '12px 0 14px', fontSize: 18, lineHeight: 1.5, color: 'var(--color-text)' }}>{beat.say}</p>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${JUDGE_BEATS.length}, 1fr)`, gap: 4, margin: mini ? '10px 0' : '0 0 12px' }} aria-hidden>
        {JUDGE_BEATS.map((b, i) => (
          <span key={b.href + i} style={{ height: 4, borderRadius: 4, background: 'var(--color-raised)', overflow: 'hidden' }}>
            <span style={{
              display: 'block', height: '100%', background: 'var(--brand-gradient)', transformOrigin: 'left',
              transform: `scaleX(${i < step ? 1 : i === step ? stepProgress : 0})`, transition: 'transform 250ms linear',
            }} />
          </span>
        ))}
      </div>
      <div className="sr-only" role="progressbar" aria-label="Demo progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(overall * 100)} />

      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" className="eg-icon-btn" onClick={() => go(step - 1)} disabled={step === 0} aria-label="Previous step"><ChevronLeft size={15} aria-hidden /></button>
        <button type="button" className="eg-btn eg-btn-primary" style={{ minHeight: 34 }} onClick={() => setPaused(!paused)}>
          {paused ? <Play size={14} aria-hidden /> : <Pause size={14} aria-hidden />}{paused ? 'Play' : 'Pause'}
        </button>
        <button type="button" className="eg-icon-btn" onClick={() => go(step + 1)} disabled={step === JUDGE_BEATS.length - 1} aria-label="Next step"><ChevronRight size={15} aria-hidden /></button>
        <button type="button" className="eg-icon-btn" onClick={() => void reset()} disabled={resetting} style={{ marginLeft: 'auto' }}>
          <RotateCcw size={14} aria-hidden />{resetting ? 'Resetting…' : 'Reset'}
        </button>
      </div>
      {note && <p role="status" style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--color-text-muted)' }}>{note}</p>}
    </section>
  );
}
