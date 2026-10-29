/**
 * Live PDF forensics (spec §04 Forensics, §10 signal strengths, §12 untrusted documents).
 *
 * This module is REAL, not fixture data: it parses the raw bytes of an uploaded PDF
 * and returns evidence-backed signals. It follows the same guardrails as the rest of
 * the engine:
 *   - it never issues a verdict about authenticity or intent; it raises anomaly signals,
 *     validity gaps and notes that a human must review;
 *   - weak signals alone can never raise the overall level above "low" (§10);
 *   - document text is data only — injection-style text becomes an anomaly signal and
 *     nothing else changes;
 *   - it states plainly what it could not check (certificate-chain trust, OCR, fonts
 *     without a simple encoding, issuer look-ups).
 *
 * Dependencies: node:crypto and node:zlib only. No network, no model.
 */
import { createHash } from "node:crypto";
import { inflateSync } from "node:zlib";
import { scanTextForInjection } from "./injection.js";

export type PdfSignalStrength = "strong" | "medium" | "weak";
export type PdfSignalClass = "anomaly_signal" | "validity_gap" | "completeness_gap";

export type PdfSignal = {
  id: string;
  class: PdfSignalClass;
  strength: PdfSignalStrength;
  title: string;
  detail: string;
  /** Machine-readable pointer a reviewer can check (offsets, keys, snippets). */
  evidence: Record<string, string | number | boolean | null>;
};

export type PdfSignatureInfo = {
  index: number;
  byteRange: [number, number, number, number] | null;
  /** Total bytes of the file the signature range reaches. */
  coveredUpTo: number;
  fileLength: number;
  bytesAfterSignedRange: number;
  /** null when the CMS blob has no readable messageDigest attribute. */
  digestAlgorithm: "sha256" | "sha1" | "sha384" | "sha512" | null;
  digestMatches: boolean | null;
  subFilter: string | null;
};

export type PdfTextSegment = { page: number; text: string; hidden: boolean; reason: string | null };

export type PdfRevisionChange = {
  objectNumber: number;
  /** Lines present only in the earlier revision of this content object. */
  removed: string[];
  /** Lines present only in the latest revision. */
  added: string[];
};

export type PdfDateMention = {
  raw: string;
  iso: string;
  context: string;
  kind: "validity_end" | "issue" | "other";
};

export type PdfAnalysis = {
  analysedAt: string;
  fileName: string;
  sizeBytes: number;
  sha256: string;
  pdfVersion: string | null;
  pageCount: number | null;
  metadata: {
    producer: string | null;
    creator: string | null;
    title: string | null;
    creationDate: string | null;
    modDate: string | null;
  };
  structure: {
    eofMarkers: number;
    incrementalUpdates: number;
    hasXmpMetadata: boolean;
    activeContent: string[];
    embeddedFiles: number;
    imagesOnly: boolean;
  };
  signatures: PdfSignatureInfo[];
  text: { segments: PdfTextSegment[]; extractedChars: number; hiddenChars: number };
  dates: PdfDateMention[];
  /** What changed between file revisions (empty when the file has a single revision). */
  revisionChanges: PdfRevisionChange[];
  signals: PdfSignal[];
  /** Overall level after the §10 rule (weak signals alone never exceed "low"). */
  level: "none" | "low" | "medium" | "high";
  summary: string;
  nextStep: string;
  /** What this analysis did NOT verify. Always shown to the reviewer. */
  limits: string[];
};

export type AnalyseOptions = { fileName?: string; asOf?: Date };

const IMAGE_EDITORS = /(photoshop|gimp|paint\.net|pixlr|picsart|snapseed|photopea|affinity photo|microsoft paint)/i;

/* ------------------------------------------------------------------ helpers */

const latin1 = (b: Uint8Array): string => Buffer.from(b.buffer, b.byteOffset, b.byteLength).toString("latin1");

function decodePdfString(raw: string): string {
  // literal string body (without outer parentheses)
  let out = "";
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i]!;
    if (c !== "\\") {
      out += c;
      continue;
    }
    const n = raw[++i];
    if (n === undefined) break;
    if (n === "n") out += "\n";
    else if (n === "r") out += "\r";
    else if (n === "t") out += "\t";
    else if (n === "b") out += "\b";
    else if (n === "f") out += "\f";
    else if (/[0-7]/.test(n)) {
      let oct = n;
      while (oct.length < 3 && /[0-7]/.test(raw[i + 1] ?? "")) oct += raw[++i];
      out += String.fromCharCode(parseInt(oct, 8) & 0xff);
    } else if (n === "\r" || n === "\n") {
      // line continuation
      if (n === "\r" && raw[i + 1] === "\n") i++;
    } else out += n;
  }
  return out;
}

function decodeHexString(hex: string): string {
  const clean = hex.replace(/\s+/g, "");
  const even = clean.length % 2 ? `${clean}0` : clean;
  // UTF-16BE with BOM (common for metadata)
  if (/^feff/i.test(even)) {
    let s = "";
    for (let i = 4; i + 3 < even.length + 1; i += 4) s += String.fromCharCode(parseInt(even.slice(i, i + 4), 16));
    return s;
  }
  let s = "";
  for (let i = 0; i < even.length; i += 2) s += String.fromCharCode(parseInt(even.slice(i, i + 2), 16));
  return s;
}

/** Find the raw value of /Key (literal) or /Key <hex> in the PDF source. Last occurrence wins (latest revision). */
function readInfoString(src: string, key: string): string | null {
  const re = new RegExp(`/${key}\\s*(\\((?:\\\\.|[^\\\\)])*\\)|<[0-9A-Fa-f\\s]*>)`, "g");
  let last: string | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const v = m[1]!;
    last = v.startsWith("(") ? decodePdfString(v.slice(1, -1)) : decodeHexString(v.slice(1, -1));
  }
  const cleaned = last?.replace(/\u0000/g, "").trim();
  return cleaned ? cleaned : null;
}

/** PDF date string D:YYYYMMDDHHmmSS+HH'mm' → ISO-8601 (UTC best effort). */
export function parsePdfDate(raw: string | null): string | null {
  if (!raw) return null;
  const m = raw.match(/^D?:?(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?(Z|[+-]\d{2}'?\d{0,2}'?)?/);
  if (!m) return null;
  const [, y, mo = "01", d = "01", h = "00", mi = "00", s = "00", tz] = m;
  let offsetMin = 0;
  if (tz && tz !== "Z") {
    const t = tz.match(/([+-])(\d{2})'?(\d{2})?/);
    if (t) offsetMin = (t[1] === "-" ? -1 : 1) * (Number(t[2]) * 60 + Number(t[3] ?? 0));
  }
  const ms = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)) - offsetMin * 60_000;
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

/* ------------------------------------------------------------ stream / text */

type PdfStream = { dict: string; data: Buffer; objStart: number; objNum: number };

function* iterateStreams(buf: Buffer, src: string): Generator<PdfStream> {
  const re = /stream\r?\n/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const dataStart = m.index + m[0].length;
    const end = src.indexOf("endstream", dataStart);
    if (end < 0) break;
    const dictStart = src.lastIndexOf("obj", m.index);
    const dict = src.slice(Math.max(0, dictStart), m.index);
    let dataEnd = end;
    if (src[dataEnd - 1] === "\n") dataEnd--;
    if (src[dataEnd - 1] === "\r") dataEnd--;
    const head = src.slice(Math.max(0, dictStart - 16), dictStart + 3);
    const num = /(\d+)\s+\d+\s+obj$/.exec(head)?.[1];
    yield { dict, data: buf.subarray(dataStart, dataEnd), objStart: dictStart, objNum: num ? Number(num) : -1 };
    re.lastIndex = end + 9;
  }
}

function inflateIfNeeded(s: PdfStream): Buffer | null {
  if (/\/FlateDecode|\/Fl\b/.test(s.dict)) {
    try {
      return inflateSync(s.data);
    } catch {
      return null;
    }
  }
  if (/\/Filter/.test(s.dict)) return null; // other filters not decoded
  return s.data;
}

type TextRun = { text: string; hidden: boolean; reason: string | null };

/** Minimal content-stream text scanner: Tj / TJ / ' / ", tracking Tr 3, tiny fonts and white fill. */
function scanContentStream(content: string): TextRun[] {
  const runs: TextRun[] = [];
  let renderMode = 0;
  let fontSize = 12;
  let fillWhite = false;
  const tokens = /\((?:\\.|[^\\)])*\)|<[0-9A-Fa-f\s]*>|\[(?:\((?:\\.|[^\\)])*\)|<[0-9A-Fa-f\s]*>|[^\]])*\]|-?\d*\.?\d+|\/[^\s/()<>[\]]+|[A-Za-z'"*]+/g;
  const stack: string[] = [];
  let m: RegExpExecArray | null;
  const flush = (text: string): void => {
    if (!text.trim()) return;
    let reason: string | null = null;
    if (renderMode === 3) reason = "invisible render mode (Tr 3)";
    else if (fontSize > 0 && fontSize < 2) reason = `font size ${fontSize}pt`;
    else if (fillWhite) reason = "white text fill";
    runs.push({ text, hidden: reason !== null, reason });
  };
  const strOf = (tok: string): string => (tok.startsWith("(") ? decodePdfString(tok.slice(1, -1)) : decodeHexString(tok.slice(1, -1)));
  while ((m = tokens.exec(content))) {
    const t = m[0];
    if (/^(\(|<)/.test(t) || t.startsWith("[") || /^-?\d*\.?\d+$/.test(t) || t.startsWith("/")) {
      stack.push(t);
      if (stack.length > 8) stack.shift();
      continue;
    }
    // operator
    if (t === "Tj" || t === "'" || t === '"') {
      const arg = stack[stack.length - 1];
      if (arg && (arg.startsWith("(") || arg.startsWith("<"))) flush(strOf(arg));
    } else if (t === "TJ") {
      const arg = stack[stack.length - 1];
      if (arg?.startsWith("[")) {
        let s = "";
        for (const part of arg.matchAll(/\((?:\\.|[^\\)])*\)|<[0-9A-Fa-f\s]*>|-?\d*\.?\d+/g)) {
          const p = part[0];
          if (p.startsWith("(") || p.startsWith("<")) s += strOf(p);
          else if (Number(p) < -250) s += " ";
        }
        flush(s);
      }
    } else if (t === "Tr") {
      renderMode = Number(stack[stack.length - 1]) || 0;
    } else if (t === "Tf") {
      fontSize = Math.abs(Number(stack[stack.length - 1]) || fontSize);
    } else if (t === "rg") {
      const [r, g, b] = stack.slice(-3).map(Number);
      fillWhite = r === 1 && g === 1 && b === 1;
    } else if (t === "g") {
      fillWhite = Number(stack[stack.length - 1]) === 1;
    } else if (t === "k") {
      const c = stack.slice(-4).map(Number);
      fillWhite = c.every((v) => v === 0);
    }
    stack.length = 0;
  }
  return runs;
}

/* ----------------------------------------------------------- signatures (CMS) */

const OID_MESSAGE_DIGEST = Buffer.from([0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x09, 0x04]);

function readMessageDigest(cms: Buffer): Buffer | null {
  const at = cms.indexOf(OID_MESSAGE_DIGEST);
  if (at < 0) return null;
  // SET { OCTET STRING digest } follows the OID
  let p = at + OID_MESSAGE_DIGEST.length;
  if (cms[p] !== 0x31) return null;
  p += 1;
  p += cms[p]! & 0x80 ? 1 + (cms[p]! & 0x7f) : 1;
  if (cms[p] !== 0x04) return null;
  p += 1;
  let len = cms[p]!;
  if (len & 0x80) {
    const n = len & 0x7f;
    len = 0;
    for (let i = 0; i < n; i++) len = (len << 8) | cms[p + 1 + i]!;
    p += 1 + n;
  } else p += 1;
  return cms.subarray(p, p + len);
}

function analyseSignatures(buf: Buffer, src: string): PdfSignatureInfo[] {
  const out: PdfSignatureInfo[] = [];
  const re = /\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/g;
  let m: RegExpExecArray | null;
  let index = 0;
  while ((m = re.exec(src))) {
    const br: [number, number, number, number] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
    const covered = br[2] + br[3];
    const windowStart = Math.max(0, m.index - 600);
    const win = src.slice(windowStart, m.index + 1200);
    const sub = win.match(/\/SubFilter\s*\/([A-Za-z0-9._]+)/)?.[1] ?? null;
    let algorithm: PdfSignatureInfo["digestAlgorithm"] = null;
    let digestMatches: boolean | null = null;
    // /Contents <hex...> lies between the two signed ranges
    const gapStart = br[1];
    const gapEnd = br[2];
    if (gapEnd > gapStart && gapEnd <= buf.length) {
      const gap = latin1(buf.subarray(gapStart, gapEnd));
      const hex = gap.match(/<([0-9A-Fa-f\s]+)>/)?.[1];
      if (hex) {
        const cms = Buffer.from(hex.replace(/\s+/g, "").replace(/(00)+$/i, ""), "hex");
        const md = readMessageDigest(cms);
        if (md) {
          const signed = Buffer.concat([buf.subarray(br[0], br[0] + br[1]), buf.subarray(br[2], br[2] + br[3])]);
          const bySize: Record<number, PdfSignatureInfo["digestAlgorithm"]> = { 20: "sha1", 32: "sha256", 48: "sha384", 64: "sha512" };
          algorithm = bySize[md.length] ?? null;
          if (algorithm) digestMatches = createHash(algorithm).update(signed).digest().equals(md);
        }
      }
    }
    out.push({
      index: index++,
      byteRange: br,
      coveredUpTo: covered,
      fileLength: buf.length,
      bytesAfterSignedRange: Math.max(0, buf.length - covered),
      digestAlgorithm: algorithm,
      digestMatches,
      subFilter: sub,
    });
  }
  return out;
}

/* -------------------------------------------------------------------- dates */

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const VALIDITY_CUE = /(valid\s*(?:up\s*)?(?:to|till|until|upto)|validity|expir(?:y|es|ing|ation)|renew(?:al)?\s*(?:due|date)|valid\s*through)/i;
const ISSUE_CUE = /(date\s*of\s*issue|issued\s*on|issue\s*date|dated)/i;

function toIso(y: number, m: number, d: number): string | null {
  const ms = Date.UTC(y, m - 1, d);
  const dt = new Date(ms);
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

export function extractDates(text: string): PdfDateMention[] {
  const found: PdfDateMention[] = [];
  const patterns: { re: RegExp; to: (m: RegExpMatchArray) => string | null }[] = [
    { re: /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b/g, to: (m) => toIso(Number(m[3]), Number(m[2]), Number(m[1])) }, // Indian dd/mm/yyyy
    { re: /\b(\d{4})-(\d{2})-(\d{2})\b/g, to: (m) => toIso(Number(m[1]), Number(m[2]), Number(m[3])) },
    {
      re: /\b(\d{1,2})(?:st|nd|rd|th)?\s+(january|february|march|april|may|june|july|august|september|october|november|december)[,]?\s+(\d{4})\b/gi,
      to: (m) => toIso(Number(m[3]), MONTHS.indexOf(m[2]!.toLowerCase()) + 1, Number(m[1])),
    },
  ];
  for (const { re, to } of patterns) {
    for (const m of text.matchAll(re)) {
      const iso = to(m);
      if (!iso) continue;
      const at = m.index ?? 0;
      const before = text.slice(Math.max(0, at - 60), at);
      const context = text.slice(Math.max(0, at - 60), at + m[0].length + 10).replace(/\s+/g, " ").trim();
      const kind: PdfDateMention["kind"] = VALIDITY_CUE.test(before) ? "validity_end" : ISSUE_CUE.test(before) ? "issue" : "other";
      if (!found.some((f) => f.iso === iso && f.raw === m[0])) found.push({ raw: m[0], iso, context, kind });
    }
  }
  return found;
}

/* ----------------------------------------------------------------- analysis */

export function analysePdf(bytes: Uint8Array, options: AnalyseOptions = {}): PdfAnalysis {
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const asOf = options.asOf ?? new Date();
  const fileName = options.fileName ?? "uploaded.pdf";
  const sha256 = createHash("sha256").update(buf).digest("hex");
  const limits = [
    "Signer certificate chain, revocation and trust were not validated; only the signed-range digest was recomputed.",
    "No OCR was run. Scanned pages without a text layer need the page pipeline, so their wording is not read here.",
    "Text from fonts with custom encodings (CID / ToUnicode) is not decoded; such text may appear garbled or missing.",
    "No issuer look-up was made. Whether the issuing authority has this document on record still needs verification.",
  ];

  const head = latin1(buf.subarray(0, Math.min(buf.length, 1024)));
  const versionMatch = head.match(/%PDF-(\d\.\d)/);
  if (!versionMatch) {
    const signal: PdfSignal = {
      id: "not_a_pdf",
      class: "validity_gap",
      strength: "strong",
      title: "File does not start with a PDF header",
      detail: "The first bytes are not '%PDF-'. The file was not analysed further; ask the applicant for the original PDF.",
      evidence: { firstBytesHex: buf.subarray(0, 8).toString("hex") },
    };
    return {
      analysedAt: new Date().toISOString(),
      fileName,
      sizeBytes: buf.length,
      sha256,
      pdfVersion: null,
      pageCount: null,
      metadata: { producer: null, creator: null, title: null, creationDate: null, modDate: null },
      structure: { eofMarkers: 0, incrementalUpdates: 0, hasXmpMetadata: false, activeContent: [], embeddedFiles: 0, imagesOnly: false },
      signatures: [],
      text: { segments: [], extractedChars: 0, hiddenChars: 0 },
      dates: [],
      revisionChanges: [],
      signals: [signal],
      level: "medium",
      summary: "This file is not a readable PDF, so no document checks could run.",
      nextStep: "Ask the institution to re-upload the original PDF.",
      limits,
    };
  }

  const src = latin1(buf);
  const signals: PdfSignal[] = [];

  /* metadata */
  const producer = readInfoString(src, "Producer");
  const creator = readInfoString(src, "Creator");
  const title = readInfoString(src, "Title");
  const creationDate = parsePdfDate(readInfoString(src, "CreationDate"));
  const modDate = parsePdfDate(readInfoString(src, "ModDate"));
  const hasXmp = /<x:xmpmeta/i.test(src);

  /* structure */
  const eofMarkers = (src.match(/%%EOF/g) ?? []).length;
  const incrementalUpdates = Math.max(0, eofMarkers - 1);
  const activeContent: string[] = [];
  for (const [label, re] of [
    ["/JavaScript or /JS action", /\/(JavaScript|JS)\b/],
    ["/OpenAction", /\/OpenAction\b/],
    ["/Launch action", /\/Launch\b/],
    ["/AA additional action", /\/AA\b/],
  ] as const) {
    if (re.test(src)) activeContent.push(label);
  }
  const embeddedFiles = (src.match(/\/Type\s*\/EmbeddedFile\b/g) ?? []).length;
  const pageObjs = (src.match(/\/Type\s*\/Page\b(?!s)/g) ?? []).length;
  const countFromPages = src.match(/\/Type\s*\/Pages\b[^>]*?\/Count\s+(\d+)/)?.[1];
  const pageCount = countFromPages ? Number(countFromPages) : pageObjs || null;

  /* signatures */
  const signatures = analyseSignatures(buf, src);

  /* text — every revision is read; the LATEST version of each content object is "current" */
  type Version = { objNum: number; runs: TextRun[] };
  const versions: Version[] = [];
  let imageStreams = 0;
  let anon = -1000;
  for (const st of iterateStreams(buf, src)) {
    if (/\/Subtype\s*\/Image/.test(st.dict)) {
      imageStreams++;
      continue;
    }
    if (/\/Type\s*\/(XRef|ObjStm|Metadata|EmbeddedFile|Sig)/.test(st.dict) || /\/Length1|\/FontFile/.test(st.dict)) continue;
    const content = inflateIfNeeded(st);
    if (!content) continue;
    const str = latin1(content);
    if (!/\b(Tj|TJ)\b/.test(str)) continue;
    versions.push({ objNum: st.objNum >= 0 ? st.objNum : anon--, runs: scanContentStream(str) });
  }
  const lastByObj = new Map<number, number>();
  versions.forEach((v, i) => lastByObj.set(v.objNum, i));
  const segments: PdfTextSegment[] = [];
  let pageIndex = 0;
  versions.forEach((v, i) => {
    if (lastByObj.get(v.objNum) !== i) return; // superseded revision: not "current"
    pageIndex++;
    for (const r of v.runs) segments.push({ page: pageIndex, text: r.text, hidden: r.hidden, reason: r.reason });
  });
  const revisionChanges: PdfRevisionChange[] = [];
  for (const [objNum, lastIdx] of lastByObj) {
    const earlier = versions.filter((v, i) => v.objNum === objNum && i < lastIdx);
    if (!earlier.length) continue;
    const prev = new Set(earlier[earlier.length - 1]!.runs.map((r) => r.text.trim()));
    const now = new Set(versions[lastIdx]!.runs.map((r) => r.text.trim()));
    const removed = [...prev].filter((t) => t && !now.has(t));
    const added = [...now].filter((t) => t && !prev.has(t));
    if (removed.length || added.length) revisionChanges.push({ objectNumber: objNum, removed, added });
  }
  const extractedChars = segments.reduce((n, sg) => n + sg.text.length, 0);
  const hiddenChars = segments.filter((sg) => sg.hidden).reduce((n, sg) => n + sg.text.length, 0);
  const imagesOnly = extractedChars === 0 && imageStreams > 0;
  const visibleText = segments.filter((sg) => !sg.hidden).map((sg) => sg.text).join("\n");
  const allText = segments.map((sg) => sg.text).join("\n");
  const dates = extractDates(visibleText);

  /* ---------------------------------------------------------------- signals */

  // 1. signature coverage and digest
  for (const sig of signatures) {
    if (sig.digestMatches === false) {
      signals.push({
        id: `signature_digest_mismatch_${sig.index}`,
        class: "anomaly_signal",
        strength: "strong",
        title: "Signed content no longer matches its signature digest",
        detail: `The ${sig.digestAlgorithm?.toUpperCase()} digest recomputed from the signed byte ranges differs from the digest stored in the signature. The signed content appears to have changed after signing.`,
        evidence: { signature: sig.index, byteRange: sig.byteRange?.join(",") ?? null, algorithm: sig.digestAlgorithm },
      });
    } else if (sig.bytesAfterSignedRange > 0) {
      signals.push({
        id: `content_after_signature_${sig.index}`,
        class: "anomaly_signal",
        strength: "strong",
        title: "Bytes were appended after the signature range",
        detail: `${sig.bytesAfterSignedRange} bytes follow the last signed range. Content was added after signing; this is normal for some countersignatures but needs the issuer's original to confirm.`,
        evidence: { signature: sig.index, coveredUpTo: sig.coveredUpTo, fileLength: sig.fileLength, bytesAfter: sig.bytesAfterSignedRange },
      });
    }
  }

  // 2. incremental update on an unsigned file
  if (incrementalUpdates > 0 && signatures.length === 0) {
    signals.push({
      id: "incremental_update",
      class: "anomaly_signal",
      strength: "medium",
      title: "File was saved incrementally after creation",
      detail: revisionChanges.length
        ? `${incrementalUpdates} later revision(s) are appended to the original file and they change visible text: ${revisionChanges
            .flatMap((c) => c.removed.map((r, i) => `"${r.slice(0, 50)}" became "${(c.added[i] ?? "(removed)").slice(0, 50)}"`))
            .slice(0, 3)
            .join("; ")}. Compare against the issuer's copy.`
        : `${incrementalUpdates} later revision(s) are appended to the original file. Earlier content can still be present underneath the visible version. Compare against the issuer's copy.`,
      evidence: { eofMarkers, incrementalUpdates, changedLines: revisionChanges.reduce((n, c) => n + c.removed.length + c.added.length, 0) },
    });
  }

  // 3. weak: producer / dates
  const toolText = `${producer ?? ""} ${creator ?? ""}`;
  if (IMAGE_EDITORS.test(toolText)) {
    signals.push({
      id: "image_editor_producer",
      class: "anomaly_signal",
      strength: "weak",
      title: "Producer is an image-editing application",
      detail: `The file reports "${(producer ?? creator ?? "").slice(0, 60)}" as its producer. Weak on its own: many scanners and legitimate workflows use such tools.`,
      evidence: { producer, creator },
    });
  }
  if (creationDate && modDate && Date.parse(modDate) - Date.parse(creationDate) > 60_000) {
    signals.push({
      id: "modified_after_creation",
      class: "anomaly_signal",
      strength: "weak",
      title: "Modification date is later than creation date",
      detail: `Created ${creationDate.slice(0, 16)}Z, modified ${modDate.slice(0, 16)}Z. Weak on its own: re-saving for compression or merging changes this field.`,
      evidence: { creationDate, modDate },
    });
  }

  // 4. hidden text and injection
  const hiddenSegs = segments.filter((s) => s.hidden);
  if (hiddenSegs.length) {
    const sample = hiddenSegs[0]!;
    signals.push({
      id: "hidden_text",
      class: "anomaly_signal",
      strength: "medium",
      title: "Text present in the file that a reader cannot see",
      detail: `${hiddenSegs.length} text run(s), ${hiddenChars} characters, are hidden (${sample.reason}). Hidden text is not shown to an officer but is read by text extractors.`,
      evidence: { runs: hiddenSegs.length, chars: hiddenChars, firstReason: sample.reason, firstSnippet: sample.text.slice(0, 80) },
    });
  }
  const injectionHits = scanTextForInjection(allText);
  if (injectionHits.length) {
    signals.push({
      id: "instruction_like_text",
      class: "anomaly_signal",
      strength: "weak", // matches fault 12 (low): injection text alone never drives a result
      title: "Instruction-style text found in the document",
      detail: "The document contains wording addressed to an automated reader (for example, asking it to approve or to stay silent). The text was treated as data only and had no effect on any result.",
      evidence: { matches: injectionHits.length, firstMatch: injectionHits[0]!.slice(0, 80) },
    });
  }

  // 5. active content / attachments
  if (activeContent.length) {
    signals.push({
      id: "active_content",
      class: "anomaly_signal",
      strength: "medium",
      title: "File contains active content",
      detail: `Found: ${activeContent.join(", ")}. Active content is not expected in an approval document and is removed before the file is stored (sanitise step).`,
      evidence: { items: activeContent.join("; ") },
    });
  }
  if (embeddedFiles > 0) {
    signals.push({
      id: "embedded_files",
      class: "anomaly_signal",
      strength: "weak",
      title: "File carries embedded attachments",
      detail: `${embeddedFiles} embedded file(s) are attached inside the PDF and were not opened.`,
      evidence: { embeddedFiles },
    });
  }

  // 6. scanned / empty text layer
  if (imagesOnly) {
    signals.push({
      id: "no_text_layer",
      class: "completeness_gap",
      strength: "weak",
      title: "Pages are images with no text layer",
      detail: "Content must be read by OCR, which this live check does not run. Values from this file would go through the confidence gate.",
      evidence: { imageStreams },
    });
  }

  // 7. validity dates
  const asOfIso = asOf.toISOString().slice(0, 10);
  for (const d of dates.filter((x) => x.kind === "validity_end")) {
    if (d.iso < asOfIso) {
      signals.push({
        id: `validity_ended_${d.iso}`,
        class: "validity_gap",
        strength: "strong",
        title: `Stated validity ended on ${d.iso}`,
        detail: `The document text gives a validity end of ${d.raw}, which is before the review date ${asOfIso}. A renewed copy or a note from the issuer is needed.`,
        evidence: { stated: d.raw, iso: d.iso, reviewDate: asOfIso, context: d.context.slice(0, 120) },
      });
    }
  }

  /* ------------------------------------------------------- overall (§10) */
  const strong = signals.filter((s) => s.strength === "strong");
  const medium = signals.filter((s) => s.strength === "medium");
  const weak = signals.filter((s) => s.strength === "weak");
  let level: PdfAnalysis["level"] = "none";
  if (strong.length) level = "high";
  else if (medium.length) level = "medium";
  else if (weak.length) level = "low"; // weak signals alone never exceed low

  const summary =
    level === "none"
      ? "No anomaly signals were raised by the checks that ran. This is not a statement that the document is genuine."
      : `${signals.length} signal(s) raised: ${strong.length} strong, ${medium.length} medium, ${weak.length} weak. These need a human reviewer; none is a finding of wrongdoing.`;
  const nextStep =
    level === "none"
      ? "Continue the standard route: read fields, then verify with the issuing authority."
      : level === "low"
        ? "Note the weak signals; they alone do not change the review order. Verify with the issuer as usual."
        : "Request the issuer's original or a verification reference, and keep this file's SHA-256 with the case.";

  return {
    analysedAt: new Date().toISOString(),
    fileName,
    sizeBytes: buf.length,
    sha256,
    pdfVersion: versionMatch[1] ?? null,
    pageCount,
    metadata: { producer, creator, title, creationDate, modDate },
    structure: { eofMarkers, incrementalUpdates, hasXmpMetadata: hasXmp, activeContent, embeddedFiles, imagesOnly },
    signatures,
    text: { segments, extractedChars, hiddenChars },
    dates,
    revisionChanges,
    signals,
    level,
    summary,
    nextStep,
    limits,
  };
}
