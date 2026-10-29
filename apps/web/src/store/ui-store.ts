'use client';
import { create } from 'zustand';
import type { Bbox } from '@evidencegraph/domain';

interface UiStore {
  selectedFactId: string | null;
  highlightBbox: Bbox | null;
  sidebarCollapsed: boolean;
  demoStep: number;
  applicationId: string | null;
  findingId: string | null;
  paletteOpen: boolean;
  setPaletteOpen: (open: boolean) => void;
  setSelectedFact: (id: string | null) => void;
  setHighlight: (bbox: Bbox | null) => void;
  toggleSidebar: () => void;
  setSidebarCollapsed: (v: boolean) => void;
  setDemoStep: (step: number) => void;
  selectApplication: (id: string | null) => void;
  selectFinding: (id: string | null) => void;
}

export const useUiStore = create<UiStore>((set) => ({
  selectedFactId: null,
  highlightBbox: null,
  sidebarCollapsed: false,
  demoStep: 0,
  applicationId: null,
  findingId: null,
  paletteOpen: false,
  setPaletteOpen: (open) => set({ paletteOpen: open }),
  setSelectedFact: (id) => set({ selectedFactId: id }),
  setHighlight: (bbox) => set({ highlightBbox: bbox }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),
  setDemoStep: (step) => set({ demoStep: step }),
  selectApplication: (id) => set({ applicationId: id }),
  selectFinding: (id) => set({ findingId: id }),
}));
