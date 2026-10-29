'use client';
import { create } from 'zustand';

/** One beat of the guided 3-minute walkthrough. Every route is served from local fixtures, so it runs offline. */
export interface JudgeBeat {
  href: string;
  title: string;
  say: string;
  seconds: number;
}

export const JUDGE_BEATS: JudgeBeat[] = [
  { href: '/', seconds: 18, title: 'The idea', say: 'Colleges send hundreds of documents to AICTE. EvidenceGraph reads them, checks them against written rules, and shows an officer exactly where to look. It never decides on its own.' },
  { href: '/queue', seconds: 20, title: 'Work queue', say: 'Applications with the strongest signals rise to the top, each with plain reasons. Officers start where their time matters most.' },
  { href: '/applications/EOA-2026-0142/overview', seconds: 25, title: 'One application', say: 'Every signal links to the page and line it came from. Here the land area on the form does not match the sale deed, and a certificate was edited after it was created.' },
  { href: '/applications/EOA-2026-0142/evidence', seconds: 20, title: 'Proof side by side', say: 'The officer sees the extracted value and the source page together, so checking a claim takes seconds, not a file search.' },
  { href: '/analyze?sample=signed-then-modified', seconds: 35, title: 'Live document check', say: 'A real PDF is scanned right now: file fingerprint, saved versions, the signed part of the file, hidden text and dates. This one was changed after it was signed, so the check raises a strong signal.' },
  { href: '/applications/NEW-2026-0058/forensics', seconds: 20, title: 'Hidden instructions', say: 'Some files hide text meant to steer software. It is flagged for the officer and never sent to the AI.' },
  { href: '/ledger', seconds: 20, title: 'Tamper-evident history', say: 'Every action is chained to the one before it with a hash. Editing any past entry breaks the chain and is detected.' },
  { href: '/applications/EOA-2026-0142/decision', seconds: 22, title: 'A human decides', say: 'The officer records the decision, with reasons, and it is written to the ledger. AI explains; rules raise signals; people decide.' },
];

interface JudgeStore {
  active: boolean;
  step: number;
  paused: boolean;
  start: () => void;
  stop: () => void;
  go: (step: number) => void;
  setPaused: (paused: boolean) => void;
}

export const useJudgeStore = create<JudgeStore>((set) => ({
  active: false,
  step: 0,
  paused: false,
  start: () => set({ active: true, step: 0, paused: false }),
  stop: () => set({ active: false, paused: false }),
  go: (step) => set({ step: Math.max(0, Math.min(step, JUDGE_BEATS.length - 1)) }),
  setPaused: (paused) => set({ paused }),
}));
