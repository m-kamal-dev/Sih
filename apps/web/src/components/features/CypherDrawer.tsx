'use client';
import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Terminal, X } from 'lucide-react';
import { CYPHER_GHOST_FACULTY, CYPHER_RECYCLED_LAND, CYPHER_REUSED_FDR } from '@/lib/constants';
import { CopyButton } from '@/components/atoms/CopyButton';

const QUERIES = [
  { label: 'Ghost Faculty', cypher: CYPHER_GHOST_FACULTY },
  { label: 'Recycled Land', cypher: CYPHER_RECYCLED_LAND },
  { label: 'Reused FDR', cypher: CYPHER_REUSED_FDR },
] as const;

export function CypherDrawer() {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button style={{ display:'flex',alignItems:'center',gap:6,padding:'6px 12px',background:'var(--color-raised)',border:'1px solid var(--color-border)',borderRadius:6,color:'var(--color-accent)',fontSize:12,cursor:'pointer',fontFamily:'var(--font-mono)' }}>
          <Terminal size={13} />CYPHER
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:9998 }} />
        <Dialog.Content style={{ position:'fixed',top:'50%',left:'50%',transform:'translate(-50%,-50%)',background:'var(--color-surface)',border:'1px solid var(--color-border)',borderRadius:10,padding:0,width:640,zIndex:9999,overflow:'hidden' }}>
          <div style={{ display:'flex',alignItems:'center',gap:10,padding:'12px 16px',borderBottom:'1px solid var(--color-border)',background:'var(--color-overlay)' }}>
            <Terminal size={14} style={{ color:'var(--color-ok)' }} />
            <Dialog.Title style={{ fontSize:14,fontWeight:600,color:'var(--color-text)',margin:0,fontFamily:'var(--font-mono)' }}>Search queries used — Cross-Institution Patterns</Dialog.Title>
            <Dialog.Close asChild>
              <button style={{ marginLeft:'auto',background:'none',border:'none',cursor:'pointer',color:'var(--color-text-muted)' }}><X size={16} /></button>
            </Dialog.Close>
          </div>
          <div style={{ display:'flex',borderBottom:'1px solid var(--color-border)' }}>
            {QUERIES.map((q, i) => (
              <button key={q.label} onClick={() => setActive(i)} style={{ flex:1,padding:'8px 16px',background: active === i ? 'var(--color-raised)' : 'none',border:'none',borderBottom: active === i ? '2px solid var(--color-accent)' : '2px solid transparent',cursor:'pointer',fontSize:12,color: active === i ? 'var(--color-text)' : 'var(--color-text-muted)',fontFamily:'var(--font-mono)' }}>
                {q.label}
              </button>
            ))}
          </div>
          <div style={{ position:'relative',padding:16 }}>
            <div style={{ position:'absolute',top:20,right:20,zIndex:1 }}>
              <CopyButton text={QUERIES[active]?.cypher ?? ''} />
            </div>
            <pre style={{ margin:0,padding:16,background:'var(--color-code-bg)',borderRadius:6,fontFamily:'var(--font-mono)',fontSize:12,color:'var(--color-code-text)',lineHeight:1.6,overflow:'auto',maxHeight:300,whiteSpace:'pre-wrap' }}>
              {QUERIES[active]?.cypher}
            </pre>
          </div>
          <div style={{ padding:'8px 16px',borderTop:'1px solid var(--color-border)',fontSize:11,color:'var(--color-text-faint)' }}>
            These queries run against the in-memory graph mirror (MOCK). Requires Neo4j in production.
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
