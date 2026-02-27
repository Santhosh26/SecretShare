import type { SecretRecord } from './types';

const METADATA_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export class SecretDurableObject implements DurableObject {
  private state: DurableObjectState;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'PUT') {
      return this.handleStore(request);
    }

    if (request.method === 'GET' && url.pathname === '/retrieve') {
      return this.handleRetrieve(request);
    }

    if (request.method === 'GET' && url.pathname === '/status') {
      return this.handleStatus();
    }

    return new Response('Not Found', { status: 404 });
  }

  private async handleStore(request: Request): Promise<Response> {
    // Collision check: reject if a record already exists
    const existing = await this.state.storage.get<SecretRecord>('record');
    if (existing) {
      return Response.json({ error: 'Conflict: ID already exists' }, { status: 409 });
    }

    const body = (await request.json()) as { record: SecretRecord; ttlMs: number };
    await this.state.storage.put('record', body.record);

    // Set alarm for TTL expiry
    await this.state.storage.setAlarm(Date.now() + body.ttlMs);

    return new Response('Created', { status: 201 });
  }

  private async handleRetrieve(request: Request): Promise<Response> {
    const record = await this.state.storage.get<SecretRecord>('record');

    if (!record || record.status !== 'pending') {
      // Uniform 404 — no distinction between never-existed, expired, or already-viewed
      return Response.json(
        { error: 'Secret not found or already viewed' },
        { status: 404 }
      );
    }

    // Capture encrypted data for response before destroying it
    const response = {
      encrypted: record.encrypted,
      salt: record.salt,
      passwordProtected: record.passwordProtected,
      createdAt: record.createdAt,
      expiresAt: record.expiresAt,
    };

    // Atomic burn: destroy encrypted data, keep metadata
    const viewerCountry = request.headers.get('cf-ipcountry') || undefined;
    record.encrypted = '';
    record.salt = undefined;
    record.status = 'viewed';
    record.viewedAt = new Date().toISOString();
    record.viewerCountry = viewerCountry;
    await this.state.storage.put('record', record);

    // Set new alarm for metadata cleanup (30 days)
    await this.state.storage.setAlarm(Date.now() + METADATA_TTL_MS);

    return Response.json(response);
  }

  private async handleStatus(): Promise<Response> {
    const record = await this.state.storage.get<SecretRecord>('record');

    // Uniform response — 'unknown' covers both never-existed and fully-cleaned-up
    if (!record) {
      return Response.json({ status: 'unknown' });
    }

    return Response.json({
      status: record.status,
      createdAt: record.createdAt,
      expiresAt: record.expiresAt,
      viewedAt: record.viewedAt,
      viewerCountry: record.viewerCountry,
    });
  }

  async alarm(): Promise<void> {
    const record = await this.state.storage.get<SecretRecord>('record');

    if (record && record.status === 'pending') {
      // Phase 1: TTL expired before anyone viewed — mark as expired, keep metadata 30d
      record.encrypted = '';
      record.salt = undefined;
      record.status = 'expired';
      await this.state.storage.put('record', record);
      await this.state.storage.setAlarm(Date.now() + METADATA_TTL_MS);
    } else {
      // Phase 2: Metadata cleanup (viewed or expired + 30 days) — delete everything
      await this.state.storage.deleteAll();
    }
  }
}
