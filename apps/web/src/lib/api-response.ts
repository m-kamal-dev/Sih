import { NextResponse } from 'next/server';
import crypto from 'node:crypto';

export type ApiErrorCode =
  | 'VALIDATION_FAILED'
  | 'FORBIDDEN_ROLE'
  | 'UNAUTHORIZED'
  | 'RESOURCE_NOT_FOUND'
  | 'ILLEGAL_TRANSITION'
  | 'EVIDENCE_UNRESOLVED'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR';

export interface ApiErrorPayload {
  error: {
    code: ApiErrorCode | string;
    message: string;
    details?: unknown;
  };
}

export function apiError(
  code: ApiErrorCode | string,
  message: string,
  status = 400,
  details?: unknown,
): NextResponse<ApiErrorPayload> {
  return NextResponse.json(
    {
      error: {
        code,
        message,
        ...(details !== undefined ? { details } : {}),
      },
    },
    { status },
  );
}

export function apiSuccess<T>(
  data: T,
  options?: {
    status?: number;
    headers?: Record<string, string>;
    request?: Request;
  },
): NextResponse {
  const status = options?.status ?? 200;
  const jsonString = JSON.stringify(data);
  const etag = `"${crypto.createHash('sha1').update(jsonString).digest('base64url')}"`;

  // Check If-None-Match for 304 Not Modified (= * matches any current ETag)
  if (options?.request) {
    const ifNoneMatch = options.request.headers.get('if-none-match');
    if (ifNoneMatch && (ifNoneMatch.trim() === '*' || ifNoneMatch === etag || ifNoneMatch.includes(etag))) {
      return new NextResponse(null, {
        status: 304,
        headers: {
          ETag: etag,
          'Cache-Control': 'private, max-age=0, must-revalidate',
        },
      });
    }
  }

  const responseHeaders = new Headers(options?.headers);
  responseHeaders.set('ETag', etag);
  responseHeaders.set('Cache-Control', 'private, max-age=0, must-revalidate');
  responseHeaders.set('Content-Type', 'application/json; charset=utf-8');

  return new NextResponse(jsonString, {
    status,
    headers: responseHeaders,
  });
}
