'use client';
import { useQuery } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import { useRoleStore } from '@/store/role-store';
import { CypherDrawer } from '@/components/features/CypherDrawer';
import type { GraphSubgraph } from '@evidencegraph/domain';
import { Spinner } from '@/components/atoms/Spinner';
import { useParams } from 'next/navigation';

const GraphViewer = dynamic(
  () => import('@/components/features/GraphViewer').then((m) => m.GraphViewer),
  { ssr: false, loading: () => <div style={{ padding: 24, color: 'var(--color-text-muted)' }}>Loading graph…</div> },
);

export default function GraphPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { role } = useRoleStore();

  const { data: subgraph, isLoading } = useQuery<GraphSubgraph>({
    queryKey: ['graph', id],
    queryFn: async () => {
      const res = await fetch(`/api/applications/${id}/graph`, { headers: { 'x-eg-role': role } });
      return res.json() as Promise<GraphSubgraph>;
    },
  });

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--color-border)', background: 'var(--color-surface)' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)' }}>Entity Graph</span>
        {subgraph && <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{subgraph.nodes.length} nodes · {subgraph.edges.length} edges</span>}
        <div style={{ marginLeft: 'auto' }}>
          <CypherDrawer />
        </div>
      </div>
      <div style={{ flex: 1, position: 'relative' }}>
        {isLoading && <div style={{ padding: 24, display: 'flex', gap: 8, color: 'var(--color-text-muted)' }}><Spinner />Loading graph data…</div>}
        {subgraph && <GraphViewer subgraph={subgraph} focusId={id} />}
      </div>
    </div>
  );
}
