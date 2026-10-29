import { type NextRequest } from 'next/server';
import { analysePdf } from '@evidencegraph/engine';
import { apiError, apiSuccess } from '@/lib/api-response';
import { INTERNAL_ROLES, requireRole } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';
const MAX_BYTES = 10 * 1024 * 1024;

/**
 * Live PDF forensics. Accepts multipart/form-data (field "file"), application/pdf, or
 * JSON { fileName, contentBase64 }. The file is analysed in memory and never stored.
 */
export async function POST(request: NextRequest) {
  const role = requireRole(request, INTERNAL_ROLES);
  if (typeof role !== 'string') return role;

  let bytes: Uint8Array | null = null;
  let fileName = 'uploaded.pdf';
  const type = request.headers.get('content-type') ?? '';
  try {
    if (type.includes('multipart/form-data')) {
      const form = await request.formData();
      const file = form.get('file');
      if (!file || typeof file === 'string') return apiError('VALIDATION_FAILED', 'Attach a PDF in the "file" field.', 422);
      fileName = (file as File).name || fileName;
      bytes = new Uint8Array(await (file as File).arrayBuffer());
    } else if (type.includes('application/json')) {
      const body = (await request.json()) as { fileName?: unknown; contentBase64?: unknown };
      if (typeof body.contentBase64 !== 'string' || body.contentBase64.length === 0) {
        return apiError('VALIDATION_FAILED', 'contentBase64 must be a non-empty string.', 422);
      }
      if (typeof body.fileName === 'string') fileName = body.fileName.slice(0, 120);
      bytes = new Uint8Array(Buffer.from(body.contentBase64, 'base64'));
    } else {
      bytes = new Uint8Array(await request.arrayBuffer());
    }
  } catch {
    return apiError('VALIDATION_FAILED', 'The upload could not be read.', 400);
  }
  if (!bytes || bytes.byteLength === 0) return apiError('VALIDATION_FAILED', 'The file is empty.', 422);
  if (bytes.byteLength > MAX_BYTES) return apiError('VALIDATION_FAILED', 'The file is larger than the 10 MB limit.', 413);

  const result = analysePdf(bytes, { fileName: fileName.replace(/[^\w.\- ()]/g, '_') });
  return apiSuccess(result);
}
