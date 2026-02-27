export interface Env {
  SECRET_DO: DurableObjectNamespace;
  SESSIONS: KVNamespace;
  USERS: KVNamespace;
  ASSETS: Fetcher;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  GOOGLE_REDIRECT_URI: string;
}

export interface SecretRecord {
  encrypted: string;
  salt?: string;
  passwordProtected: boolean;
  createdAt: string;
  expiresAt: string;
  viewedAt: string | null;
  status: 'pending' | 'viewed' | 'expired';
  creatorUserId?: string;
  viewerCountry?: string;
}

export interface Session {
  userId: string;
  email: string;
  name: string;
  createdAt: string;
  expiresAt: string;
}

export interface DashboardSecretMeta {
  id: string;
  status: 'pending' | 'viewed' | 'expired';
  createdAt: string;
  expiresAt: string;
  viewedAt?: string;
  viewerCountry?: string;
  passwordProtected: boolean;
}

export interface User {
  id: string;
  googleId: string;
  email: string;
  name: string;
  picture?: string;
  createdAt: string;
  secrets: DashboardSecretMeta[];
}

export interface SecretCreateRequest {
  id: string;
  encrypted: string;
  salt?: string;
  passwordProtected: boolean;
  ttl: number;
}

export interface SecretRetrieveResponse {
  encrypted: string;
  salt?: string;
  passwordProtected: boolean;
  createdAt: string;
  expiresAt: string;
}

export interface SecretStatusResponse {
  status: 'pending' | 'viewed' | 'unknown';
  createdAt?: string;
  expiresAt?: string;
  viewedAt?: string;
  viewerCountry?: string;
}
