import { LedgerTable } from '@/components/features/LedgerTable';

export default function LedgerPage() {
  return (
    <div>
      <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--color-border)', background: 'var(--color-surface)' }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-text)', margin: 0 }}>Decision history</h2>
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 4 }}>Every action is recorded and linked to the one before it. If anyone edits an old entry, the check shows exactly where the record was broken.</p>
      </div>
      <LedgerTable />
    </div>
  );
}
