import { type NextRequest } from 'next/server';
import { getRules } from '@/.data/store';
import { apiError, apiSuccess } from '@/lib/api-response';
import { DEMO_ROLES, requireRole } from '@/lib/api-auth';
import { APPLY_CATEGORIES, buildChecklist, type ApplyCategory } from '@/lib/apply';

export const dynamic = 'force-dynamic';

/** Required documents for a category, derived from the loaded rule pack. */
export async function GET(request: NextRequest) {
  const role = requireRole(request, DEMO_ROLES);
  if (typeof role !== 'string') return role;
  const category = request.nextUrl.searchParams.get('category') ?? '';
  if (!APPLY_CATEGORIES.some((c) => c.value === category)) return apiError('VALIDATION_FAILED', 'Choose a valid category.', 422);
  return apiSuccess({ items: buildChecklist(getRules(), category as ApplyCategory) });
}
