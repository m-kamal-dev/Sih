import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { getApplicationSummaries } from '@/.data/store';
import { apiError, apiSuccess } from '@/lib/api-response';
import { requireRole } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  status: z.string().optional(),
  type: z.string().optional(),
  search: z.string().optional(),
  sortBy: z.enum(['priority', 'institution', 'sla', 'id']).default('priority'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

export async function GET(request: NextRequest) {
  const role = requireRole(request, ['scrutiny_officer', 'senior_reviewer', 'auditor', 'rule_admin', 'applicant']);
  if (typeof role !== 'string') return role;
  if (role === 'applicant') {
    return apiError('FORBIDDEN_ROLE', 'Applicants cannot access the cases list. Use /my-application instead.', 403);
  }

  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(searchParams.entries()));

  if (!parsed.success) {
    return apiError('VALIDATION_FAILED', 'Invalid query parameters', 400, parsed.error.format());
  }

  const { page, limit, status, type, search, sortBy, sortOrder } = parsed.data;
  let items = [...getApplicationSummaries()];

  // Filtering
  if (status) {
    items = items.filter((s) => s.status.toLowerCase() === status.toLowerCase());
  }
  if (type) {
    items = items.filter((s) => s.institution.category.toLowerCase().includes(type.toLowerCase()));
  }
  if (search) {
    const q = search.toLowerCase();
    items = items.filter(
      (s) =>
        s.id.toLowerCase().includes(q) ||
        s.institution.name.toLowerCase().includes(q) ||
        s.institution.id.toLowerCase().includes(q),
    );
  }

  // Sorting
  items.sort((a, b) => {
    let comparison = 0;
    if (sortBy === 'priority') {
      comparison = b.triageScore - a.triageScore; // higher priority first
    } else if (sortBy === 'institution') {
      comparison = a.institution.name.localeCompare(b.institution.name);
    } else if (sortBy === 'sla') {
      comparison = a.slaHoursLeft - b.slaHoursLeft;
    } else {
      comparison = a.id.localeCompare(b.id);
    }
    return sortOrder === 'desc' ? -comparison : comparison;
  });

  const total = items.length;
  const totalPages = Math.ceil(total / limit);
  const offset = (page - 1) * limit;
  const paginated = items.slice(offset, offset + limit);

  return apiSuccess(
    {
      items: paginated,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    },
    { request },
  );
}
