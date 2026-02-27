import type { MiddlewareHandler } from 'hono';

const HEADERS: Record<string, string> = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data: https://lh3.googleusercontent.com",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self' https://accounts.google.com",
  ].join('; '),
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

export const securityHeaders: MiddlewareHandler = async (c, next) => {
  await next();

  // The response from ASSETS.fetch() has immutable headers.
  // Clone the response with new headers to make them mutable.
  const originalResponse = c.res;
  const newHeaders = new Headers(originalResponse.headers);
  for (const [key, value] of Object.entries(HEADERS)) {
    newHeaders.set(key, value);
  }

  c.res = new Response(originalResponse.body, {
    status: originalResponse.status,
    statusText: originalResponse.statusText,
    headers: newHeaders,
  });
};
