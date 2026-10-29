'use client';
import { Sparkles } from 'lucide-react';
import { useEffectsStore } from '@/store/effects-store';

/** Visible "Reduce effects" switch; also honoured automatically for prefers-reduced-motion. */
export function EffectsToggle({ compact = false }: { compact?: boolean }) {
  const { tier, userReduced, setUserReduced } = useEffectsStore();
  const reduced = userReduced || tier === 'off';
  return (
    <button
      type="button"
      className="eg-icon-btn"
      aria-pressed={reduced}
      onClick={() => setUserReduced(!userReduced)}
      title={reduced ? 'Effects are reduced. Click to restore animation.' : 'Reduce animation and visual effects'}
    >
      <Sparkles size={15} aria-hidden />
      {!compact && <span className="eg-hide-narrow">Reduce effects</span>}
      {compact && <span className="sr-only">Reduce effects</span>}
    </button>
  );
}
