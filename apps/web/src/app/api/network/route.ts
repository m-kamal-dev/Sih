import { NextResponse, type NextRequest } from 'next/server';
import { getGraph, getApplicationSummaries } from '@/.data/store';
import { requireRole, INTERNAL_ROLES } from '@/lib/api-auth';

/** Dataset-wide network: shared-entity links, linked rings (connected institutions), per-institution exposure. */
export async function GET(request: NextRequest) {
  const role = requireRole(request, INTERNAL_ROLES);
  if (typeof role !== 'string') return role;

  const full = getGraph();
  const nodes = full.nodes;
  const known = new Set(nodes.map((n) => n.id));
  // Drop edges whose endpoint is not a node (the seed has OWNS edges pointing at a missing trust).
  const edges = full.edges.filter((e) => known.has(e.source) && known.has(e.target));
  const droppedEdges = full.edges.length - edges.length;
  const summaries = getApplicationSummaries();
  const instIds = new Set(nodes.filter((n) => n.label === 'Institution').map((n) => n.id));
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  // entity -> institutions touching it (direct edges)
  const touch = new Map<string, Set<string>>();
  for (const e of edges) {
    for (const [a, b] of [[e.source, e.target], [e.target, e.source]] as const) {
      if (instIds.has(a) && !instIds.has(b)) {
        if (!touch.has(b)) touch.set(b, new Set());
        touch.get(b)!.add(a);
      }
    }
  }
  const shared = [...touch.entries()]
    .filter(([, s]) => s.size >= 2)
    .map(([id, s]) => ({ entityId: id, label: nodeById.get(id)?.label ?? 'Unknown', display: nodeById.get(id)?.display ?? id, institutions: [...s] }));

  // union-find over institutions linked by a shared entity
  const parent = new Map<string, string>();
  const find = (x: string): string => { if (!parent.has(x)) parent.set(x, x); const p = parent.get(x)!; if (p === x) return x; const r = find(p); parent.set(x, r); return r; };
  for (const s of shared) for (let i = 1; i < s.institutions.length; i++) parent.set(find(s.institutions[i]!), find(s.institutions[0]!));
  const groups = new Map<string, string[]>();
  for (const s of shared) for (const i of s.institutions) { const r = find(i); if (!groups.has(r)) groups.set(r, []); if (!groups.get(r)!.includes(i)) groups.get(r)!.push(i); }

  const triage = new Map(summaries.map((s) => [s.id, s.triageScore]));
  const rings = [...groups.values()].map((members, idx) => {
    const links = shared.filter((s) => members.includes(s.institutions[0]!));
    const score = Math.round(members.reduce((a, m) => a + (triage.get(m) ?? 0), 0) / members.length + links.length * 5);
    return {
      id: `RING-${idx + 1}`,
      members: members.map((m) => ({ id: m, name: nodeById.get(m)?.display ?? m })),
      links: links.map((l) => ({ kind: l.label, display: l.display, entityId: l.entityId })),
      score,
    };
  }).sort((a, b) => b.score - a.score).map((r, i) => ({ ...r, id: `RING-${i + 1}` }));

  const exposure: Record<string, number> = {};
  for (const s of shared) for (const i of s.institutions) exposure[i] = (exposure[i] ?? 0) + 1;

  return NextResponse.json({
    graph: { nodes, edges },
    rings,
    sharedEntityCount: shared.length,
    droppedEdges,
    exposure,
    triage: Object.fromEntries(triage),
  });
}
