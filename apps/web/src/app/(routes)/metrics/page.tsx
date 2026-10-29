import { MetricsBoard } from '@/components/features/MetricsBoard';

export default function MetricsPage() {
  return (
    <div>
      <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--color-border)', background: 'var(--color-surface)' }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-text)', margin: 0 }}>Results summary</h2>
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 4 }}>Worked out from the 12 sample institutions in this demo. These are not live figures.</p>
      </div>
      <MetricsBoard />
    </div>
  );
}
