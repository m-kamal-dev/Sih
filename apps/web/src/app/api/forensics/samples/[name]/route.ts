import { type NextRequest, NextResponse } from 'next/server';
import { buildSample, SAMPLE_NAMES, type SampleName } from '@evidencegraph/fixtures';
import { apiError } from '@/lib/api-response';

export const dynamic = 'force-dynamic';

/** Downloads one of the synthetic sample PDFs (real, parseable files). */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const clean = name.replace(/\.pdf$/i, '');
  if (!(SAMPLE_NAMES as string[]).includes(clean)) return apiError('RESOURCE_NOT_FOUND', 'Unknown sample.', 404);
  const bytes = buildSample(clean as SampleName);
  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${clean}.pdf"`,
      'Cache-Control': 'private, max-age=0, must-revalidate',
    },
  });
}
