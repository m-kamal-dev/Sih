'use client';
import { useMemo, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Search, CornerDownLeft } from 'lucide-react';
import type { ApplicationSummary } from '@evidencegraph/domain';
import { useRoleStore } from '@/store/role-store';
import { ACCENTS, useThemeStore } from '@/store/theme-store';
import { useEffectsStore } from '@/store/effects-store';
import { useJudgeStore } from '@/store/judge-store';

interface Command {
  id: string;
  group: 'Go to' | 'Actions' | 'Applications';
  label: string;
  hint?: string;
  run: () => void;
}

const PAGES: [string, string][] = [
  ['/', 'Home'],
  ['/queue', 'Applications to review'],
  ['/apply', 'Check an application (institution)'],
  ['/analyze', 'Check a document (live)'],
  ['/network', 'Linked institutions'],
  ['/rules', 'Rules'],
  ['/ledger', 'Decision history'],
  ['/metrics', 'Results summary'],
  ['/demo', 'Presenter view'],
];

/** Ctrl+K / Cmd+K palette: pages, actions and applications in one keyboard-first list. */
export default function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const { role } = useRoleStore();
  const { theme, setTheme, accent, setAccent } = useThemeStore();
  const { userReduced, setUserReduced } = useEffectsStore();
  const startDemo = useJudgeStore((s) => s.start);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);

  const { data: summaries } = useQuery<ApplicationSummary[]>({
    queryKey: ['applications', role],
    queryFn: async () => {
      const res = await fetch('/api/applications', { headers: { 'x-eg-role': role } });
      if (!res.ok) return [];
      return res.json() as Promise<ApplicationSummary[]>;
    },
    enabled: open,
  });

  const commands = useMemo<Command[]>(() => {
    const close = () => { onOpenChange(false); setQuery(''); setActive(0); };
    const list: Command[] = [
      ...PAGES.map(([href, label]): Command => ({ id: `go-${href}`, group: 'Go to', label, hint: href, run: () => { close(); router.push(href); } })),
      { id: 'demo', group: 'Actions', label: 'Start the 3-minute guided demo', run: () => { close(); startDemo(); } },
      { id: 'theme', group: 'Actions', label: theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme', run: () => { close(); setTheme(theme === 'dark' ? 'light' : 'dark'); } },
      ...ACCENTS.filter((a) => a.id !== accent).map((a): Command => ({ id: `accent-${a.id}`, group: 'Actions', label: `Colour theme: ${a.label}`, run: () => { close(); setAccent(a.id); } })),
      { id: 'effects', group: 'Actions', label: userReduced ? 'Restore animation' : 'Reduce effects', run: () => { close(); setUserReduced(!userReduced); } },
      ...(summaries ?? []).map((s): Command => ({
        id: `app-${s.id}`, group: 'Applications', label: s.institution.name, hint: s.id,
        run: () => { close(); router.push(`/applications/${s.id}/overview`); },
      })),
    ];
    const q = query.trim().toLowerCase();
    if (!q) return [...list.filter((c) => c.group !== 'Applications'), ...list.filter((c) => c.group === 'Applications').slice(0, 6)];
    return list.filter((c) => c.label.toLowerCase().includes(q) || (c.hint ?? '').toLowerCase().includes(q));
  }, [query, summaries, router, onOpenChange, startDemo, theme, setTheme, accent, setAccent, userReduced, setUserReduced]);

  const current = Math.min(active, Math.max(0, commands.length - 1));

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((current + 1) % Math.max(1, commands.length)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((current - 1 + commands.length) % Math.max(1, commands.length)); }
    if (e.key === 'Enter') { e.preventDefault(); commands[current]?.run(); }
  }

  let lastGroup = '';
  return (
    <Dialog.Root open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) { setQuery(''); setActive(0); } }}>
      <Dialog.Portal>
        <Dialog.Overlay style={{ position: 'fixed', inset: 0, background: 'rgba(3,5,12,0.55)', zIndex: 9990 }} />
        <Dialog.Content
          className="eg-glass"
          aria-describedby={undefined}
          style={{ position: 'fixed', top: '12vh', left: '50%', transform: 'translateX(-50%)', width: 'min(620px, calc(100vw - 24px))', zIndex: 9991, overflow: 'hidden', padding: 0 }}
        >
          <Dialog.Title className="sr-only">Command palette</Dialog.Title>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--color-border)' }}>
            <Search size={16} aria-hidden style={{ color: 'var(--color-text-muted)' }} />
            <input
              autoFocus
              role="combobox"
              aria-expanded
              aria-controls="eg-cmd-list"
              aria-activedescendant={commands[current] ? `cmd-${commands[current]!.id}` : undefined}
              aria-label="Type a command or search"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setActive(0); }}
              onKeyDown={onKeyDown}
              placeholder="Type a command or search an institution…"
              style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: 'var(--color-text)', fontSize: 16 }}
            />
            <kbd className="eg-kbd">Esc</kbd>
          </div>
          <div id="eg-cmd-list" role="listbox" aria-label="Commands" style={{ maxHeight: 400, overflow: 'auto', padding: 6 }}>
            {commands.length === 0 && <div style={{ padding: '18px 12px', color: 'var(--color-text-muted)', fontSize: 14 }}>Nothing matches “{query}”. Try a page name or an application number.</div>}
            {commands.map((c, i) => {
              const header = c.group !== lastGroup ? c.group : null;
              lastGroup = c.group;
              return (
                <div key={c.id}>
                  {header && <div role="presentation" style={{ padding: '10px 10px 4px', fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>{header}</div>}
                  <div
                    id={`cmd-${c.id}`}
                    role="option"
                    aria-selected={i === current}
                    onMouseMove={() => setActive(i)}
                    onClick={c.run}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, cursor: 'pointer', fontSize: 14,
                      background: i === current ? 'var(--color-accent-weak)' : 'transparent', color: 'var(--color-text)',
                    }}
                  >
                    <span>{c.label}</span>
                    {c.hint && <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--color-text-muted)' }}>{c.hint}</span>}
                    {i === current && <CornerDownLeft size={13} aria-hidden style={{ marginLeft: c.hint ? 0 : 'auto', color: 'var(--color-text-muted)' }} />}
                  </div>
                </div>
              );
            })}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
