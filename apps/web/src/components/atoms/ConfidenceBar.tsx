interface ConfidenceBarProps {
  value: number; // 0..1
  threshold?: number; // optional; below = alert color
  showLabel?: boolean;
  height?: number;
  /** risk scale: a HIGH value is bad (triage). Default scale: a LOW value is bad (OCR confidence). */
  risk?: boolean;
}

export function ConfidenceBar({ value, threshold = 0.7, showLabel, height = 4, risk = false }: ConfidenceBarProps) {
  const pct = Math.round(value * 100);
  const isLow = value < threshold;
  const color = risk
    ? value >= 0.7 ? 'var(--color-alert)' : value >= 0.4 ? 'var(--color-validity)' : 'var(--color-verified)'
    : isLow ? 'var(--color-alert)' : value > 0.9 ? 'var(--color-verified)' : 'var(--color-accent)';

  return (
    <span className="inline-flex items-center gap-1.5" style={{ minWidth: 80 }}>
      <span
        style={{
          display: 'inline-block',
          width: 60,
          height,
          backgroundColor: 'var(--color-border)',
          borderRadius: 2,
          overflow: 'hidden',
        }}
      >
        <span
          style={{
            display: 'block',
            width: '100%',
            height: '100%',
            backgroundColor: color,
            /* scaleX keeps the fill animating on the compositor only; the
               track width never reflows. Reduced motion swaps to 80ms opacity. */
            transform: `scaleX(${pct / 100})`,
            transformOrigin: 'left center',
            transition: 'transform 200ms cubic-bezier(0.2, 0, 0, 1)',
          }}
        />
      </span>
      {showLabel && (
        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          {pct}%
        </span>
      )}
    </span>
  );
}
