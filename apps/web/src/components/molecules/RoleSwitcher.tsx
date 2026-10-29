'use client';
import * as Select from '@radix-ui/react-select';
import { ChevronDown } from 'lucide-react';
import type { Role } from '@evidencegraph/domain';
import { useRoleStore } from '@/store/role-store';
import { RoleBadge } from '@/components/atoms/RoleBadge';

const ROLES: Role[] = ['scrutiny_officer', 'senior_reviewer', 'rule_admin', 'auditor', 'applicant'];

export function RoleSwitcher() {
  const { role, setRole } = useRoleStore();

  return (
    <Select.Root value={role} onValueChange={(v) => setRole(v as Role)}>
      <Select.Trigger
        className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-sm"
        style={{
          background: 'var(--color-raised)',
          border: '1px solid var(--color-border)',
          color: 'var(--color-text)',
          cursor: 'pointer',
          outline: 'none',
        }}
        aria-label="Demo role switch"
      >
        <Select.Value>
          <RoleBadge role={role} />
        </Select.Value>
        <Select.Icon>
          <ChevronDown size={12} style={{ color: 'var(--color-text-muted)' }} />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          position="popper"
          style={{
            background: 'var(--color-overlay)',
            border: '1px solid var(--color-border)',
            borderRadius: 8,
            padding: '4px',
            zIndex: 9999,
            minWidth: 200,
          }}
        >
          <Select.Viewport>
            {ROLES.map((r) => (
              <Select.Item
                key={r}
                value={r}
                style={{
                  padding: '6px 8px',
                  borderRadius: 4,
                  cursor: 'pointer',
                  outline: 'none',
                  userSelect: 'none',
                }}
                className="select-item"
              >
                <Select.ItemText>
                  <RoleBadge role={r} />
                </Select.ItemText>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}
