import { RulesAdmin } from '@/components/features/RulesAdmin';

export default function RulesPage() {
  return (
    <div>
      <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--color-border)', background: 'var(--color-surface)' }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-text)', margin: 0 }}>Rules used to check applications</h2>
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 4 }}>Each rule says what to check and which AICTE handbook clause (APH 2024-27) it comes from.</p>
      </div>
      <RulesAdmin />
    </div>
  );
}
