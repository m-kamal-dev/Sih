'use client';
import type { VerificationStatus } from '@evidencegraph/domain';
import { CheckCircle, XCircle, Clock, Loader2, PlugZap, UserRound } from 'lucide-react';
import { cn } from '@/lib/cn';
import { VERIFICATION_STATUS_LABELS, VERIFICATION_STATUS_COLORS } from '@/lib/constants';

const ICONS: Record<VerificationStatus, React.ComponentType<{ size?: number; className?: string }>> = {
  verified: CheckCircle,
  mismatch: XCircle,
  expired: Clock,
  pending: Loader2,
  source_unavailable: PlugZap,
  manual_review: UserRound,
};

interface VerificationPillProps {
  status: VerificationStatus;
  isMock?: boolean;
  className?: string;
}

export function VerificationPill({ status, isMock, className }: VerificationPillProps) {
  const Icon = ICONS[status];
  const base = VERIFICATION_STATUS_COLORS[status];
  const color = `color-mix(in srgb, ${base} 70%, var(--color-text))`;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium',
        className,
      )}
      style={{
        color,
        backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)`,
      }}
    >
      <Icon
        size={11}
        className={status === 'pending' ? 'animate-spin' : undefined}
      />
      <span>{VERIFICATION_STATUS_LABELS[status]}</span>
      {isMock && (
        <span
          className="ml-1 px-1 py-px text-[10px] rounded border"
          style={{
            borderColor: 'var(--color-validity)',
            color: 'var(--color-validity)',
            borderStyle: 'dashed',
          }}
        >
          MOCK
        </span>
      )}
    </span>
  );
}
