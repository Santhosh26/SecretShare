import type { MiddlewareHandler } from 'hono';

export const csrfProtection: MiddlewareHandler = async (c, next) => {
  const method = c.req.method;
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return next();
  }

  const origin = c.req.header('origin');
  if (!origin) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  // In dev, allow localhost origins
  const url = new URL(c.req.url);
  const expectedOrigin = `${url.protocol}//${url.host}`;

  if (origin !== expectedOrigin) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  return next();
};
