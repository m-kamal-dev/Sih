'use client';
import { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

const SHORTCUTS = [
  { key: 'J / K', description: 'Next / Previous item' },
  { key: 'Enter', description: 'Open selected item' },
  { key: 'A', description: 'Accept finding' },
  { key: 'D', description: 'Dismiss finding' },
  { key: 'E', description: 'Escalate finding' },
  { key: 'G', description: 'Jump to graph view' },
  { key: '/', description: 'Focus search' },
  { key: 'Ctrl K', description: 'Open the command palette' },
  { key: '?', description: 'Show shortcuts' },
  { key: 'Esc', description: 'Close / back' },
];

export function KeyboardShortcutsOverlay() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
        const tag = (e.target as HTMLElement).tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        setOpen((v) => !v);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:9998 }} />
        <Dialog.Content style={{ position:'fixed',top:'50%',left:'50%',transform:'translate(-50%,-50%)',background:'var(--color-overlay)',border:'1px solid var(--color-border)',borderRadius:10,padding:24,width:400,zIndex:9999 }}>
          <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16 }}>
            <Dialog.Title style={{ fontSize:15,fontWeight:600,color:'var(--color-text)' }}>Keyboard Shortcuts</Dialog.Title>
            <Dialog.Close asChild>
              <button style={{ background:'none',border:'none',cursor:'pointer',color:'var(--color-text-muted)' }}><X size={16} /></button>
            </Dialog.Close>
          </div>
          <table style={{ width:'100%',borderCollapse:'collapse' }}>
            <tbody>
              {SHORTCUTS.map((s) => (
                <tr key={s.key} style={{ borderBottom:'1px solid var(--color-border)' }}>
                  <td style={{ padding:'6px 0',width:80 }}>
                    <kbd style={{ fontFamily:'var(--font-mono)',fontSize:12,background:'var(--color-raised)',border:'1px solid var(--color-border)',borderRadius:4,padding:'2px 6px',color:'var(--color-accent)' }}>{s.key}</kbd>
                  </td>
                  <td style={{ padding:'6px 8px',fontSize:13,color:'var(--color-text-muted)' }}>{s.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
