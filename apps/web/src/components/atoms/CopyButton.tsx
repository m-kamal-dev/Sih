'use client';
import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

interface CopyButtonProps {
  text: string;
  size?: number;
}

export function CopyButton({ text, size = 14 }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <button
      onClick={handleCopy}
      title="Copy to clipboard"
      style={{
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: '2px',
        color: copied ? 'var(--color-verified)' : 'var(--color-text-muted)',
        transition: 'color 150ms ease',
      }}
    >
      {copied ? <Check size={size} /> : <Copy size={size} />}
    </button>
  );
}
