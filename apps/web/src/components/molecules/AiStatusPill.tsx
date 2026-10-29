'use client';
import { useQuery } from '@tanstack/react-query';
import { Cpu } from 'lucide-react';

type Health = { ai?: { mode: 'ai' | 'rules'; label: string } };

/** Shows "Ollama cloud: <model>" or "Rules-only mode", read from /api/health. */
export function AiStatusPill() {
  const { data } = useQuery<Health>({
    queryKey: ['health'],
    queryFn: async () => (await fetch('/api/health')).json() as Promise<Health>,
    staleTime: 60_000,
  });
  const ai = data?.ai;
  return (
    <span
      className="eg-pill eg-hide-narrow"
      title={ai?.mode === 'ai' ? 'AI reads and explains. In cloud mode the visible document text is sent to the AI service; hidden text never is.' : 'No AI key is set. Every check still runs with the built-in rules.'}
      style={{ color: ai?.mode === 'ai' ? 'var(--color-verified)' : 'var(--color-text-muted)', minWidth: 120 }}
    >
      <Cpu size={13} aria-hidden />
      {ai ? ai.label : 'Checking AI…'}
    </span>
  );
}
