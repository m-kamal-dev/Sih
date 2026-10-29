import { getSummary } from '@/.data/store';
import { notFound } from 'next/navigation';
import { SelfCheckList } from '@/components/features/SelfCheckList';

export default async function SelfCheckPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const summary = getSummary(id);
  if (!summary) notFound();

  return (
    <div>
      <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--color-border)', background: 'var(--color-surface)' }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-text)', margin: 0 }}>
          Self-Check: {summary.institution.name}
        </h2>
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 4 }}>
          These are the problems found in your application. Fix each one before you submit.
        </p>
      </div>
      <SelfCheckList appId={id} />
    </div>
  );
}
