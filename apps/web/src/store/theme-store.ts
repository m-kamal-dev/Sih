'use client';
import { create } from 'zustand';

export type Theme = 'dark' | 'light';

interface ThemeStore {
  theme: Theme;
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
  init: () => set({ theme: document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark' }),
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
