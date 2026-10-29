'use client';
import { useId } from 'react';

/**
 * A technical term with a plain-language tooltip. Pure CSS show/hide on hover
 * and keyboard focus (no positioning library); Escape dismisses it by blurring.
 */
export function Term({ children, tip }: { children: React.ReactNode; tip: string }) {
  const id = useId();
  return (
    <span className="eg-term-wrap">
      <button
        type="button"
        className="eg-term"
        aria-describedby={id}
        onKeyDown={(e) => { if (e.key === 'Escape') e.currentTarget.blur(); }}
      >
        {children}
      </button>
      <span role="tooltip" id={id} className="eg-tip">{tip}</span>
    </span>
  );
}

export const TERMS = {
  revisions: 'A PDF can be saved again on top of itself. Each save adds a new version while older content stays inside the file, so changes can be compared.',
  signedRange: 'A digital signature covers specific bytes of the file. If bytes were added or changed outside that part after signing, the signature no longer covers the whole document.',
  fingerprint: 'A SHA-256 fingerprint is a short code computed from every byte of the file. Any change to the file gives a different code.',
  hiddenText: 'Text that is in the file but not visible on the page, for example white text or text drawn outside the page.',
} as const;
