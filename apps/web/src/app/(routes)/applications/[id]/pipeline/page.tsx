'use client';
import { useQuery } from '@tanstack/react-query';
import { useRoleStore } from '@/store/role-store';
import { PipelineDAG } from '@/components/features/PipelineDAG';
import type { RunEvent } from '@evidencegraph/domain';
import { Spinner } from '@/components/atoms/Spinner';
import { useParams } from 'next/navigation';

export default function PipelinePage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { role } = useRoleStore();

  const { data: events, isLoading } = useQuery<RunEvent[]>({
    queryKey: ['pipeline', id],
    queryFn: async () => {
      const res = await fetch(`/api/applications/${id}/pipeline`, { headers: { 'x-eg-role': role } });
      return res.json() as Promise<RunEvent[]>;
    },
  });

  if (isLoading) return <div style={{ padding: 24, display: 'flex', gap: 8, color: 'var(--color-text-muted)' }}><Spinner />Loading pipeline…</div>;

  return <PipelineDAG events={events ?? []} />;
}
