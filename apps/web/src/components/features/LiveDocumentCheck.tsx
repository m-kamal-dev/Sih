'use client';
import { useEffect, useRef, useState } from 'react';
import * as m from 'motion/react-m';
import {
  FileUp, ShieldCheck, FileText, Download, CheckCircle2, AlertTriangle, MinusCircle, RotateCcw, ScanSearch,
  Fingerprint, History, PenLine, EyeOff, CalendarClock, Sparkles,
} from 'lucide-react';
import type { PdfAnalysis, PdfSignal } from '@evidencegraph/engine';
import type { AiReading } from '@/lib/ai-reader';
import type { CheckState } from '@/lib/ai-validate';
import { useRoleStore } from '@/store/role-store';
import { CopyButton } from '@/components/atoms/CopyButton';
import { Term, TERMS } from '@/components/atoms/Term';

const SAMPLES: { name: string; label: string; expect: string }[] = [
  { name: 'clean-fire-noc', label: 'Clean certificate', expect: 'Expect: nothing flagged' },
  { name: 'expired-fire-noc', label: 'Certificate expired', expect: 'Expect: marked as expired' },
  { name: 'edited-after-creation', label: 'Edited after creation', expect: 'Expect: shows what was changed' },
  { name: 'signed-intact', label: 'Signed, untouched', expect: 'Expect: signature still intact' },
  { name: 'signed-then-modified', label: 'Signed, then edited', expect: 'Expect: strong warning' },
  { name: 'hidden-instruction', label: 'Hidden text aimed at software', expect: 'Expect: flagged and ignored' },
];

const LEVEL_COPY: Record<PdfAnalysis['level'], { label: string; color: string; meter: number }> = {
  none: { label: 'Nothing unusual found', color: 'var(--color-verified)', meter: 0.06 },
  low: { label: 'Low attention', color: 'var(--color-pending)', meter: 0.33 },
  medium: { label: 'Medium attention', color: 'var(--color-validity)', meter: 0.66 },
  high: { label: 'High attention', color: 'var(--color-danger-text)', meter: 1 },
};

const CLASS_PLAIN: Record<string, string> = {
  anomaly_signal: 'Looks unusual',
  validity_gap: 'Expired or not valid',
  completeness_gap: 'Something is missing',
};

const STRENGTH: Record<PdfSignal['strength'], { label: string; color: string }> = {
  strong: { label: 'Strong signal', color: 'var(--color-danger-text)' },
  medium: { label: 'Medium signal', color: 'var(--color-validity)' },
  weak: { label: 'Weak signal', color: 'var(--color-pending)' },
};

const CHECK_STYLE: Record<CheckState, { label: string; color: string }> = {
  pass: { label: 'Looks fine', color: 'var(--color-verified)' },
  review: { label: 'Please review', color: 'var(--color-validity)' },
  missing: { label: 'Not found', color: 'var(--color-pending)' },
};

const EVIDENCE_LABELS: Record<string, string> = {
  firstBytesHex: 'First bytes of the file',
  signature: 'Signature number',
  byteRange: 'Signed part (byte range)',
  algorithm: 'Fingerprint method',
  coveredUpTo: 'Signature covers bytes up to',
  fileLength: 'File length (bytes)',
  bytesAfter: 'Bytes added after signing',
  eofMarkers: 'End-of-file markers',
  incrementalUpdates: 'Extra saved versions',
  changedLines: 'Lines changed between versions',
  producer: 'Made with',
  creator: 'Created in',
  creationDate: 'Created on',
  modDate: 'Last changed on',
  runs: 'Hidden text blocks',
  chars: 'Hidden characters',
  firstReason: 'Why it is hidden',
  firstSnippet: 'First hidden words',
  matches: 'Instruction-like phrases',
  firstMatch: 'First phrase',
  items: 'Active content found',
  embeddedFiles: 'Files embedded inside',
  imageStreams: 'Images',
  stated: 'Date as written',
  iso: 'Date',
  reviewDate: 'Review date',
  context: 'Where it appears',
};

function plainKey(key: string) {
  return EVIDENCE_LABELS[key] ?? key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

const SCAN_STEPS = [
  { icon: Fingerprint, label: 'Taking the file fingerprint' },
  { icon: History, label: 'Comparing saved versions' },
  { icon: PenLine, label: 'Checking the signed part of the file' },
  { icon: EyeOff, label: 'Looking for hidden text' },
  { icon: CalendarClock, label: 'Reading dates and validity' },
];

function calm() {
  return typeof document !== 'undefined' && document.documentElement.getAttribute('data-effects') === 'off';
}

type LastAction = { kind: 'sample'; name: string } | { kind: 'file'; file: File | Blob; name: string };

export function LiveDocumentCheck() {
  const { role } = useRoleStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PdfAnalysis | null>(null);
  const [dragging, setDragging] = useState(false);
  const [reading, setReading] = useState<AiReading | null>(null);
  const [readingBusy, setReadingBusy] = useState(false);
  const [readingError, setReadingError] = useState<string | null>(null);
  const [last, setLast] = useState<LastAction | null>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const [flash, setFlash] = useState<number | null>(null);

  async function readWithAi(file: File | Blob, name: string) {
    setReading(null);
    setReadingError(null);
    setReadingBusy(true);
    try {
      const form = new FormData();
      form.append('file', file, name);
      const res = await fetch('/api/ai/read', { method: 'POST', headers: { 'x-eg-role': role }, body: form });
      const body = (await res.json()) as AiReading | { error: { message: string } };
      if (!res.ok) throw new Error('error' in body ? body.error.message : 'The AI reading could not run.');
      setReading(body as AiReading);
    } catch (e) {
      setReadingError(e instanceof Error ? e.message : 'The AI reading could not run.');
    } finally {
      setReadingBusy(false);
    }
  }

  async function analyse(file: File | Blob, name: string) {
    setBusy(true);
    setError(null);
    setCurrent(name);
    setLast({ kind: 'file', file, name });
    void readWithAi(file, name);
    try {
      const form = new FormData();
      form.append('file', file, name);
      const res = await fetch('/api/forensics/analyze', { method: 'POST', headers: { 'x-eg-role': role }, body: form });
      const body = (await res.json()) as PdfAnalysis | { error: { message: string } };
      if (!res.ok) throw new Error('error' in body ? body.error.message : 'The check could not run.');
      setResult(body as PdfAnalysis);
    } catch (e) {
      setResult(null);
      setError(e instanceof Error ? e.message : 'The check could not run.');
    } finally {
      setBusy(false);
    }
  }

  async function loadSample(name: string) {
    setBusy(true);
    setError(null);
    setCurrent(`${name}.pdf`);
    try {
      const res = await fetch(`/api/forensics/samples/${name}`);
      if (!res.ok) throw new Error('The sample could not be loaded.');
      await analyse(await res.blob(), `${name}.pdf`);
      setLast({ kind: 'sample', name });
    } catch (e) {
      setBusy(false);
      setLast({ kind: 'sample', name });
      setError(e instanceof Error ? e.message : 'The sample could not be loaded.');
    }
  }

  function retry() {
    if (!last) return;
    if (last.kind === 'sample') void loadSample(last.name);
    else void analyse(last.file, last.name);
  }

  // Guided demo deep link: /analyze?sample=<name> runs that sample once on arrival.
  const autoRan = useRef(false);
  useEffect(() => {
    if (autoRan.current) return;
    const sample = new URLSearchParams(window.location.search).get('sample');
    if (sample && SAMPLES.some((s) => s.name === sample)) {
      autoRan.current = true;
      void loadSample(sample);
    }
  });

  /** Citation jump: scroll to the text line that contains the quoted value and flash it. */
  function jumpTo(value: string) {
    if (!result) return;
    const needle = value.trim().toLowerCase();
    const index = result.text.segments.findIndex((s) => !s.hidden && s.text.toLowerCase().includes(needle));
    if (index < 0) return;
    const el = textRef.current?.querySelector<HTMLElement>(`[data-seg="${index}"]`);
    el?.scrollIntoView({ behavior: calm() ? 'auto' : 'smooth', block: 'center' });
    el?.focus({ preventScroll: true });
    setFlash(index);
    window.setTimeout(() => setFlash(null), 1800);
  }

  if (role === 'applicant') {
    return (
      <div style={{ padding: 24 }}>
        <div className="eg-card" role="status">
          Technical detail is not shown to institutions. Use the self-check list to see what to fix.
        </div>
      </div>
    );
  }

  const hasOutput = Boolean(result || error || busy);

  return (
    <div style={{ padding: 'clamp(16px, 3vw, 28px)', display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 1180, margin: '0 auto' }}>
      <section className="eg-card" aria-labelledby="upload-h" style={{ padding: 'clamp(16px, 2.5vw, 24px)' }}>
        <h2 id="upload-h" className="eg-section-title" style={{ fontFamily: 'var(--font-sans)' }}>Upload a PDF to check</h2>
        <label
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const f = e.dataTransfer.files?.[0];
            if (f) void analyse(f, f.name);
          }}
          className="eg-dropzone"
          data-dragging={dragging || undefined}
        >
          <span className="eg-dropzone-icon"><FileUp size={22} aria-hidden /></span>
          <span style={{ fontSize: 15, color: 'var(--color-text)' }}>
            <strong>Drop a PDF here or choose a file.</strong>
            <br />
            <span style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>
              The file is read once and never saved. Up to 10 MB. If an AI key is set, the visible text is sent to the AI service to be read. Use synthetic samples for demos.
            </span>
          </span>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
            aria-label="Choose a PDF file to check"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void analyse(f, f.name); e.target.value = ''; }}
          />
        </label>

        <div style={{ marginTop: 18, fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 10 }}>
          No file at hand? Run one of these synthetic samples. Each is a real PDF you can also download.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(165px, 1fr))', gap: 10 }}>
          {SAMPLES.map((s) => (
            <div key={s.name} className="eg-sample" data-active={current === `${s.name}.pdf` || undefined}>
              <button
                type="button"
                onClick={() => void loadSample(s.name)}
                disabled={busy}
                className="eg-sample-run"
              >
                <ScanSearch size={15} aria-hidden /> {s.label}
              </button>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4 }}>{s.expect}</div>
              <a href={`/api/forensics/samples/${s.name}`} download style={{ fontSize: 12, color: 'var(--color-text-muted)', display: 'inline-flex', gap: 4, alignItems: 'center', marginTop: 8 }}>
                <Download size={12} aria-hidden /> Download PDF
              </a>
            </div>
          ))}
        </div>
      </section>

      {!hasOutput && <EmptyState />}
      {busy && <Scanning name={current} />}
      {error && !busy && (
        <section className="eg-card eg-error" role="alert">
          <AlertTriangle size={22} aria-hidden style={{ color: 'var(--color-danger-text)', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <strong style={{ display: 'block', fontSize: 15 }}>The check could not finish</strong>
            <span style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>{error}</span>
            <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 6 }}>Check that the file is a PDF under 10 MB, then try again.</div>
          </div>
          {last && <button type="button" className="eg-btn" onClick={retry}><RotateCcw size={14} aria-hidden /> Try again</button>}
        </section>
      )}
      {result && !busy && <Result r={result} />}
      {(readingBusy || reading || readingError) && !busy && (
        <AiReadingPanel reading={reading} busy={readingBusy} error={readingError} onCite={result ? jumpTo : undefined} />
      )}
      {result && !busy && <SourceText r={result} textRef={textRef} flash={flash} />}
      {result && !busy && <Limits r={result} />}
    </div>
  );
}

function EmptyState() {
  return (
    <section className="eg-card eg-empty" aria-label="What this check looks at">
      <div>
        <div className="eg-eyebrow">Nothing checked yet</div>
        <p style={{ margin: '6px 0 0', fontSize: 15, color: 'var(--color-text-muted)', maxWidth: 520 }}>
          Pick a sample above or drop your own PDF. In a few seconds you will see what the file reveals about its own history.
        </p>
      </div>
      <ul className="eg-empty-list">
        {SCAN_STEPS.map((s) => (
          <li key={s.label}><s.icon size={16} aria-hidden /> {s.label}</li>
        ))}
      </ul>
    </section>
  );
}

function Scanning({ name }: { name: string | null }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setStep((s) => Math.min(s + 1, SCAN_STEPS.length - 1)), 380);
    return () => window.clearInterval(id);
  }, []);
  return (
    <section className="eg-card eg-scanning" role="status" aria-live="polite" aria-label="Checking the file">
      <div className="eg-scan-doc" aria-hidden style={{ minHeight: 220 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, color: 'var(--color-text-muted)', fontSize: 12 }}>
          <FileText size={14} /> {name ?? 'document.pdf'}
        </div>
        {[80, 64, 92, 56, 74, 88, 50, 70].map((w, i) => (
          <div key={i} className="eg-skeleton" style={{ height: 8, width: `${w}%`, marginBottom: 12 }} />
        ))}
        <div className="eg-scan-line eg-scan-line-loop" />
      </div>
      <div style={{ flex: 1 }}>
        <strong style={{ fontSize: 16 }}>Checking {name ?? 'the file'}…</strong>
        <ul style={{ listStyle: 'none', margin: '12px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {SCAN_STEPS.map((s, i) => (
            <li key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: i <= step ? 'var(--color-text)' : 'var(--color-text-muted)', transition: 'color 200ms' }}>
              {i < step ? <CheckCircle2 size={16} aria-hidden style={{ color: 'var(--color-verified)' }} /> : <s.icon size={16} aria-hidden style={{ color: i === step ? 'var(--color-accent-text)' : undefined }} />}
              {s.label}
            </li>
          ))}
        </ul>
        <div style={{ display: 'grid', gap: 8, marginTop: 16 }} aria-hidden>
          <div className="eg-skeleton" style={{ height: 54 }} />
          <div className="eg-skeleton" style={{ height: 54 }} />
        </div>
      </div>
    </section>
  );
}

function Meter({ value, color, label }: { value: number; color: string; label: string }) {
  return (
    <div role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)} className="eg-meter">
      <m.span
        initial={{ scaleX: 0 }}
        animate={{ scaleX: value }}
        transition={{ type: 'spring', stiffness: 120, damping: 20 }}
        style={{ background: color }}
      />
    </div>
  );
}

function Revealed({ text }: { text: string }) {
  const [n, setN] = useState(text.length);
  useEffect(() => {
    if (calm()) return;
    setN(0);
    let i = 0;
    const id = window.setInterval(() => {
      i += Math.max(2, Math.ceil(text.length / 60));
      setN(Math.min(text.length, i));
      if (i >= text.length) window.clearInterval(id);
    }, 24);
    return () => window.clearInterval(id);
  }, [text]);
  return (
    <span>
      <span aria-hidden>{text.slice(0, n)}</span>
      <span className="sr-only">{text}</span>
    </span>
  );
}

function AiReadingPanel({ reading, busy, error, onCite }: { reading: AiReading | null; busy: boolean; error: string | null; onCite?: (value: string) => void }) {
  return (
    <section className="eg-card" aria-labelledby="ai-h">
      <h2 id="ai-h" className="eg-section-title" style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-sans)' }}>
        <Sparkles size={15} aria-hidden style={{ color: 'var(--color-accent-text)' }} /> What the AI read from this document
      </h2>
      {busy && (
        <div role="status" style={{ display: 'grid', gap: 10 }}>
          <span style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>The AI is reading the document…</span>
          <div className="eg-skeleton" style={{ height: 14, width: '70%' }} aria-hidden />
          <div className="eg-skeleton" style={{ height: 14, width: '55%' }} aria-hidden />
          <div className="eg-skeleton" style={{ height: 90 }} aria-hidden />
        </div>
      )}
      {error && <div style={{ fontSize: 14, color: 'var(--color-danger-text)' }} role="alert">{error}</div>}
      {reading && (
        <>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
            <span className="eg-pill" style={{ color: reading.mode === 'ai' ? 'var(--color-verified)' : 'var(--color-text-muted)' }}>
              {reading.mode === 'ai' ? `Read by AI${reading.model ? ` · ${reading.model}` : ''}` : 'Rules-only reading'}
            </span>
            <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{reading.modeNote}</span>
          </div>
          <p style={{ margin: '4px 0 0', fontSize: 15, lineHeight: 1.6 }}><strong>{reading.documentType}.</strong> <Revealed text={reading.summary} /></p>
          {reading.fields.length > 0 && (
            <div style={{ overflowX: 'auto', marginTop: 12 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead><tr><th scope="col" style={th}>What</th><th scope="col" style={th}>Value read</th><th scope="col" style={th}>Source</th><th scope="col" style={th}>How sure</th></tr></thead>
                <tbody>
                  {reading.fields.map((f, i) => (
                    <tr key={`${f.label}-${i}`}>
                      <td style={td}>{f.label}</td>
                      <td style={{ ...td, fontWeight: 600 }}>{f.value}</td>
                      <td style={td}>
                        {onCite ? (
                          <button type="button" className="eg-cite" onClick={() => onCite(f.value)} title="Show this line in the document text">
                            {f.where || 'Show in text'}
                          </button>
                        ) : <span style={{ color: 'var(--color-text-muted)' }}>{f.where}</span>}
                      </td>
                      <td style={{ ...td, minWidth: 150 }}>
                        <Meter value={f.confidence} label={`Confidence for ${f.label}`} color={f.confidence >= 0.8 ? 'var(--color-verified)' : f.confidence >= 0.5 ? 'var(--color-warn)' : 'var(--color-alert)'} />
                        <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{f.confidence >= 0.8 ? 'High' : f.confidence >= 0.5 ? 'Medium, please confirm' : 'Low, please confirm'}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <ValidationChecklist reading={reading} />
          {reading.attention.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 6 }}>Worth a person’s attention</div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {reading.attention.map((a, i) => <li key={i}>{a}</li>)}
              </ul>
            </div>
          )}
          <p style={{ margin: '14px 0 0', fontSize: 13, color: 'var(--color-text-muted)' }}>
            The AI only reads. It does not decide. Rules raise signals and a human officer makes every decision.
          </p>
        </>
      )}
    </section>
  );
}

function CheckIcon({ state }: { state: CheckState }) {
  const color = CHECK_STYLE[state].color;
  if (state === 'pass') return <CheckCircle2 size={16} color={color} aria-hidden />;
  if (state === 'review') return <AlertTriangle size={16} color={color} aria-hidden />;
  return <MinusCircle size={16} color={color} aria-hidden />;
}

function ValidationChecklist({ reading }: { reading: AiReading }) {
  const v = reading.validation;
  if (!v || v.checks.length === 0) return null;
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 8 }}>
        Automatic checks on what was read: {v.passed} look fine, {v.needsReview} to review, {v.missing} not found
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {v.checks.map((c) => (
          <li key={c.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14 }}>
            <span style={{ marginTop: 2 }}><CheckIcon state={c.state} /></span>
            <span>
              <strong>{c.title}</strong>
              <span style={{ color: CHECK_STYLE[c.state].color, marginLeft: 8, fontSize: 12, fontWeight: 700 }}>{CHECK_STYLE[c.state].label}</span>
              <br />
              <span style={{ color: 'var(--color-text-muted)' }}>{c.detail}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Result({ r }: { r: PdfAnalysis }) {
  const lvl = LEVEL_COPY[r.level];
  return (
    <>
      <section className="eg-card eg-result-head" aria-labelledby="res-h" style={{ borderColor: `color-mix(in oklab, ${lvl.color} 40%, var(--color-border))` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <span className="eg-result-badge" style={{ color: lvl.color, background: `color-mix(in oklab, ${lvl.color} 14%, transparent)` }}>
            <ShieldCheck size={22} aria-hidden />
          </span>
          <div style={{ flex: 1, minWidth: 220 }}>
            <h2 id="res-h" style={{ margin: 0, fontSize: 'clamp(22px, 2.4vw, 28px)', color: lvl.color }}>{lvl.label}</h2>
            <span style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>{r.signals.length} item{r.signals.length === 1 ? '' : 's'} worth checking</span>
          </div>
          <div style={{ minWidth: 200, flex: '0 1 260px' }}>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 6 }}>How much attention this file needs</div>
            <Meter value={lvl.meter} color={lvl.color} label="Attention level" />
          </div>
        </div>
        <p style={{ margin: '14px 0 4px', fontSize: 15 }}>{r.summary}</p>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--color-text-muted)' }}><strong>Next step:</strong> {r.nextStep}</p>
        <div style={{ marginTop: 14, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 13 }}>
          <FileText size={14} aria-hidden />
          <span>{r.fileName}</span>
          <span style={{ ...mono, color: 'var(--color-text-muted)' }}>{(r.sizeBytes / 1024).toFixed(1)} KB</span>
          <span style={{ color: 'var(--color-text-muted)' }}><Term tip={TERMS.fingerprint}>File fingerprint</Term> (SHA-256)</span>
          <span style={{ ...mono, color: 'var(--color-text-muted)', wordBreak: 'break-all' }}>{r.sha256}</span>
          <CopyButton text={r.sha256} />
        </div>
      </section>

      <section className="eg-card" aria-labelledby="sig-h">
        <h2 id="sig-h" className="eg-section-title" style={{ fontFamily: 'var(--font-sans)' }}>Things worth checking ({r.signals.length})</h2>
        {r.signals.length === 0 ? (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 14, color: 'var(--color-text-muted)' }}>
            <CheckCircle2 size={18} aria-hidden style={{ color: 'var(--color-verified)' }} />
            None of the checks that ran raised a signal. See “What this check did not cover” below.
          </div>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 12 }}>
            {r.signals.map((s, i) => (
              <m.li
                key={s.id}
                initial={{ opacity: 0, y: 16, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: 'spring', stiffness: 340, damping: 26, delay: i * 0.08 }}
                className="eg-signal"
                style={{ borderLeftColor: STRENGTH[s.strength].color }}
              >
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span className="eg-pill" style={{ color: STRENGTH[s.strength].color }}>{STRENGTH[s.strength].label}</span>
                  <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{CLASS_PLAIN[s.class] ?? s.class.replace(/_/g, ' ')}</span>
                </div>
                <div style={{ fontWeight: 650, fontSize: 16, margin: '8px 0 4px' }}>{s.title}</div>
                <div style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>{s.detail}</div>
                {Object.keys(s.evidence).length > 0 && (
                  <dl className="eg-evidence">
                    {Object.entries(s.evidence).map(([k, v]) => (
                      <div key={k} style={{ display: 'contents' }}>
                        <dt>{plainKey(k)}</dt>
                        <dd>{v === null ? 'not present' : String(v)}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </m.li>
            ))}
          </ul>
        )}
      </section>

      {r.revisionChanges.length > 0 && (
        <section className="eg-card" aria-labelledby="rev-h">
          <h2 id="rev-h" className="eg-section-title" style={{ fontFamily: 'var(--font-sans)' }}>
            What changed between <Term tip={TERMS.revisions}>saved versions</Term>
          </h2>
          <div style={{ display: 'grid', gap: 10 }}>
            {r.revisionChanges.map((c) => (
              <div key={c.objectNumber} className="eg-diff">
                <div>
                  <div className="eg-diff-head">Earlier version</div>
                  {c.removed.length === 0 ? <div className="eg-diff-none">nothing removed</div> : c.removed.map((t) => <div key={t} className="eg-diff-del"><span aria-hidden>−</span> <del>{t}</del></div>)}
                </div>
                <div>
                  <div className="eg-diff-head">Latest version</div>
                  {c.added.length === 0 ? <div className="eg-diff-none">nothing added</div> : c.added.map((t) => <div key={t} className="eg-diff-add"><span aria-hidden>+</span> <ins>{t}</ins></div>)}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {r.signatures.length > 0 && (
        <section className="eg-card" aria-labelledby="dsig-h">
          <h2 id="dsig-h" className="eg-section-title" style={{ fontFamily: 'var(--font-sans)' }}>Digital signature check</h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead><tr>
                <th scope="col" style={th}>#</th>
                <th scope="col" style={th}><Term tip={TERMS.signedRange}>Signed part of the file</Term></th>
                <th scope="col" style={th}>Fingerprint re-checked</th>
                <th scope="col" style={th}>Bytes added after signing</th>
              </tr></thead>
              <tbody>
                {r.signatures.map((s) => (
                  <tr key={s.index}>
                    <td style={td}>{s.index + 1}</td>
                    <td style={{ ...td, ...mono }}>{s.byteRange?.join(' ')}</td>
                    <td style={{ ...td, color: s.digestMatches === false ? 'var(--color-danger-text)' : s.digestMatches ? 'var(--color-verified)' : 'var(--color-text-muted)' }}>
                      {s.digestMatches === null ? 'Not readable' : s.digestMatches ? `${s.digestAlgorithm?.toUpperCase()} matches` : `${s.digestAlgorithm?.toUpperCase()} differs`}
                    </td>
                    <td style={{ ...td, color: s.bytesAfterSignedRange > 0 ? 'var(--color-danger-text)' : undefined }}>{s.bytesAfterSignedRange}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="eg-card" aria-labelledby="meta-h">
        <h2 id="meta-h" className="eg-section-title" style={{ fontFamily: 'var(--font-sans)' }}>About this file</h2>
        <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '8px 18px', fontSize: 14 }}>
          {([
            ['PDF version', r.pdfVersion], ['Pages', r.pageCount], ['Made with', r.metadata.producer], ['Created in', r.metadata.creator],
            ['Created on', r.metadata.creationDate], ['Last changed on', r.metadata.modDate], ['Saved versions', r.structure.incrementalUpdates + 1],
            ['Active content', r.structure.activeContent.join(', ') || 'none found'], ['Files embedded inside', r.structure.embeddedFiles],
          ] as [string, string | number | null][]).map(([k, v]) => (
            <div key={k} style={{ display: 'contents' }}>
              <dt style={{ color: 'var(--color-text-muted)' }}>{k}</dt>
              <dd style={{ margin: 0, ...mono, wordBreak: 'break-word' }}>{v ?? 'not present'}</dd>
            </div>
          ))}
        </dl>
        {r.dates.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 6 }}>Dates read from the visible text</div>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14 }}>
              {r.dates.map((d) => (
                <li key={d.raw + d.iso}>
                  <span style={mono}>{d.iso}</span>{' '}
                  <span style={{ color: 'var(--color-text-muted)' }}>({d.kind === 'validity_end' ? 'valid until' : d.kind === 'issue' ? 'issued on' : 'other date'})</span> · {d.context}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </>
  );
}

function SourceText({ r, textRef, flash }: { r: PdfAnalysis; textRef: React.RefObject<HTMLDivElement | null>; flash: number | null }) {
  return (
    <section className="eg-card" aria-labelledby="txt-h">
      <h2 id="txt-h" className="eg-section-title" style={{ fontFamily: 'var(--font-sans)' }}>
        Text found in the file ({r.text.extractedChars} characters{r.text.hiddenChars ? <>, {r.text.hiddenChars} <Term tip={TERMS.hiddenText}>hidden</Term></> : ''})
      </h2>
      {r.text.segments.length === 0 ? (
        <div style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>No readable text layer was found. Scanned images need a reading step that is not part of this check.</div>
      ) : (
        <div ref={textRef} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {r.text.segments.map((s, i) => (
            <div
              key={i}
              data-seg={i}
              tabIndex={-1}
              className={`eg-seg${s.hidden ? ' is-hidden' : ''}${flash === i ? ' is-flash' : ''}`}
            >
              <span style={{ color: 'var(--color-text-muted)' }}>p{s.page} </span>
              {s.text}
              {s.hidden && <span style={{ color: 'var(--color-warn-text)', marginLeft: 8 }}>[hidden: {s.reason}. Not sent to the AI]</span>}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function Limits({ r }: { r: PdfAnalysis }) {
  return (
    <section className="eg-card" aria-labelledby="lim-h">
      <h2 id="lim-h" className="eg-section-title" style={{ fontFamily: 'var(--font-sans)' }}>What this check did not cover</h2>
      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, color: 'var(--color-text-muted)', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {r.limits.map((l) => <li key={l}>{l}</li>)}
      </ul>
    </section>
  );
}

const mono: React.CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 13 };
const th: React.CSSProperties = { textAlign: 'left', padding: '8px 10px', fontSize: 12, fontWeight: 600, letterSpacing: '0.04em', color: 'var(--color-text-muted)', borderBottom: '1px solid var(--color-border)' };
const td: React.CSSProperties = { padding: '10px', verticalAlign: 'top', borderBottom: '1px solid var(--color-border)' };
