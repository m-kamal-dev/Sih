'use client';
import { useParams } from 'next/navigation';
import { VerificationTimeline } from '@/components/features/VerificationTimeline';

export default function VerificationPage() {
  const params = useParams<{ id: string }>();
  return <VerificationTimeline appId={params.id} />;
}
