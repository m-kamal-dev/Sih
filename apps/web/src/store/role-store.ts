'use client';
import { create } from 'zustand';
import type { Role } from '@evidencegraph/domain';

interface RoleStore {
  role: Role;
  institutionPin: string | null;
  setRole: (role: Role) => void;
  setPin: (pin: string | null) => void;
}

export const useRoleStore = create<RoleStore>((set) => ({
  role: 'scrutiny_officer',
  institutionPin: null,
  setRole: (role) => set({ role }),
  setPin: (pin) => set({ institutionPin: pin }),
}));
