import { NextResponse, type NextRequest } from 'next/server';
import { getFacts } from '@/.data/store';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const role = request.headers.get('x-eg-role') ?? 'scrutiny_officer';
  if (role === 'applicant') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const url = new URL(request.url);
  const docId = url.searchParams.get('docId');
  const key = url.searchParams.get('key');

  let facts = getFacts(id);
  if (docId) facts = facts.filter((f) => f.documentId === docId);
  if (key) facts = facts.filter((f) => f.key === key);

  return NextResponse.json(facts);
}
