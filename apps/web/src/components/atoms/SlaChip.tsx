import { fmtSla } from '@/lib/format';

interface SlaChipProps {
  hoursLeft: number;
}

export function SlaChip({ hoursLeft }: SlaChipProps) {
  const base =
    hoursLeft < 0
      ? 'var(--color-danger-text)'
      : hoursLeft < 4
        ? 'var(--color-danger-text)'
        : hoursLeft < 24
          ? 'var(--color-validity)'
          : 'var(--color-text-muted)';

  const color = `color-mix(in srgb, ${base} 70%, var(--color-text))`;

  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 6px',
        fontSize: '12px',
        color,
        backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)`,
        borderRadius: 4,
        fontFamily: 'var(--font-mono)',
      }}
    >
      {fmtSla(hoursLeft)}
    </span>
  );
}
