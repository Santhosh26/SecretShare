import { Hono } from 'hono';
import type { Env, Session, User } from '../types';
const auth = new Hono<{ Bindings: Env }>();

const SESSION_TTL = 7 * 24 * 60 * 60; // 7 days in seconds
const STATE_TTL = 300; // 5 minutes for OAuth state

function generateRandomId(bytes = 32): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  let binary = '';
  for (const byte of arr) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// GET /api/auth/google — redirect to Google OAuth
auth.get('/api/auth/google', async (c) => {
  const state = generateRandomId(32);

  // Store state in KV with short TTL for CSRF protection
  await c.env.SESSIONS.put(`oauth_state:${state}`, '1', { expirationTtl: STATE_TTL });

  const params = new URLSearchParams({
    client_id: c.env.GOOGLE_CLIENT_ID,
    redirect_uri: c.env.GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    access_type: 'online',
    prompt: 'select_account',
  });

  return c.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

// GET /api/auth/callback — Google OAuth callback
auth.get('/api/auth/callback', async (c) => {
  const code = c.req.query('code');
  const state = c.req.query('state');
  const error = c.req.query('error');

  if (error) {
    return c.redirect('/login?error=access_denied');
  }

  if (!code || !state) {
    return c.redirect('/login?error=invalid_request');
  }

  // Validate state parameter (CSRF protection)
  const storedState = await c.env.SESSIONS.get(`oauth_state:${state}`);
  if (!storedState) {
    return c.redirect('/login?error=invalid_state');
  }
  // Delete used state
  await c.env.SESSIONS.delete(`oauth_state:${state}`);

  // Exchange code for tokens
  let tokens;
  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: c.env.GOOGLE_CLIENT_ID,
        client_secret: c.env.GOOGLE_CLIENT_SECRET,
        code,
        redirect_uri: c.env.GOOGLE_REDIRECT_URI,
        grant_type: 'authorization_code',
      }).toString(),
    });

    if (!tokenRes.ok) {
      return c.redirect('/login?error=token_exchange_failed');
    }

    tokens = (await tokenRes.json()) as { access_token: string };
  } catch {
    return c.redirect('/login?error=token_exchange_failed');
  }

  // Fetch user info from Google
  let googleUser: { id: string; email: string; name: string; picture?: string };
  try {
    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    if (!userRes.ok) {
      return c.redirect('/login?error=userinfo_failed');
    }

    googleUser = (await userRes.json()) as typeof googleUser;
  } catch {
    return c.redirect('/login?error=userinfo_failed');
  }

  // Create or update user in USERS KV
  const canonicalKey = `google:${googleUser.id}`;
  let user = await c.env.USERS.get(canonicalKey, 'json') as User | null;

  if (!user) {
    // New user
    const userId = generateRandomId(16);
    user = {
      id: userId,
      googleId: googleUser.id,
      email: googleUser.email,
      name: googleUser.name,
      picture: googleUser.picture,
      createdAt: new Date().toISOString(),
      secrets: [],
    };

    // Write canonical record
    await c.env.USERS.put(canonicalKey, JSON.stringify(user));

    // Write pointer: user:{userId} → canonical key
    await c.env.USERS.put(`user:${userId}`, JSON.stringify({ canonicalKey }));
  } else {
    // Update existing user info (name/picture may change)
    user.email = googleUser.email;
    user.name = googleUser.name;
    user.picture = googleUser.picture;
    await c.env.USERS.put(canonicalKey, JSON.stringify(user));
  }

  // Create session
  const sessionId = generateRandomId(32);
  const now = new Date();
  const session: Session = {
    userId: user.id,
    email: user.email,
    name: user.name,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + SESSION_TTL * 1000).toISOString(),
  };

  await c.env.SESSIONS.put(sessionId, JSON.stringify(session), { expirationTtl: SESSION_TTL });

  // Set cookie and redirect to dashboard
  const cookieOpts = [
    `session=${sessionId}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Strict',
    `Max-Age=${SESSION_TTL}`,
  ].join('; ');

  return new Response(null, {
    status: 302,
    headers: {
      Location: '/dashboard',
      'Set-Cookie': cookieOpts,
    },
  });
});

// POST /api/auth/logout
auth.post('/api/auth/logout', async (c) => {
  const cookieHeader = c.req.header('cookie');
  const match = cookieHeader?.match(/(?:^|;\s*)session=([^;]+)/);
  if (match) {
    await c.env.SESSIONS.delete(match[1]);
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': 'session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0',
    },
  });
});

// GET /api/auth/me — current auth status
auth.get('/api/auth/me', async (c) => {
  const cookieHeader = c.req.header('cookie');
  const match = cookieHeader?.match(/(?:^|;\s*)session=([^;]+)/);
  if (!match) {
    return c.json({ authenticated: false });
  }

  const session = await c.env.SESSIONS.get(match[1], 'json') as Session | null;
  if (!session || new Date(session.expiresAt) < new Date()) {
    return c.json({ authenticated: false });
  }

  // Resolve user
  const pointer = await c.env.USERS.get(`user:${session.userId}`, 'json') as { canonicalKey: string } | null;
  if (!pointer) {
    return c.json({ authenticated: false });
  }

  const user = await c.env.USERS.get(pointer.canonicalKey, 'json') as User | null;
  if (!user) {
    return c.json({ authenticated: false });
  }

  return c.json({
    authenticated: true,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      picture: user.picture,
    },
  });
});

export default auth;
