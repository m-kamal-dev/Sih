import { NextResponse, type NextRequest } from 'next/server';

// In-memory rate limiting for mutation endpoints
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_MUTATIONS_PER_MINUTE = 60;

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry || now > entry.resetTime) {
    rateLimitMap.set(key, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }

  if (entry.count >= MAX_MUTATIONS_PER_MINUTE) {
    return true;
  }

  entry.count++;
  return false;
}

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Rate limit on mutations
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(request.method) && pathname.startsWith('/api/')) {
    const ip = request.headers.get('x-forwarded-for') ?? 'local';
    const rateKey = `${ip}:${request.method}:${pathname}`;

    if (isRateLimited(rateKey)) {
      return NextResponse.json(
        {
          error: {
            code: 'RATE_LIMITED',
            message: 'Too many requests. Please slow down and try again shortly.',
          },
        },
        { status: 429, headers: { 'Retry-After': '60' } },
      );
    }
  }

  const response = NextResponse.next();

  // Demo session cookie management
  if (!request.cookies.has('eg-session')) {
    const sessionId = `demo-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    response.cookies.set('eg-session', sessionId, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
