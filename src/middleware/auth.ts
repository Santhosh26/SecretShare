import type { MiddlewareHandler } from 'hono';
import type { Env, Session, User } from '../types';

// Extend Hono context with auth info
declare module 'hono' {
  interface ContextVariableMap {
    session: Session | null;
    user: User | null;
  }
}

function getSessionIdFromCookie(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/(?:^|;\s*)session=([^;]+)/);
  return match ? match[1] : null;
}

// Attaches user/session if logged in, doesn't block anonymous requests
export const optionalAuth: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  c.set('session', null);
  c.set('user', null);

  const sessionId = getSessionIdFromCookie(c.req.header('cookie'));
  if (!sessionId) return next();

  const sessionData = await c.env.SESSIONS.get(sessionId, 'json') as Session | null;
  if (!sessionData) return next();

  // Check expiry
  if (new Date(sessionData.expiresAt) < new Date()) {
    await c.env.SESSIONS.delete(sessionId);
    return next();
  }

  c.set('session', sessionData);

  // Resolve user from pointer
  const pointer = await c.env.USERS.get(`user:${sessionData.userId}`, 'json') as { canonicalKey: string } | null;
  if (pointer) {
    const user = await c.env.USERS.get(pointer.canonicalKey, 'json') as User | null;
    c.set('user', user);
  }

  return next();
};

// Requires authentication — returns 401 if not logged in
export const requireAuth: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  c.set('session', null);
  c.set('user', null);

  const sessionId = getSessionIdFromCookie(c.req.header('cookie'));
  if (!sessionId) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  const sessionData = await c.env.SESSIONS.get(sessionId, 'json') as Session | null;
  if (!sessionData) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  if (new Date(sessionData.expiresAt) < new Date()) {
    await c.env.SESSIONS.delete(sessionId);
    return c.json({ error: 'Session expired' }, 401);
  }

  c.set('session', sessionData);

  const pointer = await c.env.USERS.get(`user:${sessionData.userId}`, 'json') as { canonicalKey: string } | null;
  if (pointer) {
    const user = await c.env.USERS.get(pointer.canonicalKey, 'json') as User | null;
    c.set('user', user);
  }

  if (!c.get('user')) {
    return c.json({ error: 'User not found' }, 401);
  }

  return next();
};
