'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Sparkles, Send, RefreshCw } from 'lucide-react';
import type { CaseAnswer, CaseBrief } from '@/lib/ai-case';
import { useRoleStore } from '@/store/role-store';
import { CopyButton } from '@/components/atoms/CopyButton';
import { Spinner } from '@/components/atoms/Spinner';

type BriefPayload = { brief: CaseBrief; suggestedQuestions: string[] };
type ApiError = { error?: { message?: string } };

const card: React.CSSProperties = { background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 10, padding: 20 };
const h3: React.CSSProperties = { fontSize: 14, fontWeight: 600, color: 'var(--color-text-muted)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: 8 };
const label: React.CSSProperties = { fontSize: 12, color: 'var(--color-text-muted)', margin: '14px 0 6px' };
const list: React.CSSProperties = { margin: 0, paddingLeft: 18, fontSize: 13, display: 'flex', flexDirection: 'column', gap: 6 };

async function readJson<T>(res: Response, fallback: string): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as T & ApiError;
  if (!res.ok) throw new Error(body.error?.message ?? fallback);
  return body;
}

function ModeBadge({ mode }: { mode: 'ai' | 'rules' }) {
  const ai = mode === 'ai';
  return (
    <span
      style={{
        fontSize: 11, fontWeight: 700, textTransform: 'uppercase', padding: '2px 8px', borderRadius: 999,
        border: `1px solid ${ai ? 'var(--color-verified)' : 'var(--color-pending)'}`,
        color: ai ? 'var(--color-verified)' : 'var(--color-pending)',
      }}
    >
      {ai ? 'Written by AI' : 'Rules-based'}
    </span>
  );
}

function FindingLinks({ ids, caseId }: { ids: string[]; caseId: string }) {
  if (ids.length === 0) return null;
  return (
    <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap', marginLeft: 6 }}>
      {ids.map((fid) => (
        <Link
          key={fid}
          href={`/applications/${caseId}/conflicts`}
          title="Open this finding and its evidence"
          style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-accent-text)' }}
        >
          {fid}
        </Link>
      ))}
    </span>
  );
}

export function AiCaseCopilot({ caseId }: { caseId: string }) {
  const { role } = useRoleStore();
  const [data, setData] = useState<BriefPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState<CaseAnswer | null>(null);
  const [askError, setAskError] = useState<string | null>(null);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const mine = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/applications/${caseId}/ai-brief`, { headers: { 'x-eg-role': role } });
      const body = await readJson<BriefPayload>(res, 'The AI brief could not be loaded.');
      if (mine === requestId.current) setData(body);
    } catch (e) {
      if (mine === requestId.current) {
        setData(null);
        setError(e instanceof Error ? e.message : 'The AI brief could not be loaded.');
      }
    } finally {
      if (mine === requestId.current) setLoading(false);
    }
  }, [caseId, role]);

  useEffect(() => {
    void load();
  }, [load]);

  async function ask(text: string) {
    const q = text.trim();
    if (q.length < 3 || asking) return;
    setAsking(true);
    setAskError(null);
    setQuestion(q);
    try {
      const res = await fetch(`/api/applications/${caseId}/ai-ask`, {
        method: 'POST',
        headers: { 'x-eg-role': role, 'content-type': 'application/json' },
        body: JSON.stringify({ question: q }),
      });
      setAnswer(await readJson<CaseAnswer>(res, 'The question could not be answered.'));
    } catch (e) {
      setAnswer(null);
      setAskError(e instanceof Error ? e.message : 'The question could not be answered.');
    } finally {
      setAsking(false);
    }
  }

  const brief = data?.brief;
  const questionsText = brief?.questionsForInstitution.map((q, i) => `${i + 1}. ${q}`).join('\n') ?? '';

  return (
    <section style={card} aria-labelledby="ai-copilot-h">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h3 id="ai-copilot-h" style={h3}>
          <Sparkles size={15} aria-hidden /> AI case brief
        </h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {brief && <ModeBadge mode={brief.mode} />}
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            aria-label="Refresh the AI brief"
            style={{ background: 'none', border: '1px solid var(--color-border)', borderRadius: 6, padding: '4px 8px', cursor: loading ? 'wait' : 'pointer', color: 'var(--color-text-muted)', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12 }}
          >
            <RefreshCw size={12} aria-hidden /> Refresh
          </button>
        </div>
      </div>

      <div aria-live="polite">
        {loading && (
          <div role="status" style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--color-text-muted)', fontSize: 13, marginTop: 14 }}>
            <Spinner /> Reading this case…
          </div>
        )}
        {error && !loading && (
          <div role="alert" style={{ fontSize: 13, color: 'var(--color-danger-text)', marginTop: 14 }}>{error}</div>
        )}
        {brief && !loading && (
          <div style={{ marginTop: 12 }}>
            <p style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700, color: 'var(--color-text)' }}>{brief.headline}</p>
            <p style={{ margin: 0, fontSize: 14, color: 'var(--color-text)' }}>{brief.summary}</p>

            {brief.concerns.length > 0 && (
              <>
                <div style={label}>What matters most</div>
                <ul style={list}>
                  {brief.concerns.map((c, i) => (
                    <li key={i}>{c.text}<FindingLinks ids={c.findingIds} caseId={caseId} /></li>
                  ))}
                </ul>
              </>
            )}
            {brief.nextSteps.length > 0 && (
              <>
                <div style={label}>Suggested next steps</div>
                <ol style={list}>{brief.nextSteps.map((s, i) => <li key={i}>{s}</li>)}</ol>
              </>
            )}
            {brief.questionsForInstitution.length > 0 && (
              <>
                <div style={{ ...label, display: 'flex', alignItems: 'center', gap: 8 }}>
                  Questions to ask the institution <CopyButton text={questionsText} />
                </div>
                <ol style={list}>{brief.questionsForInstitution.map((s, i) => <li key={i}>{s}</li>)}</ol>
              </>
            )}
            <p style={{ margin: '14px 0 0', fontSize: 12, color: 'var(--color-text-muted)' }}>{brief.modeNote}</p>
          </div>
        )}
      </div>

      {!error && (
        <div style={{ marginTop: 18, borderTop: '1px solid var(--color-border)', paddingTop: 14 }}>
          <label htmlFor="ai-ask-input" style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)' }}>
            Ask about this case
          </label>
          {data && data.suggestedQuestions.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '8px 0' }}>
              {data.suggestedQuestions.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => void ask(q)}
                  disabled={asking}
                  style={{ fontSize: 12, padding: '4px 10px', borderRadius: 999, border: '1px solid var(--color-border-strong)', background: 'var(--color-raised)', color: 'var(--color-text)', cursor: asking ? 'wait' : 'pointer' }}
                >
                  {q}
                </button>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <input
              id="ai-ask-input"
              type="text"
              value={question}
              maxLength={500}
              placeholder="For example: which documents disagree about land area?"
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void ask(question); }}
              style={{ flex: 1, padding: '8px 10px', fontSize: 13, borderRadius: 6, border: '1px solid var(--color-border-strong)', background: 'var(--color-surface)', color: 'var(--color-text)' }}
            />
            <button
              type="button"
              onClick={() => void ask(question)}
              disabled={asking || question.trim().length < 3}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', fontSize: 13, fontWeight: 600, borderRadius: 6, border: 'none', background: 'var(--color-accent)', color: 'var(--color-accent-contrast)', cursor: asking ? 'wait' : 'pointer', opacity: asking || question.trim().length < 3 ? 0.6 : 1 }}
            >
              {asking ? <Spinner size={14} /> : <Send size={14} aria-hidden />} Ask
            </button>
          </div>
          <div aria-live="polite">
            {askError && <div role="alert" style={{ marginTop: 10, fontSize: 13, color: 'var(--color-danger-text)' }}>{askError}</div>}
            {answer && !asking && (
              <div style={{ marginTop: 12, padding: 12, borderRadius: 8, background: 'var(--color-raised)' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                  <ModeBadge mode={answer.mode} />
                  <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Answer to: {answer.question}</span>
                </div>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text)' }}>
                  {answer.answer}
                  <FindingLinks ids={answer.findingIds} caseId={caseId} />
                </p>
                <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--color-text-muted)' }}>{answer.modeNote}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
