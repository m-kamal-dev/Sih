import type { Role } from '@evidencegraph/domain';
import { cn } from '@/lib/cn';

const ROLE_COLORS: Record<Role, string> = {
  scrutiny_officer: 'var(--color-accent)',
  senior_reviewer: 'var(--color-ok)',
  rule_admin: 'var(--color-validity)',
  auditor: 'var(--color-discrepancy)',
  applicant: 'var(--color-pending)',
};

const ROLE_LABELS: Record<Role, string> = {
  scrutiny_officer: 'Scrutiny Officer',
  senior_reviewer: 'Senior Reviewer',
  rule_admin: 'Rule Admin',
  auditor: 'Auditor',
  applicant: 'Applicant',
};

interface RoleBadgeProps {
  role: Role;
  className?: string;
}

export function RoleBadge({ role, className }: RoleBadgeProps) {
  const color = ROLE_COLORS[role];
  return (
    <span
      className={cn('inline-flex items-center px-2 py-0.5 rounded text-xs font-medium', className)}
      style={{
        color,
        backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)`,
      }}
    >
      {ROLE_LABELS[role]}
    </span>
  );
}
