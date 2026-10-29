'use client';
import { useState, useEffect } from 'react';
import type { RunEvent } from '@evidencegraph/domain';
import { AGENT_NODE_ORDER, AGENT_NODE_LABELS } from '@/lib/constants';
import { CheckCircle, AlertCircle, RotateCcw, Circle, Play, RotateCw } from 'lucide-react';

interface PipelineDAGProps {
  events: RunEvent[];
}

const STATUS_ICONS = {
  ok: CheckCircle,
  sent_back: RotateCcw,
  interrupt: AlertCircle,
  skipped: Circle,
  pending: Circle,
} as const;

const STATUS_COLORS = {
  ok: 'var(--color-verified)',
  sent_back: 'var(--color-accent)',
  interrupt: 'var(--color-anomaly)',
  skipped: 'var(--color-pending)',
  pending: 'var(--color-border)',
};

/**
 * PipelineDAG — animated agent-graph replay.
 *
 * Nodes light up in sequence following the run timeline. A dashed edge
 * animates while the downstream node is active and stops when it finishes.
 * Human interrupt nodes (confidence_gate, critic) show a distinct HUMAN badge.
 * The Critic's sent_back status draws a returning edge label.
 *
 * Spec §5.5 signature moment #3.
 */
export function PipelineDAG({ events }: PipelineDAGProps) {
  const [selected, setSelected] = useState<string | null>(null);
  // visibleCount: how many nodes have been "revealed" so far in the replay
  const [visibleCount, setVisibleCount] = useState(0);
  const [replaying, setReplaying] = useState(false);

  // Start replay: stagger each node reveal by 600ms
  function startReplay() {
    setVisibleCount(0);
    setReplaying(true);
  }

  useEffect(() => {
    if (!replaying) return;
    if (visibleCount >= AGENT_NODE_ORDER.length) {
      setReplaying(false);
      return;
    }
    const t = setTimeout(() => setVisibleCount((v) => v + 1), 600);
    return () => clearTimeout(t);
  }, [replaying, visibleCount]);

  const eventMap = new Map(events.map((e) => [e.node, e]));
  // Show all nodes at rest (no replay), or up to visibleCount during replay
  const revealedNodes = replaying || visibleCount > 0
    ? new Set(AGENT_NODE_ORDER.slice(0, visibleCount))
    : new Set(AGENT_NODE_ORDER);

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--color-text)' }}>Agent Pipeline Replay</h3>
        <button
          onClick={startReplay}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', background: 'var(--color-raised)', border: '1px solid var(--color-border)', borderRadius: 6, cursor: 'pointer', fontSize: 12, color: 'var(--color-text-muted)' }}
        >
          {replaying ? <RotateCw size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Play size={12} />}
          {replaying ? 'Replaying…' : 'Replay run'}
        </button>
        <span style={{ fontSize: 11, color: 'var(--color-text-faint)' }}>
          Precomputed fixture run — deterministic (MOCK)
        </span>
      </div>

      <div style={{ display: 'flex', gap: 0, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {AGENT_NODE_ORDER.map((node, idx) => {
          const event = eventMap.get(node);
          const status = event?.status ?? 'pending';
          const revealed = revealedNodes.has(node);
          const isActive = replaying && visibleCount - 1 === idx; // currently animating node
          const color = revealed
            ? (STATUS_COLORS[status as keyof typeof STATUS_COLORS] ?? STATUS_COLORS.pending)
            : STATUS_COLORS.pending;
          const Icon = STATUS_ICONS[status as keyof typeof STATUS_ICONS] ?? Circle;
          const isSelected = selected === node;
          const isHuman = node === 'confidence_gate' || (node === 'critic' && status === 'interrupt');
          const isSentBack = node === 'critic' && status === 'sent_back';

          return (
            <div key={node} style={{ display: 'flex', alignItems: 'flex-start', gap: 0 }}>
              <div
                onClick={() => setSelected(isSelected ? null : node)}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, cursor: 'pointer' }}
              >
                <div style={{
                  width: 64, height: 64, borderRadius: 10,
                  background: `color-mix(in srgb, ${color} 15%, var(--color-surface))`,
                  border: `2px solid ${isSelected ? 'var(--color-accent)' : color}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'border-color 150ms ease, background 300ms ease, opacity 300ms ease',
                  opacity: revealed ? 1 : 0.25,
                  // scale only on click-selection, never on table rows per spec §5.4
                  transform: isActive ? 'scale(1.08)' : 'scale(1)',
                  boxShadow: isActive ? `0 0 16px color-mix(in srgb, ${color} 40%, transparent)` : 'none',
                }}>
                  <Icon size={22} style={{ color }} />
                </div>
                <span style={{ fontSize: 11, color: revealed ? 'var(--color-text-muted)' : 'var(--color-text-faint)', textAlign: 'center', maxWidth: 72, lineHeight: 1.3, transition: 'color 300ms ease' }}>
                  {AGENT_NODE_LABELS[node] ?? node}
                </span>
                {isHuman && (
                  <span style={{ fontSize: 9, padding: '1px 5px', background: 'color-mix(in srgb, var(--color-accent) 15%, transparent)', color: 'var(--color-accent)', borderRadius: 3 }}>
                    HUMAN
                  </span>
                )}
                {isSentBack && (
                  <span style={{ fontSize: 9, padding: '1px 5px', background: 'color-mix(in srgb, var(--color-anomaly) 15%, transparent)', color: 'var(--color-anomaly)', borderRadius: 3 }}>
                    ↩ SENT BACK
                  </span>
                )}
              </div>

              {/* Edge connector */}
              {idx < AGENT_NODE_ORDER.length - 1 && (
                <div style={{ width: 24, height: 2, marginTop: 31, flexShrink: 0, position: 'relative', overflow: 'visible' }}>
                  {/* Static base line */}
                  <div style={{ position: 'absolute', inset: 0, background: 'var(--color-border)' }} />
                  {/* Animated flowing dash while next node is active */}
                  {isActive && (
                    <div style={{
                      position: 'absolute',
                      inset: 0,
                      background: `repeating-linear-gradient(90deg, ${color} 0px, ${color} 4px, transparent 4px, transparent 8px)`,
                      animation: 'edge-flow 400ms linear infinite',
                    }} />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Selected event detail */}
      {selected && eventMap.has(selected) && (
        <div style={{ marginTop: 24, background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 10, padding: 16, animation: 'fadeIn 160ms var(--ease-enter)' }}>
          <h4 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600, color: 'var(--color-text)' }}>
            {AGENT_NODE_LABELS[selected] ?? selected}
          </h4>
          <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 8 }}>
            {eventMap.get(selected)?.summary}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <CodeBlock label="Inputs" data={eventMap.get(selected)?.inputs} />
            <CodeBlock label="Outputs" data={eventMap.get(selected)?.outputs} />
          </div>
        </div>
      )}

      <style>{`
        @keyframes edge-flow {
          from { background-position: 0 0; }
          to   { background-position: 8px 0; }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .pipeline-node { transition: opacity 80ms ease !important; }
        }
      `}</style>
    </div>
  );
}

function CodeBlock({ label, data }: { label: string; data: Record<string, unknown> | undefined }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 4, textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.06em' }}>{label}</div>
      <pre style={{ margin: 0, padding: 10, background: 'var(--color-code-bg)', borderRadius: 6, fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-code-text)', overflow: 'auto', maxHeight: 200 }}>
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}
