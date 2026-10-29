import Link from 'next/link';
import { getSummary, getFindings, getDocuments, getVerifications, getConflicts } from '@/.data/store';
import { notFound } from 'next/navigation';
import { FindingChip } from '@/components/atoms/FindingChip';
import { SlaChip } from '@/components/atoms/SlaChip';
import { ConfidenceBar } from '@/components/atoms/ConfidenceBar';
import { AiCaseCopilot } from '@/components/features/AiCaseCopilot';
import { SEVERITY_LABELS } from '@/lib/constants';
import type { FindingClass } from '@evidencegraph/domain';

const SEVERITY_RANK = { high: 3, medium: 2, low: 1 } as const;
const CATEGORY_LABELS: Record<string, string> = {
  EOA: 'Extension of approval',
  INTAKE_INCREASE: 'Intake increase',
  NEW_PROGRAMME: 'New programme',
};

const h3 = { fontSize: 13, fontWeight: 600, color: 'var(--color-text-muted)', marginTop: 0, marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-sans)' } as const;

export default async function OverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const summary = getSummary(id);
  if (!summary) notFound();

  const findings = getFindings(id);
  const documents = getDocuments(id);
  const verifications = getVerifications(id);
  const conflicts = getConflicts(id);
  const openFindings = findings.filter((f) => f.status === 'open');
  const top = [...openFindings]
    .sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity])
    .slice(0, 3);

  const byClass = openFindings.reduce<Record<string, number>>((acc, f) => {
    acc[f.findingClass] = (acc[f.findingClass] ?? 0) + 1;
    return acc;
  }, {});

  const verified = verifications.filter((v) => v.status === 'verified').length;
  const needAttention = verifications.filter((v) => v.status === 'mismatch' || v.status === 'expired' || v.status === 'source_unavailable' || v.status === 'manual_review').length;
  const base = `/applications/${id}`;
  const reasons = openFindings.length > 0 ? summary.triageReasons : [];

  return (
    <div style={{ padding: 'clamp(16px, 3vw, 28px)', display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 1180 }}>
      <AiCaseCopilot caseId={id} />

      <section aria-label="Case at a glance">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
          <Tile label="Documents" value={documents.length} href={`${base}/evidence`} />
          <Tile label="Open signals" value={openFindings.length} href={`${base}/conflicts`} />
          <Tile label="Cross-document conflicts" value={conflicts.length} href={`${base}/conflicts`} />
          <Tile label="Issuer checks verified" value={`${verified} of ${verifications.length}`} href={`${base}/verification`} />
          <Tile label="Checks needing attention" value={needAttention} href={`${base}/verification`} />
        </div>
      </section>

      <section className="eg-card">
        <h3 style={h3}>Institution</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
          <InfoRow label="AICTE ID" value={summary.institution.aicteId} mono />
          <InfoRow label="Trust registration no." value={summary.institution.trustRegNo} mono />
          <InfoRow label="Region" value={summary.institution.region} />
          <InfoRow label="Category" value={CATEGORY_LABELS[summary.institution.category] ?? summary.institution.category} />
          <InfoRow label="Status" value={summary.status.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())} />
          <InfoRow label="Time left" value={<SlaChip hoursLeft={summary.slaHoursLeft} />} />
        </div>
      </section>

      <section className="eg-card">
        <h3 style={h3}>Review priority</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12 }}>
          <div>
            <span style={{ fontSize: 40, fontWeight: 700, fontFamily: 'var(--font-mono)', color: summary.triageScore > 70 ? 'var(--color-alert)' : summary.triageScore > 40 ? 'var(--color-validity)' : 'var(--color-verified)' }}>
              {summary.triageScore}
            </span>
            <span style={{ fontSize: 14, color: 'var(--color-text-muted)', marginLeft: 4 }}>/100</span>
          </div>
          <ConfidenceBar value={summary.triageScore / 100} risk height={8} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {reasons.length === 0 && <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>No open findings are driving this score.</div>}
          {reasons.map((r, i) => (
            <div key={i} style={{ fontSize: 13, color: 'var(--color-text-muted)', display: 'flex', gap: 8 }}>
              <span aria-hidden style={{ color: 'var(--color-border-strong)' }}>▸</span>
              {r}
            </div>
          ))}
        </div>
        <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '14px 0 0' }}>
          The score only orders the queue so reviewers see the cases that need the most attention first. It is not a verdict about the institution.
        </p>
      </section>

      <section className="eg-card">
        <h3 style={h3}>Open signals ({openFindings.length})</h3>
        {openFindings.length === 0 ? (
          <div style={{ color: 'var(--color-text)', fontSize: 14 }}>
            No open signals from the checks that ran. This does not replace the standard issuer verification and officer review.
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
              {(Object.entries(byClass) as [FindingClass, number][]).map(([cls, n]) => (
                <FindingChip key={cls} findingClass={cls} label={`${n} ${n > 1 ? PLURAL[cls] : SINGULAR[cls]}`} />
              ))}
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 8 }}>Highest priority first</div>
            <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {top.map((f) => (
                <li key={f.id} style={{ border: '1px solid var(--color-border)', borderRadius: 14, padding: 14, background: 'var(--color-raised)' }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
                    <FindingChip findingClass={f.findingClass} />
                    <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{SEVERITY_LABELS[f.severity]} priority</span>
                    <span style={{ fontSize: 11, color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>{f.aphRef}</span>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--color-text)' }}>{f.summary}</div>
                </li>
              ))}
            </ol>
            <div style={{ marginTop: 12, fontSize: 13 }}>
              <Link href={`${base}/conflicts`} style={{ color: 'var(--color-accent-text)' }}>Open all findings and evidence</Link>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

const SINGULAR: Record<FindingClass, string> = {
  completeness_gap: 'completeness gap',
  validity_gap: 'validity gap',
  potential_discrepancy: 'potential discrepancy',
  anomaly_signal: 'anomaly signal',
  confirmed_violation: 'confirmed violation',
};
const PLURAL: Record<FindingClass, string> = {
  completeness_gap: 'completeness gaps',
  validity_gap: 'validity gaps',
  potential_discrepancy: 'potential discrepancies',
  anomaly_signal: 'anomaly signals',
  confirmed_violation: 'confirmed violations',
};

function Tile({ label, value, href }: { label: string; value: React.ReactNode; href: string }) {
  return (
    <Link href={href} className="eg-tile">
      <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 6, fontWeight: 600 }}>{label}</div>
      <div className="font-display" style={{ fontSize: 32, lineHeight: 1, color: 'var(--color-text)' }}>{value}</div>
    </Link>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      <div style={{ fontSize: 13, color: 'var(--color-text)', fontFamily: mono ? 'var(--font-mono)' : undefined }}>{value}</div>
    </div>
  );
}
