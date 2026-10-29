/**
 * /apply helpers: the completeness checklist (derived from the loaded rule
 * pack, never typed in) and plain-language fixes for forensic signals.
 * APH clause references stay "pending" until a rule carries a confirmed one.
 */
import type { PdfAnalysis } from '@evidencegraph/engine';
import type { Rule } from '@evidencegraph/domain';

export const APPLY_CATEGORIES = [
  { value: 'EOA', label: 'Extension of approval' },
  { value: 'INTAKE_INCREASE', label: 'Intake increase' },
  { value: 'NEW_PROGRAMME', label: 'New programme' },
] as const;
export type ApplyCategory = (typeof APPLY_CATEGORIES)[number]['value'];

/** Document types an institution can upload, keyed by the fact prefix the rules read. */
export const DOC_TYPES: Record<string, { label: string; keywords: RegExp }> = {
  fire_noc: { label: 'Fire safety NOC', keywords: /fire|noc/i },
  bcc: { label: 'Building completion certificate', keywords: /bcc|building|completion/i },
  land: { label: 'Land documents (sale deed)', keywords: /land|deed|sale/i },
  faculty: { label: 'Faculty roster', keywords: /faculty|roster|staff/i },
  degree: { label: 'Faculty degree certificates', keywords: /degree|qualification/i },
  fdr: { label: 'Fixed deposit (FDR) receipt', keywords: /fdr|deposit|endowment/i },
  trust: { label: 'Trust affidavit', keywords: /trust|affidavit/i },
};
export const OTHER_DOC = 'other';

export function guessDocType(fileName: string): string {
  return Object.entries(DOC_TYPES).find(([, d]) => d.keywords.test(fileName))?.[0] ?? OTHER_DOC;
}

export interface ChecklistItem {
  docType: string;
  label: string;
  ruleIds: string[];
  /** Confirmed APH clause, or "pending" when the rule has no confirmed reference yet. */
  reference: string;
}

function confirmedRef(aphRef: string): string | null {
  return /fill in|pending|\[/.test(aphRef) ? null : aphRef;
}

/** Required documents for a category: one item per document type that an applicable rule reads. */
export function buildChecklist(rules: Rule[], category: ApplyCategory): ChecklistItem[] {
  const items = new Map<string, ChecklistItem>();
  for (const rule of rules) {
    if (!rule.categories.includes(category)) continue;
    for (const input of rule.inputs) {
      const prefix = input.fact.split('.')[0] ?? '';
      const doc = DOC_TYPES[prefix];
      if (!doc) continue;
      const item = items.get(prefix) ?? { docType: prefix, label: doc.label, ruleIds: [], reference: 'pending' };
      if (!item.ruleIds.includes(rule.id)) item.ruleIds.push(rule.id);
      const ref = confirmedRef(rule.aphRef);
      if (ref && item.reference === 'pending') item.reference = ref;
      items.set(prefix, item);
    }
  }
  return [...items.values()];
}

export interface FileCheck {
  fileName: string;
  docType: string;
  level: PdfAnalysis['level'];
  sha256: string;
  signals: { title: string; strength: 'strong' | 'medium' | 'weak'; fix: string }[];
  reading: { mode: 'ai' | 'demo'; summary: string; model: string | null };
}

/** Plain-language fix for a forensic signal, written for the institution. */
export function fixFor(signal: PdfAnalysis['signals'][number]): string {
  const id = signal.id.toLowerCase();
  const title = signal.title.toLowerCase();
  if (id.includes('sig') || title.includes('sign')) return 'Ask the issuing office for a freshly signed copy and upload it without editing or re-saving it.';
  if (id.includes('validity') || title.includes('expired') || title.includes('valid')) return 'Upload a copy that is valid on the review date, or attach the renewal.';
  if (id.includes('hidden') || title.includes('hidden')) return 'Export the PDF again from the original source so it contains only the visible content.';
  if (id.includes('inject') || title.includes('instruction')) return 'Remove any text addressed to software and export the PDF again from the original source.';
  if (id.includes('revision') || id.includes('incremental') || title.includes('version') || title.includes('edited')) return 'Upload the original as issued. If a correction was needed, attach the issuer’s corrected copy.';
  if (title.includes('active') || title.includes('javascript')) return 'Save the document as a plain PDF without scripts or actions.';
  return 'Check this item and upload the issuer’s original if anything was changed.';
}
