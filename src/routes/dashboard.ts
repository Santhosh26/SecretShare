import { Hono } from 'hono';
import type { Env, User, DashboardSecretMeta } from '../types';
import { requireAuth } from '../middleware/auth';

const dashboard = new Hono<{ Bindings: Env }>();

// GET /api/dashboard/secrets — list user's secrets with live status
dashboard.get('/api/dashboard/secrets', requireAuth, async (c) => {
  const user = c.get('user') as User;
  const secrets = user.secrets || [];

  // Live-check DO for "pending" secrets to catch stale denormalized data
  const enriched: DashboardSecretMeta[] = await Promise.all(
    secrets.map(async (meta) => {
      if (meta.status !== 'pending') {
        // Viewed/expired are terminal states — no need to check DO
        return meta;
      }

      try {
        const doId = c.env.SECRET_DO.idFromName(meta.id);
        const stub = c.env.SECRET_DO.get(doId);
        const res = await stub.fetch(new Request('https://do/status', { method: 'GET' }));
        const liveStatus = (await res.json()) as {
          status: string;
          viewedAt?: string;
          viewerCountry?: string;
        };

        if (liveStatus.status !== 'pending' && liveStatus.status !== 'unknown') {
          // Update the denormalized entry
          return {
            ...meta,
            status: liveStatus.status as DashboardSecretMeta['status'],
            viewedAt: liveStatus.viewedAt,
            viewerCountry: liveStatus.viewerCountry,
          };
        }

        // If DO says "unknown", the secret was cleaned up — mark as expired
        if (liveStatus.status === 'unknown') {
          return { ...meta, status: 'expired' as const };
        }

        return meta;
      } catch {
        // If DO check fails, return stale data rather than failing
        return meta;
      }
    })
  );

  // Best-effort writeback of updated statuses to user record
  const hasUpdates = enriched.some(
    (e, i) => e.status !== secrets[i].status || e.viewedAt !== secrets[i].viewedAt
  );
  if (hasUpdates) {
    user.secrets = enriched;
    try {
      await c.env.USERS.put(`google:${user.googleId}`, JSON.stringify(user));
    } catch {
      // Non-critical — will be fixed on next dashboard load
    }
  }

  return c.json({ secrets: enriched });
});

export default dashboard;
