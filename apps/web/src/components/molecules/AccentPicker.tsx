'use client';
import { useEffect, useRef, useState } from 'react';
import { Check, Palette } from 'lucide-react';
import { ACCENTS, useThemeStore } from '@/store/theme-store';

/** Colour theme picker: four accent presets, all contrast-checked in both light and dark. */
export function AccentPicker() {
  const { accent, setAccent, init } = useThemeStore();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const current = ACCENTS.find((a) => a.id === accent) ?? ACCENTS[0];

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={wrap} style={{ position: 'relative' }}>
      <button
        type="button"
        className="eg-icon-btn"
        aria-expanded={open}
        aria-controls="eg-accent-menu"
        onClick={() => setOpen((v) => !v)}
        title="Colour theme"
      >
        <Palette size={15} aria-hidden />
        <span className="sr-only">Colour theme: {current.label}</span>
        <span aria-hidden style={{ width: 12, height: 12, borderRadius: 99, background: current.swatch, boxShadow: '0 0 0 1px var(--color-border-strong)' }} />
      </button>
      {open && (
        <div id="eg-accent-menu" role="radiogroup" aria-label="Colour theme" className="eg-glass eg-accent-menu">
          {ACCENTS.map((a) => (
            <button
              key={a.id}
              type="button"
              role="radio"
              aria-checked={a.id === accent}
              className="eg-accent-option"
              onClick={() => { setAccent(a.id); setOpen(false); }}
            >
              <span aria-hidden className="eg-accent-swatch" style={{ background: a.swatch }} />
              <span>{a.label}</span>
              {a.id === accent && <Check size={14} aria-hidden style={{ marginLeft: 'auto', color: 'var(--color-accent-text)' }} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
