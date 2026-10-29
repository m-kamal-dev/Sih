'use client';
import { Search } from 'lucide-react';
import { useUiStore } from '@/store/ui-store';

/** Opens the command palette (also Ctrl+K). Kept tiny: it only touches the UI store. */
export function PaletteButton() {
  const setPaletteOpen = useUiStore((s) => s.setPaletteOpen);
  return (
    <button type="button" className="eg-icon-btn" onClick={() => setPaletteOpen(true)} aria-label="Search or jump to (Ctrl+K)">
      <Search size={14} aria-hidden />
      <span className="eg-hide-narrow">Search or jump to</span>
      <kbd className="eg-kbd eg-hide-narrow" aria-hidden>Ctrl K</kbd>
    </button>
  );
}
