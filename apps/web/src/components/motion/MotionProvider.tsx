'use client';
import { LazyMotion, MotionConfig } from 'motion/react';
import { useEffectsStore } from '@/store/effects-store';

const loadFeatures = () => import('./motion-features').then((mod) => mod.default);

/**
 * Wraps the app in LazyMotion (strict: only the small `m` components are
 * allowed) and turns spring/transform motion off when effects are "off".
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  const tier = useEffectsStore((s) => s.tier);
  return (
    <LazyMotion features={loadFeatures} strict>
      <MotionConfig reducedMotion={tier === 'off' ? 'always' : 'user'}>{children}</MotionConfig>
    </LazyMotion>
  );
}
