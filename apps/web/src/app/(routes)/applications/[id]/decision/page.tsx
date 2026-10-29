'use client';
import { useParams } from 'next/navigation';
import { DecisionBar } from '@/components/features/DecisionBar';

export default function DecisionPage() {
  const params = useParams<{ id: string }>();
  return (
    <div style={{ height: '100%', overflow: 'hidden' }}>
      <DecisionBar appId={params.id} />
    </div>
  );
}
