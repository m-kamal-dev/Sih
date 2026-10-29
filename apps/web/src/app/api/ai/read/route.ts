import { type NextRequest } from 'next/server';
import { analysePdf } from '@evidencegraph/engine';
import { apiError, apiSuccess } from '@/lib/api-response';
import { INTERNAL_ROLES, requireRole } from '@/lib/api-auth';
import { readDocument } from '@/lib/ai-reader';

export const dynamic = 'force-dynamic';
const MAX_BYTES = 10 * 1024 * 1024;

/**
 * AI reading of an uploaded PDF (multipart field "file"). Nothing is stored.
 * Hidden text is left out of what the model sees; it is reported by the Live Check instead.
 */
export async function POST(request: NextRequest) {
  const role = requireRole(request, INTERNAL_ROLES);
  if (typeof role !== 'string') return role;

  let bytes: Uint8Array;
  let fileName = 'uploaded.pdf';
  try {
    const form = await request.formData();
    const file = form.get('file');
    if (!file || typeof file === 'string') return apiError('VALIDATION_FAILED', 'Attach a PDF in the "file" field.', 422);
    fileName = (file as File).name || fileName;
    bytes = new Uint8Array(await (file as File).arrayBuffer());
  } catch {
    return apiError('VALIDATION_FAILED', 'The upload could not be read.', 400);
  }
  if (bytes.byteLength === 0) return apiError('VALIDATION_FAILED', 'The file is empty.', 422);
  if (bytes.byteLength > MAX_BYTES) return apiError('VALIDATION_FAILED', 'The file is larger than the 10 MB limit.', 413);

  const safeName = fileName.replace(/[^\w.\- ()]/g, '_');
  const analysis = analysePdf(bytes, { fileName: safeName });
  const visibleText = analysis.text.segments
    .filter((s) => !s.hidden)
    .map((s) => s.text)
    .join('\n');
  const pdfBase64 = bytes.byteLength <= 5 * 1024 * 1024 ? Buffer.from(bytes).toString('base64') : null;

  const reading = await readDocument({ fileName: safeName, text: visibleText, pdfBase64 });
  return apiSuccess(reading);
}
