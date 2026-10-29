'use client';
import { Play } from 'lucide-react';
import { useJudgeStore } from '@/store/judge-store';

/** Starts the guided 3-minute walkthrough (Judge mode). */
export function DemoButton({ className = 'eg-btn eg-btn-lg' }: { className?: string }) {
  const start = useJudgeStore((s) => s.start);
  return (
    <button type="button" className={className} onClick={start}>
      <Play size={16} aria-hidden /> Watch the 3-minute demo
    </button>
  );
}
