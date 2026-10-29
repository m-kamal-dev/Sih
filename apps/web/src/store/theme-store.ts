'use client';
import { create } from 'zustand';

export type Theme = 'dark' | 'light';

export const ACCENTS = [
  { id: 'saffron', label: 'Saffron', swatch: 'linear-gradient(135deg, #F5A524, #FF6B3D)' },
  { id: 'aurora', label: 'Aurora', swatch: 'linear-gradient(135deg, #4C5AF0, #22D3EE)' },
  { id: 'jade', label: 'Jade', swatch: 'linear-gradient(135deg, #34D399, #22D3EE)' },
  { id: 'mono', label: 'Mono', swatch: 'linear-gradient(135deg, #F4F4F5, #52525B)' },
] as const;
export type Accent = (typeof ACCENTS)[number]['id'];

interface ThemeStore {
  theme: Theme;
  accent: Accent;
  setAccent: (accent: Accent) => void;
  init: () => void;
  setTheme: (theme: Theme, origin?: { x: number; y: number }) => void;
}

function write(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
  try {
    localStorage.setItem('eg-theme', theme);
  } catch {
    /* private mode: theme stays session-only */
  }
}

/**
 * data-theme is applied pre-paint by the head script; this store mirrors it
 * so the toggle and the command palette stay in sync. The swap uses a View
 * Transition circular reveal when available and effects are not reduced.
 */
export const useThemeStore = create<ThemeStore>((set) => ({
  theme: 'dark', // agrees with the SSR default to avoid a hydration mismatch
  accent: 'saffron',
  setAccent: (accent) => {
    document.documentElement.setAttribute('data-accent', accent);
    try {
      localStorage.setItem('eg-accent', accent);
    } catch {
      /* session-only */
    }
    set({ accent });
  },
  init: () => {
    const root = document.documentElement;
    const stored = root.getAttribute('data-accent');
    set({
      theme: root.getAttribute('data-theme') === 'light' ? 'light' : 'dark',
      accent: ACCENTS.find((a) => a.id === stored)?.id ?? 'saffron',
    });
  },
  setTheme: (theme, origin) => {
    const doc = document as Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void> } };
    const calm = document.documentElement.getAttribute('data-effects') === 'off';
    const commit = () => {
      write(theme);
      set({ theme });
    };
    if (!doc.startViewTransition || calm) {
      commit();
      return;
    }
    const x = origin?.x ?? window.innerWidth - 80;
    const y = origin?.y ?? 28;
    const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
    doc.startViewTransition(commit).ready.then(() => {
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        { duration: 380, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', pseudoElement: '::view-transition-new(root)' },
      );
    }).catch(() => undefined);
  },
}));
