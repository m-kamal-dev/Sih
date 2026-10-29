import { useId } from 'react';

/** EvidenceGraph mark: a document node with three linked evidence nodes. */
export function BrandMark({ size = 24 }: { size?: number }) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden focusable="false">
      <defs>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--color-accent)" />
          <stop offset="1" stopColor="var(--color-accent-2)" />
        </linearGradient>
      </defs>
      <g stroke={`url(#${id}g)`} strokeWidth="2" fill="none" strokeLinecap="round">
        <path d="M16 16 L6 7 M16 16 L27 9 M16 16 L23 27" />
        <rect x="11" y="10" width="10" height="12" rx="2.5" fill="var(--color-surface)" />
        <path d="M14 14h4 M14 17.5h4" />
      </g>
      <circle cx="6" cy="7" r="3" fill={`url(#${id}g)`} />
      <circle cx="27" cy="9" r="2.5" fill={`url(#${id}g)`} />
      <circle cx="23" cy="27" r="2.5" fill={`url(#${id}g)`} />
    </svg>
  );
}
