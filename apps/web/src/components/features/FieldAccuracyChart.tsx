'use client';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

export interface FieldAccuracyEntry {
  docType: string;
  accuracy: number;
}

/**
 * Chart-only component (Phase 5): pulled out of MetricsBoard so the ~100 kB
 * recharts dependency is no longer on the metrics page's first-load path.
 * The lazy boundary lives in MetricsBoard via next/dynamic.
 */
export default function FieldAccuracyChart({ data }: { data: FieldAccuracyEntry[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ left: -10 }}>
        <XAxis dataKey="docType" tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }} angle={-20} textAnchor="end" height={50} />
        <YAxis tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }} tickFormatter={(v: number) => `${Math.round(v * 100)}%`} domain={[0, 1]} />
        <Tooltip
          formatter={(v: number) => `${(v * 100).toFixed(1)}%`}
          contentStyle={{ background: 'var(--color-overlay)', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: 12 }}
        />
        <Bar dataKey="accuracy" radius={[3, 3, 0, 0]}>
          {data.map((entry, i) => (
            <Cell key={i} fill={entry.accuracy > 0.9 ? 'var(--color-verified)' : entry.accuracy > 0.7 ? 'var(--color-accent)' : 'var(--color-mismatch)'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
