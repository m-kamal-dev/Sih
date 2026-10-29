'use client';
import { create } from 'zustand';

/**
 * Visual effects tier. The pre-paint head script in layout.tsx picks a first
 * tier from cheap hints (reduced motion, save-data, memory, cores, user
 * choice) and writes it to <html data-effects>. After mount, `initEffects`
 * mirrors it here and refines "full" to "lite" when WebGL is unavailable,
 * a proxy for weak or software-rendered graphics.
 *
 * full: animated canvas, glass blur, spring motion.
 * lite: animated canvas with fewer nodes, no blur.
 * off:  static frames only (prefers-reduced-motion or "Reduce effects").
 */
export type EffectsTier = 'full' | 'lite' | 'off';

const STORAGE_KEY = 'eg-effects';

interface EffectsStore {
  tier: EffectsTier;
  userReduced: boolean;
  ready: boolean;
  init: () => void;
  setUserReduced: (reduced: boolean) => void;
}

function readTier(): EffectsTier {
  const value = document.documentElement.getAttribute('data-effects');
  return value === 'off' || value === 'lite' ? value : 'full';
}

function hasWebGl(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

function autoTier(): EffectsTier {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return 'off';
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  if (nav.connection?.saveData) return 'lite';
  if ((nav.deviceMemory ?? 8) <= 4 || (nav.hardwareConcurrency ?? 8) <= 4) return 'lite';
  return hasWebGl() ? 'full' : 'lite';
}

function apply(tier: EffectsTier) {
  document.documentElement.setAttribute('data-effects', tier);
}

export const useEffectsStore = create<EffectsStore>((set) => ({
  tier: 'full',
  userReduced: false,
  ready: false,
  init: () => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(STORAGE_KEY);
    } catch {
      /* storage blocked: fall back to auto */
    }
    const userReduced = stored === 'off';
    let tier = readTier();
    if (!userReduced && tier === 'full' && !hasWebGl()) tier = 'lite';
    apply(tier);
    set({ tier, userReduced, ready: true });
  },
  setUserReduced: (reduced) => {
    try {
      if (reduced) localStorage.setItem(STORAGE_KEY, 'off');
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* session-only */
    }
    const tier = reduced ? 'off' : autoTier();
    apply(tier);
    set({ tier, userReduced: reduced });
  },
}));

/** Inline pre-paint script: sets data-theme (dark default) and data-effects. */
export const PREPAINT_SCRIPT = `(function(){var d=document.documentElement;try{var t=localStorage.getItem('eg-theme');d.setAttribute('data-theme',t==='light'?'light':'dark');var a=localStorage.getItem('eg-accent');if(a==='aurora'||a==='jade'||a==='mono'||a==='saffron'){d.setAttribute('data-accent',a);}}catch(e){}var e='full';try{var s=localStorage.getItem('${STORAGE_KEY}');var n=navigator;if(s==='off'||matchMedia('(prefers-reduced-motion: reduce)').matches){e='off';}else if((n.connection&&n.connection.saveData)||(n.deviceMemory&&n.deviceMemory<=4)||(n.hardwareConcurrency&&n.hardwareConcurrency<=4)){e='lite';}}catch(x){}d.setAttribute('data-effects',e);})();`;
