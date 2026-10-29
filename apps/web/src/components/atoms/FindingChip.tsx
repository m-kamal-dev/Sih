'use client';
import type { FindingClass } from '@evidencegraph/domain';
import { FileMinus, Clock, GitCompare, ScanSearch, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/cn';
import { FINDING_CLASS_LABELS, FINDING_CLASS_COLORS } from '@/lib/constants';

const ICONS: Record<FindingClass, React.ComponentType<{ size?: number; className?: string }>> = {
  completeness_gap: FileMinus,
  validity_gap: Clock,
  potential_discrepancy: GitCompare,
  anomaly_signal: ScanSearch,
  confirmed_violation: ShieldAlert,
};

interface FindingChipProps {
  findingClass: FindingClass;
  label?: string;
  strength?: 'weak' | 'medium' | 'strong';
  className?: string;
}

export function FindingChip({ findingClass, label, strength, className }: FindingChipProps) {
  const Icon = ICONS[findingClass];
  const color = FINDING_CLASS_COLORS[findingClass];
  const displayLabel = label ?? FINDING_CLASS_LABELS[findingClass];

  const isWeak = findingClass === 'anomaly_signal' && strength === 'weak';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium',
        isWeak ? 'border' : 'bg-opacity-15',
        className,
      )}
      style={{
        color,
        borderColor: isWeak ? color : undefined,
        backgroundColor: isWeak ? 'transparent' : `color-mix(in srgb, ${color} 15%, transparent)`,
      }}
    >
      <Icon size={12} />
      <span>{displayLabel}</span>
      {strength && (
        <span className="opacity-70 text-[10px]">({strength})</span>
      )}
    </span>
  );
}
