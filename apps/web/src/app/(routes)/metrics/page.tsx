import { MetricsBoard } from '@/components/features/MetricsBoard';

export default function MetricsPage() {
  return (
    <div>
      <header className="eg-page-head" style={{ maxWidth: 'none' }}>
        <div className="eg-eyebrow">Evaluation</div>
        <h1>Results summary</h1>
        <p>Worked out from the 12 sample institutions in this demo. These are not live figures.</p>
      </header>
      <MetricsBoard />
    </div>
  );
}
