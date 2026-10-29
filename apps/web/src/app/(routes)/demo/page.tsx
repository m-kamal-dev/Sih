import { DemoBar } from '@/components/features/DemoBar';
import Link from 'next/link';
import { DemoButton } from '@/components/molecules/DemoButton';

export default function DemoPage() {
  return (
    <div style={{ padding: 24, paddingBottom: 80 }}>
      <div className="eg-eyebrow">For presenters</div>
      <h1 style={{ fontSize: 'clamp(28px, 3.4vw, 40px)', color: 'var(--color-text)', margin: '6px 0 8px' }}>Demo Presenter View</h1>
      <p style={{ fontSize: 15, color: 'var(--color-text-muted)', maxWidth: 640, lineHeight: 1.6 }}>
        Start the guided 3-minute demo: it narrates each step, moves through the screens on its own, works offline, and can be paused or reset at any time. For a longer talk, use the beat chips at the bottom; the arrow keys move between beats.
      </p>
      <div style={{ marginTop: 16 }}><DemoButton className="eg-btn eg-btn-primary eg-btn-lg" /></div>

      <div className="eg-card" style={{ marginTop: 24, maxWidth: 720 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-muted)', margin: '0 0 16px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Real vs Simulated</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr>
              {['Component', 'Real', 'Simulated'].map((h) => (
                <th key={h} style={{ padding: '6px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', borderBottom: '1px solid var(--color-border)', textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              ['Rules + evidence check', 'Written rules are applied, and every finding must point to proof in the documents', '—'],
              ['Comparing institutions', 'Matching teachers, land and deposits across institutions', '—'],
              ['Decision history', 'Every action is chained to the previous one so edits are detected', '—'],
              ['AI document reading', 'On the Check a document page: real AI reading when a key is set (otherwise a labelled demo reader)', 'Sample applications use prepared readings'],
              ['External connectors', '—', 'Mock records and retry behavior'],
              ['Neo4j + Qdrant', '—', 'In-memory graph and similarity fixtures'],
              ['Document pages + crops', '—', 'Synthetic SVG pages and crop references'],
              ['Metrics', 'Computed from deterministic fixture data', '—'],
            ].map(([comp, real, sim]) => (
              <tr key={comp as string} style={{ borderBottom: '1px solid var(--color-border)' }}>
                <td style={{ padding: '7px 12px', color: 'var(--color-text)' }}>{comp}</td>
                <td style={{ padding: '7px 12px', color: 'var(--color-verified)', fontSize: 11 }}>{real}</td>
                <td style={{ padding: '7px 12px', color: 'var(--color-validity)', fontSize: 11 }}>{sim}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-muted)', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Quick Links</h3>
        {[
          ['/queue', 'Application Queue'],
          ['/applications/EOA-2026-0142/evidence', 'Vikramsheela — Evidence split-view'],
          ['/applications/INTK-2026-0208/graph', 'Silverleaf — Entity graph (ghost faculty)'],
          ['/applications/NEW-2026-0058/forensics', 'Devanhalli — Prompt injection signal'],
          ['/rules', 'Rules Administration'],
          ['/ledger', 'Audit Ledger'],
          ['/metrics', 'Metrics Dashboard'],
        ].map(([href, label]) => (
          <Link key={href as string} href={href as string} style={{ fontSize: 13, color: 'var(--color-accent-text)', textDecoration: 'none' }}>→ {label as string}</Link>
        ))}
      </div>

      <DemoBar />
    </div>
  );
}
