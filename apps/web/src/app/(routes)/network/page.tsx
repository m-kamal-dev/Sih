'use client';
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import type cytoscape from 'cytoscape';
import type { Core } from 'cytoscape';
import { useRoleStore } from '@/store/role-store';
import { Spinner } from '@/components/atoms/Spinner';

interface Ring { id: string; members: { id: string; name: string }[]; links: { kind: string; display: string; entityId: string }[]; score: number }
interface NetData {
  graph: { nodes: { id: string; label: string; display: string }[]; edges: { id: string; source: string; target: string; type: string; severity?: string }[] };
  rings: Ring[]; sharedEntityCount: number; exposure: Record<string, number>; triage: Record<string, number>;
}

const COLORS: Record<string, string> = { Institution: '#5bc0eb', Trust: '#a78bfa', Person: '#e879a6', LandParcel: '#8b95a7', FDR: '#f5b942', Signatory: '#3ddc97', StampImage: '#a78bfa', Photo: '#e879a6' };

export default function NetworkPage() {
  const { role } = useRoleStore();
  const ref = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [sel, setSel] = useState<string | null>(null);

  const { data, isLoading } = useQuery<NetData>({
    queryKey: ['network', role],
    queryFn: async () => (await fetch('/api/network', { headers: { 'x-eg-role': role } })).json() as Promise<NetData>,
  });

  useEffect(() => {
    if (!data || !ref.current) return;
    let cancelled = false;
    let cy: Core | null = null;
    void (async () => {
    const { default: make } = await import('cytoscape');
    if (cancelled || !ref.current) return;
    const maxT = Math.max(1, ...Object.values(data.triage));
    cy = make({
      container: ref.current,
      elements: [
        ...data.graph.nodes.map((n) => ({ data: { id: n.id, label: n.display, t: n.label, risk: (data.triage[n.id] ?? 0) / maxT, exp: data.exposure[n.id] ?? 0 } })),
        ...data.graph.edges.map((e) => ({ data: { id: e.id, source: e.source, target: e.target, label: e.type, hi: e.severity === 'high' ? 1 : 0 } })),
      ],
      style: [
        { selector: 'node', style: { 'background-color': (el: cytoscape.NodeSingular) => COLORS[el.data('t') as string] ?? '#8b95a7', label: 'data(label)', color: '#e6eaf2', 'font-size': 9, 'text-valign': 'bottom', 'text-margin-y': 3, 'text-wrap': 'ellipsis', 'text-max-width': '90px',
          width: (el: cytoscape.NodeSingular) => el.data('t') === 'Institution' ? 26 + (el.data('risk') as number) * 34 : 14, height: (el: cytoscape.NodeSingular) => el.data('t') === 'Institution' ? 26 + (el.data('risk') as number) * 34 : 14,
          'border-width': (el: cytoscape.NodeSingular) => (el.data('exp') as number) > 0 ? 3 : 0, 'border-color': '#f2555a' } as Record<string, unknown> },
        { selector: 'edge', style: { width: 1.2, 'line-color': (el: cytoscape.EdgeSingular) => el.data('hi') ? '#f2555a' : '#49566b', 'curve-style': 'haystack', opacity: 0.7 } as Record<string, unknown> },
        { selector: '.dim', style: { opacity: 0.08 } },
        { selector: '.hide', style: { display: 'none' } },
      ],
      layout: { name: 'cose', animate: true, animationDuration: 900, nodeRepulsion: 9000, idealEdgeLength: 70 } as cytoscape.LayoutOptions,
    });
    const g = cy;
    g.on('tap', 'node', (ev) => {
      const n = ev.target as cytoscape.NodeSingular;
      g.elements().addClass('dim'); n.closedNeighborhood().removeClass('dim'); setSel(n.id());
    });
    g.on('tap', (ev) => { if (ev.target === g) { g.elements().removeClass('dim'); setSel(null); } });
    cyRef.current = cy;
    })();
    return () => { cancelled = true; cy?.destroy(); cyRef.current = null; };
  }, [data]);

  useEffect(() => {
    const cy = cyRef.current; if (!cy) return;
    cy.nodes().forEach((n) => { n.toggleClass('hide', hidden.has(n.data('t') as string)); });
  }, [hidden, data]);

  const focusRing = (r: Ring) => {
    const cy = cyRef.current; if (!cy) return;
    const ids = new Set([...r.members.map((m) => m.id), ...r.links.map((l) => l.entityId)]);
    const set = cy.nodes().filter((n) => ids.has(n.id()));
    cy.elements().addClass('dim'); set.closedNeighborhood().removeClass('dim');
    cy.animate({ fit: { eles: set, padding: 80 }, duration: 600 });
  };

  const types = Object.keys(COLORS);
  const selNode = sel ? data?.graph.nodes.find((n) => n.id === sel) : null;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '10px 16px', display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', borderBottom: '1px solid var(--color-border)', background: 'var(--color-surface)' }}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>Risk Network</span>
        {data && <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{data.graph.nodes.length} entities · {data.rings.length} linked rings · {data.sharedEntityCount} shared entities. Linked rings are signals for review, not verdicts.</span>}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {types.map((t) => (
            <button key={t} aria-pressed={!hidden.has(t)} onClick={() => setHidden((h) => { const n = new Set(h); if (n.has(t)) n.delete(t); else n.add(t); return n; })}
              style={{ fontSize: 11, padding: '3px 8px', borderRadius: 12, border: `1px solid ${COLORS[t]}`, background: hidden.has(t) ? 'transparent' : COLORS[t], color: hidden.has(t) ? 'var(--color-text-muted)' : '#0b0f17', cursor: 'pointer' }}>{t}</button>
          ))}
        </div>
      </div>
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <div style={{ flex: 1, position: 'relative' }}>
          {isLoading && <div style={{ padding: 24, display: 'flex', gap: 8 }}><Spinner />Building network…</div>}
          <div ref={ref} style={{ position: 'absolute', inset: 0, background: 'var(--color-canvas)' }} role="img" aria-label="Dataset-wide entity network" />
          <div style={{ position: 'absolute', left: 12, bottom: 10, fontSize: 11, color: 'var(--color-text-muted)' }}>Node size = triage score · red ring = entity shared across institutions · click a node to isolate its neighbourhood</div>
        </div>
        <aside style={{ width: 320, overflowY: 'auto', borderLeft: '1px solid var(--color-border)', background: 'var(--color-surface)', padding: 12 }}>
          {selNode && (
            <div style={{ marginBottom: 14, padding: 10, border: '1px solid var(--color-border)', borderRadius: 8 }}>
              <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{selNode.label}</div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{selNode.display}</div>
              {selNode.label === 'Institution' && <Link href={`/applications/${selNode.id}/overview`} style={{ fontSize: 12 }}>Open application →</Link>}
            </div>
          )}
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Linked rings (by risk)</div>
          {data?.rings.length === 0 && <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>No institutions share an entity.</div>}
          {data?.rings.map((r) => (
            <button key={r.id} onClick={() => focusRing(r)} style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: 8, padding: 10, borderRadius: 8, border: '1px solid var(--color-border)', background: 'transparent', color: 'inherit', cursor: 'pointer' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600 }}><span>{r.id}</span><span>score {r.score}</span></div>
              <div style={{ fontSize: 12, marginTop: 4 }}>{r.members.map((m) => m.name).join(' ↔ ')}</div>
              <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4 }}>via {r.links.map((l) => `${l.kind}: ${l.display}`).join('; ')}</div>
            </button>
          ))}
        </aside>
      </div>
    </div>
  );
}
