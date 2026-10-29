'use client';
import { Search } from 'lucide-react';
import { useUiStore } from '@/store/ui-store';

/** Opens the command palette (also Ctrl+K). Kept tiny: it only touches the UI store. */
export function PaletteButton() {
  const setPaletteOpen = useUiStore((s) => s.setPaletteOpen);
  return (
    <button type="button" className="eg-icon-btn" onClick={() => setPaletteOpen(true)} aria-keyshortcuts="Control+K" title="Search or jump to (Ctrl+K)">
      <Search size={14} aria-hidden />
      <span>Search<span className="eg-hide-narrow"> or jump to</span></span>
      <kbd className="eg-kbd eg-hide-narrow" aria-hidden>Ctrl K</kbd>
    </button>
  );
}
