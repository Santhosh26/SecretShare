export interface Env {
  SECRET_DO: DurableObjectNamespace;
  ASSETS: Fetcher;
}

export interface SecretRecord {
  encrypted: string;
  salt?: string;
  passwordProtected: boolean;
  createdAt: string;
  expiresAt: string;
  viewedAt: string | null;
  status: 'pending' | 'viewed' | 'expired';
  viewerCountry?: string;
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
  passwordProtected?: boolean;
}
