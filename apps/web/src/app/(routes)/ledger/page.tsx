import { LedgerTable } from '@/components/features/LedgerTable';

export default function LedgerPage() {
  return (
    <div>
      <header className="eg-page-head" style={{ maxWidth: 'none' }}>
        <div className="eg-eyebrow">Audit trail</div>
        <h1>Decision history</h1>
        <p>Every action is recorded and linked to the one before it. If anyone edits an old entry, the check shows exactly where the record was broken.</p>
      </header>
      <LedgerTable />
    </div>
  );
}
