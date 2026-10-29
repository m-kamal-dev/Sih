'use client';
import { useParams } from 'next/navigation';
import { LetterPreview } from '@/components/features/LetterPreview';

export default function LetterPage() {
  const params = useParams<{ id: string }>();
  return <LetterPreview appId={params.id} />;
}
