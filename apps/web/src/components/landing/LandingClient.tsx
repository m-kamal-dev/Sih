'use client';
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import * as m from 'motion/react-m';
import { FileText, ShieldAlert, CalendarX, EyeOff, Fingerprint } from 'lucide-react';

function calm() {
  return document.documentElement.getAttribute('data-effects') === 'off';
}

/**
 * Scroll reveal. Content is fully visible in the server HTML; after mount,
 * only elements still below the fold get the hidden start state, so nothing
 * on screen ever flickers or disappears.
 */
export function RevealRoot({ children, className, style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root || calm()) return;
    const items = Array.from(root.querySelectorAll<HTMLElement>('.eg-reveal'));
    items.forEach((el) => { if (el.getBoundingClientRect().top < window.innerHeight) el.classList.add('is-in'); });
    root.classList.add('eg-reveal-ready');
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
    }, { rootMargin: '0px 0px -10% 0px' });
    items.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  return <div ref={ref} className={className} style={style}>{children}</div>;
}

/** Counts up to a real value when scrolled into view; the server HTML already shows the final value. */
export function CountUp({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(value);
  useEffect(() => {
    const el = ref.current;
    if (!el || calm()) return;
    let raf = 0;
    const io = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return;
      io.disconnect();
      const t0 = performance.now();
      const tick = (now: number) => {
        const p = Math.min(1, (now - t0) / 1400);
        setShown(Math.round(value * (1 - Math.pow(1 - p, 3))));
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      setShown(0);
      raf = requestAnimationFrame(tick);
    }, { threshold: 0.6 });
    io.observe(el);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
  }, [value]);
  // Width is reserved for the final value so the count never shifts layout.
  return (
    <span ref={ref} style={{ display: 'inline-block', minWidth: `${String(value).length}ch`, textAlign: 'left' }}>
      <span aria-hidden>{shown}</span>
      <span className="sr-only">{value}</span>
    </span>
  );
}

const STEPS = [
  { key: 'Apply', title: 'Apply', body: 'An institution uploads its application and supporting documents: certificates, deeds, rosters, receipts.' },
  { key: 'Validate', title: 'Validate', body: 'Each file is fingerprinted and checked: saved versions, the signed part, hidden text, dates and required items. Written rules raise signals, each tied to its source.' },
  { key: 'Review', title: 'Review', body: 'The AI reads the documents and explains each signal in plain words, quoting the page it came from. Anything it cannot quote exactly is dropped.' },
  { key: 'Decide', title: 'Decide', body: 'An officer weighs the evidence and records the decision with reasons. Every action joins a tamper-evident history.' },
];

/** Scroll-driven Apply → Validate → Review → Decide story with a sticky progress rail. */
export function StoryScroll() {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLElement | null)[]>([]);
  useEffect(() => {
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.step));
    }, { rootMargin: '-45% 0px -45% 0px' });
    refs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, []);
  return (
    <div className="eg-story">
      <ol className="eg-story-rail" aria-label="How a case moves">
        {STEPS.map((s, i) => (
          <li key={s.key} aria-current={i === active ? 'step' : undefined} className={i <= active ? 'is-done' : undefined}>
            <span className="eg-story-dot" aria-hidden>{i + 1}</span>
            <span>{s.title}</span>
          </li>
        ))}
      </ol>
      <div>
        {STEPS.map((s, i) => (
          <article key={s.key} data-step={i} ref={(el) => { refs.current[i] = el; }} className={`eg-story-step${i === active ? ' is-active' : ''}`}>
            <div className="eg-eyebrow">Step {i + 1}</div>
            <h3 className="font-display" style={{ fontSize: 'clamp(26px, 3.4vw, 40px)', margin: '6px 0 10px', lineHeight: 1.1 }}>{s.title}</h3>
            <p style={{ fontSize: 17, color: 'var(--color-text-muted)', margin: 0, maxWidth: 520 }}>{s.body}</p>
          </article>
        ))}
      </div>
    </div>
  );
}

const SCAN_SIGNALS = [
  { at: 0.22, icon: Fingerprint, tone: 'var(--color-accent-text)', title: 'File fingerprint taken', detail: 'SHA-256 recorded before anything else runs' },
  { at: 0.45, icon: ShieldAlert, tone: 'var(--color-danger-text)', title: 'Changed after signing', detail: 'Bytes were added outside the signed range' },
  { at: 0.68, icon: CalendarX, tone: 'var(--color-warn-text)', title: 'Validity date passed', detail: '“Valid until” is earlier than the review date' },
  { at: 0.88, icon: EyeOff, tone: 'var(--color-violet)', title: 'Hidden text found', detail: 'Withheld from the AI and shown to the officer' },
];
const LINES = [72, 88, 54, 80, 66, 90, 48, 76, 60, 84];
const CYCLE = 7000;

/** Illustrative scan: a scan line sweeps a document and signals pop in on spring motion. Loops while visible. */
export function ScanDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(1);
  const progressRef = useRef(0);
  useEffect(() => {
    const el = ref.current;
    if (!el || calm()) return;
    let raf = 0;
    let visible = false;
    let t0 = performance.now();
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (!visible) { t0 = now - progressRef.current * CYCLE; return; }
      const p = ((now - t0) % (CYCLE + 1400)) / CYCLE;
      progressRef.current = Math.min(1, p);
      setProgress(Math.min(1, p));
    };
    const io = new IntersectionObserver(([e]) => { visible = Boolean(e?.isIntersecting); }, { threshold: 0.3 });
    io.observe(el);
    setProgress(0);
    raf = requestAnimationFrame(tick);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
  }, []);
  const shown = SCAN_SIGNALS.filter((s) => progress >= s.at);
  return (
    <div ref={ref} className="eg-scan-demo">
      <div className="eg-scan-doc" aria-hidden>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, color: 'var(--color-text-muted)', fontSize: 12 }}>
          <FileText size={14} /> fire-noc-signed.pdf
        </div>
        {LINES.map((wd, i) => (
          <div key={i} style={{ height: 7, width: `${wd}%`, borderRadius: 4, marginBottom: 11, background: 'var(--color-raised)', outline: i === 6 && progress >= 0.88 ? '1px dashed var(--color-warn-text)' : 'none' }} />
        ))}
        {progress < 1 && <div className="eg-scan-line" style={{ top: `${8 + progress * 84}%` }} />}
      </div>
      <ul className="eg-scan-signals" aria-label="Signals raised in this illustration">
        <AnimatePresence initial={false}>
          {shown.map((s) => (
            <m.li
              key={s.title}
              initial={{ opacity: 0, y: 14, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.2 } }}
              transition={{ type: 'spring', stiffness: 380, damping: 26 }}
              className="eg-card"
              style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: 14 }}
            >
              <s.icon size={18} aria-hidden style={{ color: s.tone, flexShrink: 0, marginTop: 2 }} />
              <span>
                <strong style={{ display: 'block', fontSize: 14 }}>{s.title}</strong>
                <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{s.detail}</span>
              </span>
            </m.li>
          ))}
        </AnimatePresence>
      </ul>
    </div>
  );
}
