'use client';
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { List, Network, Scale, BookOpen, BarChart2, Play, ScanSearch, ChevronLeft, ChevronRight, Home, FilePlus2 } from 'lucide-react';
import { useRoleStore } from '@/store/role-store';
import { useUiStore } from '@/store/ui-store';
import { useEffectsStore } from '@/store/effects-store';
import { useJudgeStore } from '@/store/judge-store';
import { RoleSwitcher } from '@/components/molecules/RoleSwitcher';
import { ThemeToggle } from '@/components/molecules/ThemeToggle';
import { EffectsToggle } from '@/components/molecules/EffectsToggle';
import { KeyboardShortcutsOverlay } from '@/components/molecules/KeyboardShortcutsOverlay';
import { BrandMark } from '@/components/atoms/BrandMark';
import { PaletteButton } from '@/components/molecules/PaletteButton';
import { AiStatusPill } from '@/components/molecules/AiStatusPill';

// Loaded on first use so they stay out of every page's first-load JS.
const CommandPalette = dynamic(() => import('@/components/molecules/CommandPalette'), { ssr: false });
const JudgeMode = dynamic(() => import('@/components/features/JudgeMode'), { ssr: false });

const NAV_ITEMS = [
  { href: '/queue', icon: List, label: 'Applications to review', roles: ['scrutiny_officer', 'senior_reviewer', 'rule_admin', 'auditor'] },
  { href: '/apply', icon: FilePlus2, label: 'Check an application', roles: ['scrutiny_officer', 'senior_reviewer', 'rule_admin', 'auditor', 'applicant'] },
  { href: '/analyze', icon: ScanSearch, label: 'Check a document', roles: ['scrutiny_officer', 'senior_reviewer', 'rule_admin', 'auditor'] },
  { href: '/network', icon: Network, label: 'Linked institutions', roles: ['scrutiny_officer', 'senior_reviewer', 'rule_admin', 'auditor'] },
  { href: '/rules', icon: BookOpen, label: 'Rules', roles: ['rule_admin', 'auditor', 'scrutiny_officer'] },
  { href: '/ledger', icon: Scale, label: 'Decision history', roles: ['auditor', 'senior_reviewer', 'scrutiny_officer'] },
  { href: '/metrics', icon: BarChart2, label: 'Results summary', roles: ['auditor', 'senior_reviewer', 'scrutiny_officer'] },
  { href: '/demo', icon: Play, label: 'Presenter view', roles: ['scrutiny_officer', 'senior_reviewer', 'rule_admin', 'auditor', 'applicant'] },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { role } = useRoleStore();
  const { sidebarCollapsed, toggleSidebar, paletteOpen, setPaletteOpen } = useUiStore();
  const initEffects = useEffectsStore((s) => s.init);
  const { active: demoActive, start: startDemo } = useJudgeStore();
  const [paletteLoaded, setPaletteLoaded] = useState(false);

  useEffect(() => {
    initEffects();
  }, [initEffects]);

  useEffect(() => {
    if (paletteOpen) setPaletteLoaded(true);
  }, [paletteOpen]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(!useUiStore.getState().paletteOpen);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setPaletteOpen]);

  const overlays = (
    <>
      {paletteLoaded && <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />}
      {demoActive && <JudgeMode />}
      <KeyboardShortcutsOverlay />
    </>
  );

  // The landing page is full-bleed with its own header.
  if (pathname === '/') {
    return (
      <>
        <a href="#main" className="sr-only-focusable eg-btn" style={{ position: 'fixed', top: 8, left: 8, zIndex: 9999 }}>Skip to content</a>
        <div id="main">{children}</div>
        {overlays}
      </>
    );
  }

  const sidebarWidth = sidebarCollapsed ? 60 : 220;

  return (
    <div className="eg-shell">
      <a href="#main" className="sr-only-focusable eg-btn" style={{ position: 'fixed', top: 8, left: 8, zIndex: 9999 }}>Skip to content</a>
      <aside className="eg-sidebar" style={{ width: sidebarWidth, minWidth: sidebarWidth }} aria-label="Main navigation">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: sidebarCollapsed ? 'center' : 'space-between', padding: '0 12px', height: 56, borderBottom: '1px solid var(--color-border)' }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none', color: 'var(--color-text)' }} aria-label="EvidenceGraph home">
            <BrandMark size={24} />
            {!sidebarCollapsed && <span className="eg-hide-narrow font-display" style={{ fontSize: 16, fontWeight: 650 }}>EvidenceGraph</span>}
          </Link>
          {!sidebarCollapsed && (
            <button type="button" onClick={toggleSidebar} className="eg-btn-ghost eg-hide-narrow" style={{ border: 0, borderRadius: 8, cursor: 'pointer', padding: 4, background: 'none', color: 'var(--color-text-muted)' }} aria-label="Collapse sidebar">
              <ChevronLeft size={15} aria-hidden />
            </button>
          )}
        </div>
        <nav style={{ flex: 1, padding: '10px 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {role === 'applicant' ? (
            <>
              <NavLink href="/self-check/INTK-2026-0229" icon={List} label="Self-check" active={pathname.startsWith('/self-check')} collapsed={sidebarCollapsed} />
              <NavLink href="/apply" icon={FilePlus2} label="Check an application" active={pathname.startsWith('/apply')} collapsed={sidebarCollapsed} />
            </>
          ) : (
            NAV_ITEMS.filter((n) => (n.roles as readonly string[]).includes(role)).map((item) => (
              <NavLink key={item.href} href={item.href} icon={item.icon} label={item.label} active={pathname.startsWith(item.href)} collapsed={sidebarCollapsed} />
            ))
          )}
        </nav>
        <div style={{ padding: 8, borderTop: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {sidebarCollapsed && (
            <button type="button" onClick={toggleSidebar} className="eg-icon-btn eg-hide-narrow" aria-label="Expand sidebar"><ChevronRight size={15} aria-hidden /></button>
          )}
          {!sidebarCollapsed && (
            <div className="eg-hide-narrow" style={{ fontSize: 11, color: 'var(--color-text-faint)', padding: '4px 6px', lineHeight: 1.4 }}>
              Prototype for SIH26261. Signals, not verdicts. A person decides.
            </div>
          )}
        </div>
      </aside>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        <header className="eg-topbar">
          <Link href="/" className="eg-icon-btn" aria-label="Home"><Home size={15} aria-hidden /></Link>
          <PaletteButton />
          <div style={{ flex: 1 }} />
          <AiStatusPill />
          {!demoActive && (
            <button type="button" className="eg-btn eg-btn-primary" style={{ minHeight: 34, padding: '0 12px', fontSize: 13 }} onClick={startDemo}>
              <Play size={14} aria-hidden /> <span>Demo</span>
            </button>
          )}
          <EffectsToggle />
          <ThemeToggle />
          <RoleSwitcher />
        </header>

        <main id="main" tabIndex={-1} style={{ flex: 1, overflow: 'auto', paddingBottom: demoActive ? 200 : 0, outline: 'none' }}>
          {children}
        </main>
      </div>
      {overlays}
    </div>
  );
}

function NavLink({ href, icon: Icon, label, active, collapsed }: {
  href: string;
  icon: React.ComponentType<{ size?: number; 'aria-hidden'?: boolean }>;
  label: string;
  active: boolean;
  collapsed: boolean;
}) {
  return (
    <Link
      href={href}
      className="eg-navlink"
      aria-current={active ? 'page' : undefined}
      style={{ justifyContent: collapsed ? 'center' : 'flex-start' }}
      title={collapsed ? label : undefined}
      aria-label={collapsed ? label : undefined}
    >
      <Icon size={17} aria-hidden />
      {!collapsed && <span className="eg-hide-narrow">{label}</span>}
    </Link>
  );
}
