# SecretShare — Project Instructions

## Overview

End-to-end encrypted, self-destructing secret sharing tool on Cloudflare. The server never sees plaintext — encryption happens in the browser using Web Crypto API. The encryption key lives in the URL fragment (`#`), which browsers never send to servers.

## Tech Stack

- **Runtime:** Cloudflare Workers (TypeScript) + Durable Objects + KV
- **Framework:** Hono v4.7
- **Frontend:** Static HTML/CSS/JS served via Workers Assets binding
- **Encryption:** AES-256-GCM with AAD (Web Crypto API, no libraries)
- **Auth:** Google OAuth 2.0 with KV-backed sessions (optional — anonymous usage works)
- **Theme:** "Terminal Vault" — dark background, green accents, monospace for secrets

## Architecture

### Durable Objects for Atomic Burn

Secrets are stored in Durable Objects (one DO instance per secret ID), not KV. DO's single-threaded execution guarantees only one request processes at a time — critical for "view once" semantics. Two simultaneous `GET /api/secrets/:id` requests will never both succeed.

KV is used for sessions (`SESSIONS`) and users (`USERS`) — these don't need atomic semantics.

### Encryption Flow

1. Client generates a random AES-256-GCM key + a random secret ID (16 bytes, base64url)
2. Client encrypts plaintext with the key, using the secret ID as Additional Authenticated Data (AAD)
3. Client POSTs the encrypted blob + ID to the API
4. Share link: `/s/{id}#{key}` — server only sees `/s/{id}`, never the key
5. Recipient's browser reads key from fragment, fetches encrypted blob, decrypts locally
6. DO atomically burns the encrypted data on first retrieval

### Password Protection (Double Encryption)

Optional second layer: PBKDF2 with 600,000 iterations (OWASP 2024) derives a key from the password. The secret is encrypted twice: first with the URL key (+ AAD), then with the password-derived key. Recipient needs both the link and the password.

### Storage Layout

| Storage | Key Pattern | Purpose |
|---------|-------------|---------|
| **DO** (SecretDurableObject) | `idFromName(secretId)` | Encrypted secrets + metadata, atomic burn |
| **KV** (SESSIONS) | `{sessionId}` | Session JSON (7d TTL) |
| **KV** (USERS) | `google:{googleId}` | Canonical user record (with denormalized secrets) |
| **KV** (USERS) | `user:{userId}` | Pointer to canonical key |

### DO Two-Phase Alarm

- **Phase 1:** Secret TTL expires, still unviewed → mark `expired`, clear encrypted data, keep metadata 30 days
- **Phase 2:** Metadata cleanup → `deleteAll()`

## Folder Structure

```
SecretShare/
├── CLAUDE.md
├── wrangler.toml              # DO binding, KV namespaces, ASSETS binding
├── package.json / tsconfig.json / .gitignore
├── src/
│   ├── index.ts               # Hono app: middleware chain, CORS, SPA routes, asset serving
│   ├── types.ts               # All TypeScript interfaces
│   ├── secret-do.ts           # Durable Object: store, retrieve (atomic burn), status, alarm
│   ├── routes/
│   │   ├── secrets.ts         # POST /api/secrets, GET /api/secrets/:id, GET /api/secrets/:id/status
│   │   ├── auth.ts            # Google OAuth: /api/auth/google, /callback, /logout, /me
│   │   ├── dashboard.ts       # GET /api/dashboard/secrets (auth required, live DO checks)
│   │   └── health.ts          # GET /api/health
│   ├── services/
│   │   └── id.ts              # ID validation (isValidSecretId — 22-char base64url)
│   └── middleware/
│       ├── security-headers.ts # CSP, HSTS, X-Frame-Options (clones Response for immutable headers)
│       ├── csrf.ts             # Origin header verification on POST/PUT/DELETE
│       └── auth.ts             # optionalAuth + requireAuth middleware
├── frontend/
│   ├── index.html / app.js    # Create secret page
│   ├── reveal.html / reveal.js # Reveal secret page (/s/:id#key)
│   ├── status.html / status.js # Status page (/status/:id)
│   ├── dashboard.html / dashboard.js # User dashboard (auth required)
│   ├── login.html / login.js  # Login page with Google OAuth
│   ├── style.css              # Terminal Vault theme (no external fonts, CSP compliant)
│   ├── crypto.js              # Web Crypto: AES-256-GCM w/ AAD, PBKDF2 600K iterations
│   └── shared.js              # Auth state, API helpers, copy-to-clipboard, toast
└── notes/learnings.md
```

## Development

```bash
npm install           # Install dependencies
npm run dev           # Start wrangler dev server
npm run typecheck     # TypeScript type checking
npm run deploy        # Deploy to Cloudflare
```

### Prerequisites for Auth

1. Create Google OAuth app in Google Cloud Console
2. `wrangler secret put GOOGLE_CLIENT_SECRET`
3. Set `GOOGLE_CLIENT_ID` and `GOOGLE_REDIRECT_URI` in wrangler.toml `[vars]`
4. Create KV namespaces: `wrangler kv namespace create SESSIONS` / `USERS` — update IDs in wrangler.toml

### Local Dev Notes

- Default port: 8787 (use `--port` flag if conflicts)
- SPA routes `/s/:id` and `/status/:id` are handled by Worker → ASSETS.fetch() with extensionless paths
- `ASSETS.fetch()` returns immutable headers — security-headers middleware clones the Response

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/secrets` | optional | Store encrypted secret (client-generated ID) |
| GET | `/api/secrets/:id` | none | Retrieve + atomic burn |
| GET | `/api/secrets/:id/status` | none | Check status (uniform response, no enumeration) |
| GET | `/api/auth/google` | none | Start OAuth flow (with state CSRF protection) |
| GET | `/api/auth/callback` | none | OAuth callback |
| POST | `/api/auth/logout` | required | Clear session |
| GET | `/api/auth/me` | none | Check auth status |
| GET | `/api/dashboard/secrets` | required | List user's secrets (live DO checks for pending) |
| GET | `/api/health` | none | Health check |

## Security Measures

- **CSP:** `default-src 'self'; script-src 'self'; style-src 'self'; frame-ancestors 'none'` — no `unsafe-inline`
- **CSRF:** Origin header verification on all state-changing requests
- **Anti-enumeration:** Status endpoint always returns 200 with `'unknown'` for non-existent/cleaned-up secrets
- **Input validation:** ID format (22-char base64url), encrypted payload (max 70KB), TTL allowlist, salt (max 100 chars)
- **OAuth state parameter:** Prevents login CSRF (stored in KV with 5min TTL)
- **Session cookies:** HttpOnly, Secure, SameSite=Strict, Path=/
- **Rate limiting:** Configured via Cloudflare dashboard (not in-worker)
- **AAD:** Secret ID used as Additional Authenticated Data prevents ciphertext swapping between IDs

## Key Gotchas

1. **Immutable headers from ASSETS.fetch():** Must clone the Response to add security headers — `new Response(originalResponse.body, { status, statusText, headers: newHeaders })`
2. **SPA routing with Assets binding:** Wrangler v3 strips `.html` extensions, so fetch `/reveal` not `/reveal.html`. Construct `new Request(url.toString(), { method: 'GET', headers })` — don't pass the original request object.
3. **base64Encode for large payloads:** Don't use `String.fromCharCode(...bytes)` spread — exceeds max arguments for payloads near 50KB. Use a loop instead.
4. **XSS in dashboard/status:** Server-returned `status` values injected into innerHTML must be escaped or allowlisted. Dashboard uses `safeStatus()` allowlist; status.js uses `escapeHtml()`.
5. **CORS:** Use `cors({ origin: (origin) => origin })` for same-origin, not default `*`.
6. **Client-generated IDs:** IDs are generated client-side (avoids extra round-trip). DO rejects PUT with 409 if record already exists (prevents collisions/overwrites).

## Allowed TTLs

| Value | Duration | Auth Required |
|-------|----------|---------------|
| 3600 | 1 hour | No |
| 86400 | 24 hours | No |
| 604800 | 7 days | No |
| 2592000 | 30 days | Yes (signed in) |
