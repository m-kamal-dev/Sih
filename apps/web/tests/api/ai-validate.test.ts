import { describe, expect, it } from 'vitest';
import { parseDate, validateFields } from '@/lib/ai-validate';

const TODAY = new Date(Date.UTC(2026, 9, 28));
const f = (label: string, value: string, confidence = 0.9) => ({ label, value, confidence });
const state = (r: ReturnType<typeof validateFields>, id: string) => r.checks.find((c) => c.id === id)?.state;

describe('parseDate', () => {
  it('reads common day-first and ISO formats', () => {
    expect(parseDate('12/03/2025')?.toISOString().slice(0, 10)).toBe('2025-03-12');
    expect(parseDate('12-03-2025')?.toISOString().slice(0, 10)).toBe('2025-03-12');
    expect(parseDate('12 Mar 2025')?.toISOString().slice(0, 10)).toBe('2025-03-12');
    expect(parseDate('12th March 2025')?.toISOString().slice(0, 10)).toBe('2025-03-12');
    expect(parseDate('2025-03-12')?.toISOString().slice(0, 10)).toBe('2025-03-12');
  });

  it('returns null for impossible or unreadable dates', () => {
    expect(parseDate('31/02/2025')).toBeNull();
    expect(parseDate('99/99/2025')).toBeNull();
    expect(parseDate('sometime in March')).toBeNull();
    expect(parseDate('')).toBeNull();
  });
});

describe('validateFields', () => {
  const good = [
    f('Issuing authority', 'State Fire Department'),
    f('Reference number', 'FS/2026/00123'),
    f('Institution', 'Vikramsheela Institute of Technology'),
    f('Issue date', '12/03/2026'),
    f('Valid until', '11/03/2027'),
  ];

  it('passes a complete, current document', () => {
    const r = validateFields(good, TODAY);
    expect(r.needsReview).toBe(0);
    expect(r.missing).toBe(0);
    expect(r.passed).toBe(r.checks.length);
  });

  it('flags an expired certificate for review', () => {
    const r = validateFields(good.map((x) => (x.label === 'Valid until' ? f('Valid until', '11/03/2026') : x)), TODAY);
    expect(state(r, 'valid')).toBe('review');
  });

  it('reports missing fields instead of guessing', () => {
    const r = validateFields([f('Institution', 'X College')], TODAY);
    expect(state(r, 'reference')).toBe('missing');
    expect(state(r, 'authority')).toBe('missing');
    expect(state(r, 'issued')).toBe('missing');
    expect(state(r, 'valid')).toBe('missing');
    expect(state(r, 'order')).toBeUndefined();
  });

  it('flags dates in the wrong order and issue dates in the future', () => {
    const swapped = validateFields([f('Issue date', '01/01/2026'), f('Valid until', '01/01/2025')], TODAY);
    expect(state(swapped, 'order')).toBe('review');
    const future = validateFields([f('Issue date', '01/01/2027')], TODAY);
    expect(state(future, 'issued')).toBe('review');
  });

  it('flags unreadable dates and low-confidence fields', () => {
    const r = validateFields([f('Issue date', 'last spring'), f('Reference number', 'ABC', 0.3)], TODAY);
    expect(state(r, 'issued')).toBe('review');
    expect(state(r, 'reference')).toBe('review');
    expect(state(r, 'confidence')).toBe('review');
  });

  it('does not treat the valid-until field as the issue date', () => {
    const r = validateFields([f('Valid until', '11/03/2027')], TODAY);
    expect(state(r, 'issued')).toBe('missing');
    expect(state(r, 'valid')).toBe('pass');
  });
});
