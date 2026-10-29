import { getSummary, getCaseHeader } from '@/.data/store';
import { ApplicationTabs } from '@/components/features/ApplicationTabs';
import { notFound } from 'next/navigation';

const CATEGORY_LABELS: Record<string, string> = {
  EOA: 'Extension of approval',
  INTAKE_INCREASE: 'Intake increase',
  NEW_PROGRAMME: 'New programme',
};

export default async function ApplicationLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const summary = getSummary(id);
  if (!summary) notFound();
  const header = getCaseHeader(id) ?? null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '20px clamp(16px, 3vw, 28px) 0', borderBottom: '1px solid var(--color-border)', background: 'linear-gradient(180deg, var(--color-accent-weak), var(--color-surface) 70%)' }}>
        <div style={{ marginBottom: 4, display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span style={{ fontSize: 12, color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>{id}</span>
          <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
            {CATEGORY_LABELS[summary.institution.category] ?? summary.institution.category} · {summary.institution.region}
          </span>
        </div>
        <h1 style={{ fontSize: 'clamp(24px, 2.8vw, 32px)', color: 'var(--color-text)', margin: '0 0 14px', lineHeight: 1.1 }}>
          {summary.institution.name}
        </h1>
        <ApplicationTabs id={id} header={header} />
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        {children}
      </div>
    </div>
  );
}
