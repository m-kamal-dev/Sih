import { QueueTable } from '@/components/features/QueueTable';

export default function QueuePage() {
  return (
    <div>
      <header className="eg-page-head" style={{ maxWidth: 'none' }}>
        <div className="eg-eyebrow">Officer queue</div>
        <h1>Applications to review</h1>
        <p>Applications with the strongest signals are listed first, each with the main reasons. Click an application to open it.</p>
      </header>
      <div style={{ padding: 'clamp(16px, 3vw, 28px)' }}>
        <QueueTable />
      </div>
    </div>
  );
}
