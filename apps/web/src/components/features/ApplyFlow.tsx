'use client';
import { useEffect, useState } from 'react';
import { CheckCircle2, CircleDashed, FileText, FileUp, Loader2, MinusCircle, AlertTriangle, X, ListChecks } from 'lucide-react';
import { useRoleStore } from '@/store/role-store';
import { APPLY_CATEGORIES, DOC_TYPES, OTHER_DOC, guessDocType, type ApplyCategory, type ChecklistItem, type FileCheck } from '@/lib/apply';

type Entry = { id: string; file: File; docType: string; status: 'queued' | 'checking' | 'done' | 'error'; result?: FileCheck; error?: string };

const STRENGTH = {
  strong: { label: 'Needs fixing', color: 'var(--color-danger-text)' },
  medium: { label: 'Please check', color: 'var(--color-validity)' },
  weak: { label: 'Minor', color: 'var(--color-pending)' },
} as const;

const field: React.CSSProperties = {
  width: '100%', minHeight: 42, padding: '0 12px', borderRadius: 10, border: '1px solid var(--color-border-strong)',
  background: 'var(--color-raised)', color: 'var(--color-text)', font: '400 15px var(--font-sans)',
};

/** Institution submission: form + multi-file upload, real per-file checks, checklist and one summary. */
export function ApplyFlow() {
  const { role } = useRoleStore();
  const [name, setName] = useState('');
  const [aicteId, setAicteId] = useState('');
  const [category, setCategory] = useState<ApplyCategory>('EOA');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [checklist, setChecklist] = useState<ChecklistItem[] | null>(null);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setChecklist(null);
    fetch(`/api/apply/checklist?category=${category}`, { headers: { 'x-eg-role': role } })
      .then((r) => (r.ok ? (r.json() as Promise<{ items: ChecklistItem[] }>) : { items: [] }))
      .then((d) => { if (live) setChecklist(d.items); })
      .catch(() => { if (live) setChecklist([]); });
    return () => { live = false; };
  }, [category, role]);

  function addFiles(list: FileList | null) {
    if (!list) return;
    const pdfs = Array.from(list).filter((f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
    setEntries((prev) => [...prev, ...pdfs.map((file, i) => ({ id: `${Date.now()}-${i}-${file.name}`, file, docType: guessDocType(file.name), status: 'queued' as const }))]);
    setFinished(false);
  }

  function update(id: string, patch: Partial<Entry>) {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }

  async function run() {
    if (!name.trim() || !aicteId.trim()) { setFormError('Enter the institution name and AICTE ID.'); return; }
    if (entries.length === 0) { setFormError('Add at least one PDF.'); return; }
    setFormError(null);
    setRunning(true);
    setFinished(false);
    for (const entry of entries) {
      update(entry.id, { status: 'checking', error: undefined });
      try {
        const form = new FormData();
        form.append('file', entry.file, entry.file.name);
        form.append('docType', entry.docType);
        const res = await fetch('/api/apply/check', { method: 'POST', headers: { 'x-eg-role': role }, body: form });
        const body = (await res.json()) as FileCheck | { error: { message: string } };
        if (!res.ok || 'error' in body) throw new Error('error' in body ? body.error.message : 'The check could not run.');
        update(entry.id, { status: 'done', result: body });
      } catch (e) {
        update(entry.id, { status: 'error', error: e instanceof Error ? e.message : 'The check could not run.' });
      }
    }
    setRunning(false);
    setFinished(true);
  }

  const uploadedTypes = new Set(entries.map((e) => e.docType));
  const missing = (checklist ?? []).filter((c) => !uploadedTypes.has(c.docType));
  const done = entries.filter((e) => e.status === 'done');
  const signals = done.flatMap((e) => (e.result?.signals ?? []).map((s) => ({ ...s, file: e.file.name })));
  const strong = signals.filter((s) => s.strength === 'strong').length;

  return (
    <div style={{ padding: 'clamp(16px, 3vw, 28px)', display: 'grid', gap: 20, maxWidth: 1180, margin: '0 auto' }}>
      <section className="eg-card" aria-labelledby="inst-h">
        <h2 id="inst-h" className="eg-section-title" style={{ fontFamily: 'var(--font-sans)' }}>1. Institution</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
          <label style={{ display: 'grid', gap: 6, fontSize: 14 }}>Institution name
            <input style={field} value={name} onChange={(e) => setName(e.target.value)} autoComplete="organization" placeholder="e.g. Sample Institute of Technology" />
          </label>
          <label style={{ display: 'grid', gap: 6, fontSize: 14 }}>AICTE ID
            <input style={field} value={aicteId} onChange={(e) => setAicteId(e.target.value)} placeholder="e.g. 1-1234567890" />
          </label>
          <label style={{ display: 'grid', gap: 6, fontSize: 14 }}>Application category
            <select style={field} value={category} onChange={(e) => setCategory(e.target.value as ApplyCategory)}>
              {APPLY_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </label>
        </div>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20, alignItems: 'start' }}>
        <section className="eg-card" aria-labelledby="files-h">
          <h2 id="files-h" className="eg-section-title" style={{ fontFamily: 'var(--font-sans)' }}>2. Documents</h2>
          <label className="eg-dropzone" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}>
            <span className="eg-dropzone-icon"><FileUp size={22} aria-hidden /></span>
            <span style={{ fontSize: 14 }}>
              <strong>Drop PDFs here or choose files.</strong><br />
              <span style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>Files are checked in memory and never saved. Up to 10 MB each.</span>
            </span>
            <input type="file" multiple accept="application/pdf,.pdf" aria-label="Choose PDF files" style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }} onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
          </label>
          {entries.length === 0 ? (
            <p style={{ fontSize: 14, color: 'var(--color-text-muted)', margin: '14px 0 0' }}>No documents yet. Tip: the synthetic samples on the Live check page can be downloaded and used here.</p>
          ) : (
            <ul style={{ listStyle: 'none', margin: '14px 0 0', padding: 0, display: 'grid', gap: 8 }}>
              {entries.map((e) => (
                <li key={e.id} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 10, alignItems: 'center', padding: 10, borderRadius: 12, border: '1px solid var(--color-border)', background: 'var(--color-raised)' }}>
                  <StatusIcon status={e.status} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.file.name}</div>
                    <select aria-label={`Document type for ${e.file.name}`} value={e.docType} disabled={running} onChange={(ev) => update(e.id, { docType: ev.target.value })} style={{ ...field, minHeight: 32, fontSize: 13, marginTop: 4 }}>
                      {Object.entries(DOC_TYPES).map(([k, d]) => <option key={k} value={k}>{d.label}</option>)}
                      <option value={OTHER_DOC}>Other document</option>
                    </select>
                    {e.error && <div role="alert" style={{ fontSize: 13, color: 'var(--color-danger-text)', marginTop: 4 }}>{e.error}</div>}
                  </div>
                  <button type="button" className="eg-icon-btn" disabled={running} onClick={() => setEntries((p) => p.filter((x) => x.id !== e.id))} aria-label={`Remove ${e.file.name}`}><X size={14} aria-hidden /></button>
                </li>
              ))}
            </ul>
          )}
          {formError && <p role="alert" style={{ color: 'var(--color-danger-text)', fontSize: 14, margin: '12px 0 0' }}>{formError}</p>}
          <button type="button" className="eg-btn eg-btn-primary eg-btn-lg" style={{ marginTop: 16, width: '100%' }} onClick={() => void run()} disabled={running}>
            {running ? <><Loader2 size={16} aria-hidden className="eg-spin" /> Checking {done.length + 1} of {entries.length}…</> : 'Check my application'}
          </button>
        </section>

        <section className="eg-card" aria-labelledby="check-h">
          <h2 id="check-h" className="eg-section-title" style={{ fontFamily: 'var(--font-sans)', display: 'flex', gap: 8, alignItems: 'center' }}><ListChecks size={15} aria-hidden /> 3. Completeness checklist</h2>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: '0 0 10px' }}>Documents the loaded rules read for this category. APH clause references are shown as “pending” until confirmed.</p>
          {checklist === null ? (
            <div style={{ display: 'grid', gap: 8 }} aria-hidden>{[0, 1, 2, 3].map((i) => <div key={i} className="eg-skeleton" style={{ height: 40 }} />)}</div>
          ) : checklist.length === 0 ? (
            <p style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>No rules apply to this category yet.</p>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
              {checklist.map((c) => {
                const have = uploadedTypes.has(c.docType);
                return (
                  <li key={c.docType} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14 }}>
                    {have ? <CheckCircle2 size={17} aria-hidden style={{ color: 'var(--color-verified)', marginTop: 2 }} /> : <MinusCircle size={17} aria-hidden style={{ color: 'var(--color-pending)', marginTop: 2 }} />}
                    <span>
                      <strong>{c.label}</strong> <span style={{ fontSize: 12, color: have ? 'var(--color-verified)' : 'var(--color-text-muted)' }}>{have ? 'Added' : 'Not added yet'}</span><br />
                      <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>APH reference: {c.reference} · rule{c.ruleIds.length > 1 ? 's' : ''} {c.ruleIds.join(', ')}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {finished && (
        <section className="eg-card" aria-labelledby="sum-h" style={{ borderColor: strong || missing.length ? 'color-mix(in oklab, var(--color-warn) 45%, var(--color-border))' : 'color-mix(in oklab, var(--color-ok) 45%, var(--color-border))' }}>
          <h2 id="sum-h" style={{ margin: '0 0 6px', fontSize: 'clamp(22px, 2.4vw, 28px)' }}>
            {strong === 0 && missing.length === 0 ? 'Ready for an officer to review' : 'A few things to fix before you submit'}
          </h2>
          <p style={{ margin: '0 0 14px', fontSize: 15, color: 'var(--color-text-muted)' }}>
            {name || 'Your institution'} · {APPLY_CATEGORIES.find((c) => c.value === category)?.label} · {done.length} of {entries.length} document{entries.length === 1 ? '' : 's'} checked · {signals.length} item{signals.length === 1 ? '' : 's'} to look at · {missing.length} missing document{missing.length === 1 ? '' : 's'}.
            These are signals for you and the reviewing officer, not a decision.
          </p>
          <ol style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 10, fontSize: 14 }}>
            {missing.map((m) => <li key={m.docType}><strong>Add the {m.label.toLowerCase()}.</strong> <span style={{ color: 'var(--color-text-muted)' }}>The rules for this category read it ({m.ruleIds.join(', ')}).</span></li>)}
            {signals.map((s, i) => (
              <li key={`${s.file}-${i}`}>
                <span style={{ color: STRENGTH[s.strength].color, fontWeight: 700, fontSize: 12 }}>{STRENGTH[s.strength].label}</span> · <strong>{s.file}</strong>: {s.title}<br />
                <span style={{ color: 'var(--color-text-muted)' }}>How to fix: {s.fix}</span>
              </li>
            ))}
            {entries.filter((e) => e.status === 'error').map((e) => <li key={e.id}><strong>{e.file.name}</strong>: could not be checked. {e.error}</li>)}
          </ol>
          {missing.length === 0 && signals.length === 0 && <p style={{ margin: 0, fontSize: 14 }}><CheckCircle2 size={16} aria-hidden style={{ color: 'var(--color-verified)', verticalAlign: '-3px' }} /> Every required document was added and no checks raised a signal.</p>}
          <div style={{ marginTop: 14, display: 'grid', gap: 6 }}>
            {done.map((e) => (
              <div key={e.id} style={{ fontSize: 13, color: 'var(--color-text-muted)', display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                <FileText size={13} aria-hidden /> <span style={{ color: 'var(--color-text)' }}>{e.file.name}</span>
                <span>{e.result?.reading.mode === 'ai' ? `Read by AI (${e.result.reading.model})` : 'Rules-only reading'}: {e.result?.reading.summary}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function StatusIcon({ status }: { status: Entry['status'] }) {
  if (status === 'checking') return <Loader2 size={18} aria-label="Checking" className="eg-spin" style={{ color: 'var(--color-accent-text)' }} />;
  if (status === 'done') return <CheckCircle2 size={18} aria-label="Checked" style={{ color: 'var(--color-verified)' }} />;
  if (status === 'error') return <AlertTriangle size={18} aria-label="Could not be checked" style={{ color: 'var(--color-danger-text)' }} />;
  return <CircleDashed size={18} aria-label="Waiting" style={{ color: 'var(--color-text-muted)' }} />;
}
