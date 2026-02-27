import { Hono } from 'hono';
import type { Env, SecretRecord, SecretCreateRequest } from '../types';
import { isValidSecretId } from '../services/id';
import { optionalAuth } from '../middleware/auth';

const ALLOWED_TTLS: Record<number, number> = {
  3600: 3600,          // 1 hour
  86400: 86400,        // 24 hours
  604800: 604800,      // 7 days
  2592000: 2592000,    // 30 days (authenticated users only)
};

const MAX_ENCRYPTED_SIZE = 70 * 1024; // 70KB

const secrets = new Hono<{ Bindings: Env }>();

// POST /api/secrets — store an encrypted secret
secrets.post('/api/secrets', optionalAuth, async (c) => {
  let body: SecretCreateRequest;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid request body' }, 400);
  }

  // Validate ID
  if (!body.id || !isValidSecretId(body.id)) {
    return c.json({ error: 'Invalid secret ID' }, 400);
  }

  // Validate encrypted payload
  if (!body.encrypted || typeof body.encrypted !== 'string') {
    return c.json({ error: 'Missing encrypted payload' }, 400);
  }

  if (body.encrypted.length > MAX_ENCRYPTED_SIZE) {
    return c.json({ error: 'Encrypted payload too large' }, 400);
  }

  // Validate salt (if password-protected, salt should be ~24 chars base64)
  if (body.salt && (typeof body.salt !== 'string' || body.salt.length > 100)) {
    return c.json({ error: 'Invalid salt' }, 400);
  }

  // Validate TTL
  const ttlSeconds = ALLOWED_TTLS[body.ttl];
  if (!ttlSeconds) {
    return c.json({ error: 'Invalid TTL value' }, 400);
  }

  // 30-day TTL requires authentication
  if (body.ttl === 2592000 && !c.get('user')) {
    return c.json({ error: 'Sign in to use 30-day expiry' }, 403);
  }

  // Build the secret record
  const now = new Date();
  const record: SecretRecord = {
    encrypted: body.encrypted,
    salt: body.salt,
    passwordProtected: !!body.passwordProtected,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttlSeconds * 1000).toISOString(),
    viewedAt: null,
    status: 'pending',
    creatorUserId: c.get('user')?.id,
  };

  // Store in Durable Object
  const doId = c.env.SECRET_DO.idFromName(body.id);
  const stub = c.env.SECRET_DO.get(doId);
  const doResponse = await stub.fetch(new Request('https://do/store', {
    method: 'PUT',
    body: JSON.stringify({ record, ttlMs: ttlSeconds * 1000 }),
    headers: { 'Content-Type': 'application/json' },
  }));

  if (doResponse.status === 409) {
    return c.json({ error: 'ID collision, please retry' }, 409);
  }

  if (!doResponse.ok) {
    return c.json({ error: 'Failed to store secret' }, 500);
  }

  // If authenticated, add to user's dashboard metadata
  const user = c.get('user');
  if (user) {
    const meta = {
      id: body.id,
      status: 'pending' as const,
      createdAt: record.createdAt,
      expiresAt: record.expiresAt,
      passwordProtected: record.passwordProtected,
    };
    user.secrets.unshift(meta);
    // Cap at 100 entries
    if (user.secrets.length > 100) {
      user.secrets = user.secrets.slice(0, 100);
    }
    // Write back to canonical key
    await c.env.USERS.put(`google:${user.googleId}`, JSON.stringify(user));
  }

  return c.json({ id: body.id }, 201);
});

// GET /api/secrets/:id — retrieve and destroy (atomic burn)
secrets.get('/api/secrets/:id', async (c) => {
  const id = c.req.param('id');

  // Validate ID format — same 404 for bad format (no enumeration info)
  if (!isValidSecretId(id)) {
    return c.json({ error: 'Secret not found or already viewed' }, 404);
  }

  const doId = c.env.SECRET_DO.idFromName(id);
  const stub = c.env.SECRET_DO.get(doId);

  // Pass cf-ipcountry for viewer metadata
  const headers: Record<string, string> = {};
  const country = c.req.header('cf-ipcountry');
  if (country) {
    headers['cf-ipcountry'] = country;
  }

  const doResponse = await stub.fetch(new Request('https://do/retrieve', {
    method: 'GET',
    headers,
  }));

  if (doResponse.status === 404) {
    return c.json({ error: 'Secret not found or already viewed' }, 404);
  }

  const data = await doResponse.json();
  return c.json(data);
});

// GET /api/secrets/:id/status — check secret status (uniform response)
secrets.get('/api/secrets/:id/status', async (c) => {
  const id = c.req.param('id');

  if (!isValidSecretId(id)) {
    return c.json({ status: 'unknown' });
  }

  const doId = c.env.SECRET_DO.idFromName(id);
  const stub = c.env.SECRET_DO.get(doId);
  const doResponse = await stub.fetch(new Request('https://do/status', { method: 'GET' }));
  const data = await doResponse.json();

  return c.json(data);
});

export default secrets;
