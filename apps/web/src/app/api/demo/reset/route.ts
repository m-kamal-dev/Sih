import { type NextRequest } from 'next/server';
import { resetToSeed, getDatasetVersion } from '@/.data/store';
import { apiSuccess } from '@/lib/api-response';
import { requireRole } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const role = requireRole(request, ['senior_reviewer', 'rule_admin']);
  if (typeof role !== 'string') return role;

  resetToSeed();
  return apiSuccess({
    ok: true,
    message: 'Dataset reset to seed',
    datasetVersion: getDatasetVersion(),
  });
}
