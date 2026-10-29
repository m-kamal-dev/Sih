'use client';
import { fmtDateTime, fmtDate } from '@/lib/format';

interface TimestampProps {
  iso: string | null | undefined;
  mode?: 'date' | 'datetime';
  className?: string;
}

export function Timestamp({ iso, mode = 'date', className }: TimestampProps) {
  if (!iso) return <span style={{ color: 'var(--color-text-faint)' }}>—</span>;
  const display = mode === 'datetime' ? fmtDateTime(iso) : fmtDate(iso);
  return (
    <time
      dateTime={iso}
      title={iso}
      className={className}
      style={{ color: 'var(--color-text-muted)', fontSize: '12px' }}
    >
      {display}
    </time>
  );
}
