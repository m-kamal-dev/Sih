'use client';
import * as Select from '@radix-ui/react-select';
import { ChevronDown, UserRound } from 'lucide-react';
import { DEMO_OFFICERS, type Role } from '@evidencegraph/domain';
import { useRoleStore } from '@/store/role-store';

const APPLICANT_VALUE = 'applicant';

/** Picks the acting demo officer (one per role). Labelled "demo identity": these are not real people. */
export function RoleSwitcher() {
  const { role, setRole } = useRoleStore();
  const current = DEMO_OFFICERS.find((o) => o.role === role);

  return (
    <Select.Root value={current?.id ?? APPLICANT_VALUE} onValueChange={(v) => setRole((DEMO_OFFICERS.find((o) => o.id === v)?.role ?? 'applicant') as Role)}>
      <Select.Trigger className="eg-icon-btn" aria-label={`Acting as ${current ? current.name : 'institution view'} (demo identity). Change officer`}>
        <UserRound size={14} aria-hidden />
        <span className="eg-hide-narrow" style={{ color: 'var(--color-text)' }}>{current ? current.name : 'Institution view'}</span>
        <span className="eg-hide-narrow" style={{ fontSize: 11 }}>demo identity</span>
        <Select.Icon><ChevronDown size={12} aria-hidden /></Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content position="popper" sideOffset={6} className="eg-glass" style={{ padding: 6, zIndex: 9999, minWidth: 280 }}>
          <Select.Viewport>
            <div style={{ padding: '6px 10px', fontSize: 11, color: 'var(--color-text-muted)' }}>Demo identities, not real people</div>
            {DEMO_OFFICERS.map((o) => (
              <Select.Item key={o.id} value={o.id} className="select-item" style={{ padding: '8px 10px', borderRadius: 8, cursor: 'pointer', outline: 'none' }}>
                <Select.ItemText>{o.name}</Select.ItemText>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{o.designation} · {o.region} · {o.id}</div>
              </Select.Item>
            ))}
            <Select.Item value={APPLICANT_VALUE} className="select-item" style={{ padding: '8px 10px', borderRadius: 8, cursor: 'pointer', outline: 'none', borderTop: '1px solid var(--color-border)', marginTop: 4 }}>
              <Select.ItemText>Institution view</Select.ItemText>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>What an applicant sees (self-check)</div>
            </Select.Item>
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}
