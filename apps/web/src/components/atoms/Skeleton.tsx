import { cn } from '@/lib/cn';

interface SkeletonProps {
  className?: string;
  width?: string | number;
  height?: string | number;
}

/**
 * Skeleton placeholder — shimmer uses the global `skeleton-shimmer` keyframe
 * defined in globals.css (translateX only — GPU safe).
 * Under prefers-reduced-motion the global override sets animation-duration:80ms
 * and iteration-count:1, so the shimmer simply doesn't loop.
 */
export function Skeleton({ className, width, height }: SkeletonProps) {
  return (
    <div
      className={cn('overflow-hidden rounded', className)}
      style={{
        width,
        height: height ?? '1em',
        backgroundColor: 'var(--color-border)',
        position: 'relative',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(90deg, transparent 0%, color-mix(in srgb, var(--color-border-strong) 60%, transparent) 50%, transparent 100%)',
          animation: 'skeleton-shimmer 1.4s ease-in-out infinite',
          transform: 'translateX(-100%)',
        }}
      />
    </div>
  );
}
