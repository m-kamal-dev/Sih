'use client';
import { Sun, Moon } from 'lucide-react';
import { useEffect } from 'react';
import { useThemeStore } from '@/store/theme-store';

/** Theme switch. Dark is the default; the choice persists to localStorage ("eg-theme"). */
export function ThemeToggle() {
  const { theme, init, setTheme } = useThemeStore();
  const dark = theme === 'dark';

  useEffect(() => {
    init();
  }, [init]);

  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      aria-label="Dark theme"
      title={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      onClick={(e) => setTheme(dark ? 'light' : 'dark', { x: e.clientX, y: e.clientY })}
      className="eg-icon-btn"
    >
      {dark ? <Moon size={15} aria-hidden /> : <Sun size={15} aria-hidden />}
    </button>
  );
}
