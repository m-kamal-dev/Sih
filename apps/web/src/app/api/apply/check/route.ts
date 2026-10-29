import { type NextRequest } from 'next/server';
import { analysePdf } from '@evidencegraph/engine';
import { apiError, apiSuccess } from '@/lib/api-response';
import { DEMO_ROLES, requireRole } from '@/lib/api-auth';
import { readDocument } from '@/lib/ai-reader';
import { DOC_TYPES, OTHER_DOC, fixFor, type FileCheck } from '@/lib/apply';

export const dynamic = 'force-dynamic';
const MAX_BYTES = 10 * 1024 * 1024;

/**
 * Checks one file of an application (multipart: "file", "docType"). Runs the
 * real PDF forensics and the AI reader on visible text only. Processed in
 * memory; nothing is stored. Returns signals with plain-language fixes.
 */
export async function POST(request: NextRequest) {
  const role = requireRole(request, DEMO_ROLES);
  if (typeof role !== 'string') return role;

  let bytes: Uint8Array;
  let fileName = 'uploaded.pdf';
  let docType = OTHER_DOC;
  try {
    const form = await request.formData();
    const file = form.get('file');
    if (!file || typeof file === 'string') return apiError('VALIDATION_FAILED', 'Attach a PDF in the "file" field.', 422);
    fileName = (file as File).name || fileName;
    const requested = String(form.get('docType') ?? OTHER_DOC);
    docType = requested in DOC_TYPES ? requested : OTHER_DOC;
    bytes = new Uint8Array(await (file as File).arrayBuffer());
  } catch {
    return apiError('VALIDATION_FAILED', 'The upload could not be read.', 400);
  }
  if (bytes.byteLength === 0) return apiError('VALIDATION_FAILED', 'The file is empty.', 422);
  if (bytes.byteLength > MAX_BYTES) return apiError('VALIDATION_FAILED', 'The file is larger than the 10 MB limit.', 413);

  const safeName = fileName.replace(/[^\w.\- ()]/g, '_');
  const analysis = analysePdf(bytes, { fileName: safeName });
  const visibleText = analysis.text.segments.filter((s) => !s.hidden).map((s) => s.text).join('\n');
  const reading = await readDocument({ fileName: safeName, text: visibleText, pdfBase64: null });

  const result: FileCheck = {
    fileName: safeName,
    docType,
    level: analysis.level,
    sha256: analysis.sha256,
    signals: analysis.signals.map((s) => ({ title: s.title, strength: s.strength, fix: fixFor(s) })),
    reading: { mode: reading.mode, summary: reading.summary, model: reading.model },
  };
  return apiSuccess(result);
}
