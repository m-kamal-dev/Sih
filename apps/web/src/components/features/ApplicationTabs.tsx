'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import type { CaseHeader } from '@/.data/store';

/** Workflow order (Phase 3 IA): exactly the order an officer works a case. */
type TabCountKey = 'documents' | 'mismatches' | 'checks' | 'connections';

interface WorkspaceTab {
  segment: string;
  label: string;
  count?: TabCountKey;
}

const TABS: readonly WorkspaceTab[] = [
  { segment: 'overview', label: 'Overview' },
  { segment: 'evidence', label: 'Evidence', count: 'documents' },
  { segment: 'conflicts', label: 'Conflicts', count: 'mismatches' },
  { segment: 'forensics', label: 'Forensics' },
  { segment: 'verification', label: 'Verification', count: 'checks' },
  { segment: 'graph', label: 'Graph', count: 'connections' },
  { segment: 'pipeline', label: 'Pipeline' },
  { segment: 'decision', label: 'Decision' },
  { segment: 'letter', label: 'Letter' },
];

/** Maps the header's next-step section to the workspace tab it names. */
const SECTION_SEGMENT = {
  summary: 'overview',
  documents: 'evidence',
  mismatches: 'conflicts',
  checks: 'verification',
  connections: 'graph',
  report: 'decision',
} as const;

export function ApplicationTabs({ id, header }: { id: string; header?: CaseHeader | null }) {
  const pathname = usePathname();

  const next = header
    ? { label: header.nextStep.label, href: `/applications/${id}/${SECTION_SEGMENT[header.nextStep.section]}` }
    : null;

  return (
    <div
      aria-label="Case workspace sections"
      style={{ display: 'flex', alignItems: 'stretch', gap: 0 }}
    >
      <nav style={{ display: 'flex', gap: 0, overflowX: 'auto', flex: 1 }}>
        {TABS.map((tab) => {
          const href = `/applications/${id}/${tab.segment}`;
          const active = pathname === href || pathname.startsWith(href + '/');
          const count = header && tab.count ? header.counts[tab.count] : undefined;
          return (
            <Link
              key={tab.segment}
              href={href}
              aria-current={active ? 'page' : undefined}
              style={{
                padding: '8px 14px',
                fontSize: 13,
                color: active ? 'var(--color-text)' : 'var(--color-text-muted)',
                textDecoration: 'none',
                borderBottom: active ? '2px solid var(--color-accent)' : '2px solid transparent',
                whiteSpace: 'nowrap',
                transition: 'color 120ms ease, border-color 120ms ease',
                marginBottom: -1,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              {tab.label}
              {count !== undefined && count > 0 && (
                <span
                  aria-label={`${count} ${tab.label.toLowerCase()} items`}
                  style={{
                    fontSize: 10,
                    fontFamily: 'var(--font-mono)',
                    padding: '1px 5px',
                    borderRadius: 999,
                    background: 'var(--color-raised)',
                    color: 'var(--color-text-muted)',
                  }}
                >
                  {count}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
      {next && (
        <Link
          href={next.href}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12,
            fontWeight: 600,
            padding: '6px 12px',
            margin: '2px 0 2px 12px',
            borderRadius: 6,
            textDecoration: 'none',
            background: 'var(--color-accent)',
            color: 'var(--color-accent-contrast)',
            whiteSpace: 'nowrap',
            transition: 'opacity 120ms ease',
          }}
          title={`Go to the ${next.label.toLowerCase()}`}
        >
          Next: {next.label}
          <ArrowRight size={12} />
        </Link>
      )}
    </div>
  );
}
