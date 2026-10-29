'use client';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { ApplicationSummary } from '@evidencegraph/domain';
import { useRoleStore } from '@/store/role-store';
import { SlaChip } from '@/components/atoms/SlaChip';
import { ConfidenceBar } from '@/components/atoms/ConfidenceBar';
import { FindingChip } from '@/components/atoms/FindingChip';
import { Spinner } from '@/components/atoms/Spinner';
import type { FindingClass } from '@evidencegraph/domain';

const CATEGORY_LABELS: Record<string, string> = {
  EOA: 'Extension of approval',
  INTAKE_INCREASE: 'Intake increase',
  NEW_PROGRAMME: 'New programme',
};

export function QueueTable() {
  const { role } = useRoleStore();
  const router = useRouter();

  const { data, isLoading, error } = useQuery<ApplicationSummary[]>({
    queryKey: ['applications', role],
    queryFn: async () => {
      const res = await fetch('/api/applications', { headers: { 'x-eg-role': role } });
      if (!res.ok) throw new Error('Failed to load');
      return res.json() as Promise<ApplicationSummary[]>;
    },
  });

  if (isLoading) {
    return (
      <div className="eg-card" style={{ padding: 16, display: 'grid', gap: 10 }} role="status" aria-label="Loading applications">
        <span style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--color-text-muted)', fontSize: 14 }}><Spinner />Loading applications…</span>
        {[0, 1, 2, 3, 4].map((i) => <div key={i} className="eg-skeleton" style={{ height: 52 }} aria-hidden />)}
      </div>
    );
  }
  if (error) {
    return (
      <div className="eg-card eg-error" role="alert">
        <div style={{ flex: 1 }}>
          <strong style={{ display: 'block' }}>The applications could not be loaded</strong>
          <span style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>The local server did not answer. Refresh the page to try again.</span>
        </div>
      </div>
    );
  }
  if ((data ?? []).length === 0) {
    return <div className="eg-card" style={{ color: 'var(--color-text-muted)' }}>No applications are waiting for review. New submissions will appear here.</div>;
  }

  const sorted = [...(data ?? [])].sort((a, b) => b.triageScore - a.triageScore);

  return (
    <div className="eg-card" style={{ overflow:'auto', padding: 0 }}>
      <table style={{ width:'100%',borderCollapse:'collapse',fontSize:13 }} role="grid">
        <thead>
          <tr style={{ borderBottom:'1px solid var(--color-border)' }}>
            <th style={thStyle}>Institution</th>
            <th style={thStyle}>Category</th>
            <th style={thStyle}>Region</th>
            {role !== 'applicant' && <th style={thStyle}>Priority</th>}
            <th style={thStyle}>Main reasons</th>
            <th style={thStyle}>Open signals</th>
            <th style={thStyle}>Time left</th>
            <th style={thStyle}>Status</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((app) => {
            const rowBg = app.triageScore > 70 ? 'color-mix(in srgb, var(--color-alert) 5%, transparent)' : app.triageScore > 40 ? 'color-mix(in srgb, var(--color-validity) 4%, transparent)' : 'transparent';
            return (
              <tr
                key={app.id}
                onClick={() => router.push(`/applications/${app.id}/overview`)}
                style={{ borderBottom:'1px solid var(--color-border)',cursor:'pointer',background:rowBg,transition:'background 120ms ease' }}
                className="queue-row"
              >
                <td style={tdStyle}>
                  <Link href={`/applications/${app.id}/overview`} onClick={(event) => event.stopPropagation()} style={{ fontWeight:500,color:'var(--color-text)',textDecoration:'none' }}>{app.institution.name}</Link>
                  <div style={{ fontSize:11,fontFamily:'var(--font-mono)',color:'var(--color-text-muted)' }}>{app.id}</div>
                </td>
                <td style={tdStyle}>
                  <span style={{ fontSize:11,padding:'2px 8px',borderRadius:99,background:'var(--color-raised)',color:'var(--color-text-muted)',whiteSpace:'nowrap' }}>{CATEGORY_LABELS[app.institution.category] ?? app.institution.category}</span>
                </td>
                <td style={{ ...tdStyle,color:'var(--color-text-muted)',fontSize:12,whiteSpace:'nowrap' }}>{app.institution.region}</td>
                {role !== 'applicant' && (
                  <td style={tdStyle}>
                    <div style={{ display:'flex',alignItems:'center',gap:6 }}>
                      <ConfidenceBar value={app.triageScore / 100} risk height={6} />
                      <span style={{ fontSize:11,fontFamily:'var(--font-mono)',color:'var(--color-text-muted)' }}>{app.triageScore}</span>
                    </div>
                  </td>
                )}
                <td style={tdStyle}>
                  <div style={{ display:'flex',flexDirection:'column',gap:2 }}>
                    {app.triageReasons.slice(0, 3).map((r, i) => (
                      <span key={i} style={{ fontSize:11,color:'var(--color-text-muted)' }}>{r}</span>
                    ))}
                  </div>
                </td>
                <td style={tdStyle}>
                  <div style={{ display:'flex',flexWrap:'wrap',gap:3 }}>
                    {(Object.entries(app.openByClass) as [FindingClass, number][]).filter(([, n]) => n > 0).map(([cls, n]) => (
                      <FindingChip key={cls} findingClass={cls} label={`${n}`} />
                    ))}
                    {app.openFindings === 0 && <span style={{ color:'var(--color-text-muted)',fontSize:12 }}>None open</span>}
                  </div>
                </td>
                <td style={tdStyle}><SlaChip hoursLeft={app.slaHoursLeft} /></td>
                <td style={tdStyle}>
                  <span style={{ fontSize:11,padding:'2px 6px',borderRadius:3,background:'var(--color-raised)',color:'var(--color-text-muted)',textTransform:'capitalize' }}>
                    {app.status.replace(/_/g, ' ')}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: '12px 14px',
  textAlign: 'left',
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--color-text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  background: 'var(--color-surface)',
  position: 'sticky',
  top: 0,
};

const tdStyle: React.CSSProperties = {
  padding: '12px 14px',
  verticalAlign: 'top',
};
