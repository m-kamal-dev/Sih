/**
 * Synthetic document page templates. Every field's bbox lives in the same
 * coordinate space the viewer renders (1000 × 1400 units), so overlays are
 * pixel-accurate. The viewer draws page text with JetBrains Mono at
 * width = 0.62 × size per character — the bbox math below mirrors that.
 */
import type { Document } from "@evidencegraph/domain";
import { mulberry32, seedFromString } from "./rng.js";

export type Line = { text: string; x: number; y: number; size?: number; bold?: boolean; mono?: boolean; hidden?: boolean };

export type FieldSpec = {
  key: string; // fact key, e.g. land.deed_area
  display: string; // rendered text
  line: Line;
  confidence: number;
  asOf?: string;
  unit?: string;
  hiddenValue?: boolean; // value visible to overlay but not printed
};

export type PageDraft = { title: string; lines: Line[]; noise?: number; rotation?: number; blur?: number };

export type DocDraft = {
  docType: string;
  checklistSlot: string;
  pages: PageDraft[];
  fields: FieldSpec[];
  altered?: boolean; // forensic flag attached to the file itself
  telltale?: string; // hidden text (prompt injection fixture)
};

export const CHAR_W = 0.62;

/** Make a bbox for a rendered line (same math the viewer uses). */
export function fieldBbox(line: Line): [number, number, number, number] {
  const size = line.size ?? 22;
  const w = line.text.length * CHAR_W * size;
  return [line.x, line.y - size * 0.8, line.x + w, line.y + size * 0.35];
}

export function L(x: number, y: number, text: string, opts: Partial<Line> = {}): Line {
  return { x, y, text, ...opts };
}

/** Title bar + footer lines every page gets. */
export function pageHeader(title: string, sub: string, inst: string): Line[] {
  return [
    L(64, 120, title, { size: 30, bold: true }),
    L(64, 152, sub, { size: 16 }),
    L(64, 180, inst, { size: 18 }),
  ];
}

export function footer(inst: string, page: number): Line[] {
  const r = mulberry32(seedFromString(inst + page));
  return [
    L(64, 1345, `${inst} — synthetic page ${page} of the fixture set (not a real document)`, { size: 15 }),
    L(880, 1345, `p.${page}`, { size: 15 }),
    L(64, 1370, `sha256 (fixture) ${(r() * 1e15).toString(16).padStart(8, "0")}`, { size: 14 }),
  ];
}

/** Scanned-look parameters derived deterministically per document. */
export function scanParams(docSeed: string, poor = false): { noise: number; rotation: number; blur: number } {
  const r = mulberry32(seedFromString(docSeed));
  return {
    noise: poor ? 0.4 + r() * 0.25 : 0.12 + r() * 0.12,
    rotation: poor ? (r() - 0.5) * 1.6 : (r() - 0.5) * 0.6,
    blur: poor ? 0.7 : r() < 0.2 ? 0.4 : 0.08,
  };
}

const shaFix = (s: string): string => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return (h >>> 0).toString(16).padStart(10, "0");
};

/** Finalise a draft into the domain Document shape. */
export function finishDoc(draft: DocDraft, applicationId: string, inst: string): Document {
  const sha = shaFix(applicationId + draft.docType + draft.checklistSlot) + "f" + shaFix(inst);
  return {
    id: `${applicationId}_${draft.docType}`,
    applicationId,
    checklistSlot: draft.checklistSlot,
    docType: draft.docType,
    docTypeConfidence: 0.98,
    sha256: sha,
    pageCount: draft.pages.length,
    uploadedAt: uploadedFor(applicationId, draft.docType),
    status: "received",
    pages: draft.pages.map((p, i) => ({
      page: i + 1,
      title: p.title,
      lines: [...p.lines, ...footer(inst, i + 1)],
      noise: p.noise,
      rotation: p.rotation,
      blur: p.blur,
    })),
    altered: !!draft.altered,
  };
}

function uploadedFor(applicationId: string, docType: string): string {
  const inst = applicationId;
  const r = mulberry32(seedFromString(inst + docType));
  return new Date(Date.parse("2026-09-15T04:30:00Z") + Math.floor(r() * 72) * 3_600_000).toISOString();
}
