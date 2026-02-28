import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './types';
import { securityHeaders } from './middleware/security-headers';
import { csrfProtection } from './middleware/csrf';
import health from './routes/health';
import secrets from './routes/secrets';

export { SecretDurableObject } from './secret-do';

const app = new Hono<{ Bindings: Env }>();

// Global middleware — security headers on ALL responses (API and static)
app.use('*', securityHeaders);

// API-specific middleware
app.use('/api/*', cors({ origin: (origin) => origin }));
app.use('/api/*', csrfProtection);

// Mount API routes
app.route('/', health);
app.route('/', secrets);

// SPA routes — serve specific HTML pages for dynamic paths
// The ASSETS binding with wrangler serves files without .html extension
app.get('/s/:id', async (c) => {
  // Rewrite URL to /reveal and fetch from ASSETS
  const assetUrl = new URL(c.req.url);
  assetUrl.pathname = '/reveal';
  const assetRequest = new Request(assetUrl.toString(), {
    method: 'GET',
    headers: c.req.raw.headers,
  });
  return c.env.ASSETS.fetch(assetRequest);
});

app.get('/faq', async (c) => {
  const assetUrl = new URL(c.req.url);
  assetUrl.pathname = '/faq';
  const assetRequest = new Request(assetUrl.toString(), {
    method: 'GET',
    headers: c.req.raw.headers,
  });
  return c.env.ASSETS.fetch(assetRequest);
});

app.get('/status/:id', async (c) => {
  const assetUrl = new URL(c.req.url);
  assetUrl.pathname = '/status';
  const assetRequest = new Request(assetUrl.toString(), {
    method: 'GET',
    headers: c.req.raw.headers,
  });
  return c.env.ASSETS.fetch(assetRequest);
});

export default app;
