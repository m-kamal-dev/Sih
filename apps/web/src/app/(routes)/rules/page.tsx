import { RulesAdmin } from '@/components/features/RulesAdmin';

export default function RulesPage() {
  return (
    <div>
      <header className="eg-page-head" style={{ maxWidth: 'none' }}>
        <div className="eg-eyebrow">Rule pack</div>
        <h1>Rules used to check applications</h1>
        <p>Each rule says what to check and raises a signal for an officer when it fails. Clause references to the AICTE handbook (APH 2024-27) are marked pending until confirmed.</p>
      </header>
      <RulesAdmin />
    </div>
  );
}
