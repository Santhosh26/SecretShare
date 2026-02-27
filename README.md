# SecretShare

End-to-end encrypted, self-destructing secret sharing on Cloudflare. **The server never sees plaintext** — encryption happens in your browser using the Web Crypto API. The encryption key lives in the URL fragment (`#`), which browsers never send to servers.

🔗 **Live:** https://secret-share.santgutz2000.workers.dev

## Features

- **Zero-Knowledge:** Server never sees secrets — all encryption happens client-side
- **Self-Destructing:** Secrets burn atomically after first view (Durable Objects guarantee)
- **URL-Safe Keys:** Encryption key in URL fragment — never sent to server
- **Optional Password Protection:** PBKDF2 with 600,000 iterations (OWASP 2024)
- **View-Once Semantics:** Single-threaded Durable Objects prevent race conditions
- **Optional Auth:** Google OAuth 2.0 for user dashboards (anonymous works too)
- **Terminal Vault Theme:** Dark mode, green accents, monospace for secrets
- **No External Dependencies:** Web Crypto API + native browser APIs

## Quick Start

### Create a Secret
1. Go to https://secret-share.santgutz2000.workers.dev
2. Paste your secret
3. (Optional) Set a password and TTL
4. Share the link — only the recipient can decrypt it
5. Secret burns on first view

### Deploy Yourself

```bash
# Clone
git clone https://github.com/Santhosh26/SecretShare.git
cd SecretShare

# Install
npm install

# Dev
npm run dev  # http://localhost:8787

# Deploy
npm run deploy
```

## Architecture

### Durable Objects for Atomic Burn
Secrets are stored in [Durable Objects](https://developers.cloudflare.com/durable-objects/), one instance per secret ID. DO's single-threaded execution guarantees only one request processes at a time — critical for view-once semantics. Two simultaneous `GET /api/secrets/:id` requests will never both succeed.

### Encryption Flow
1. **Client** generates random AES-256-GCM key + random 16-byte secret ID (base64url)
2. **Client** encrypts plaintext with the key, using secret ID as Additional Authenticated Data (AAD)
3. **Client** POSTs encrypted blob + ID to `/api/secrets`
4. **Share link:** `/s/{id}#{key}` — server only sees `/s/{id}`, never the key
5. **Recipient** reads key from URL fragment, fetches encrypted blob, decrypts locally
6. **DO atomically burns** encrypted data on first retrieval

### Optional Password Protection
PBKDF2 derives a second key from the password (600,000 iterations). Secret is encrypted twice:
1. First with URL key (+ AAD)
2. Then with password-derived key

Recipient needs both link and password to decrypt.

### Storage
| Storage | Key Pattern | Purpose |
|---------|-------------|---------|
| **Durable Object** | `idFromName(secretId)` | Encrypted secrets, atomic burn |
| **KV** (SESSIONS) | `{sessionId}` | Session data (7d TTL) |
| **KV** (USERS) | `google:{googleId}` or `user:{userId}` | User records + denormalized secrets |

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/secrets` | optional | Store encrypted secret |
| GET | `/api/secrets/:id` | none | Retrieve + atomic burn |
| GET | `/api/secrets/:id/status` | none | Check status (uniform response) |
| GET | `/api/auth/google` | none | Start OAuth flow |
| GET | `/api/auth/callback` | none | OAuth callback |
| POST | `/api/auth/logout` | required | Clear session |
| GET | `/api/auth/me` | none | Check auth status |
| GET | `/api/dashboard/secrets` | required | List user's secrets |
| GET | `/api/health` | none | Health check |

## Configuration

### Secrets (via Wrangler)
```bash
npx wrangler secret put GOOGLE_CLIENT_SECRET
```

### Environment Variables (wrangler.toml)
```toml
[vars]
GOOGLE_CLIENT_ID = "..."
GOOGLE_REDIRECT_URI = "https://your-domain.workers.dev/api/auth/callback"
```

### KV Namespaces
```bash
npx wrangler kv namespace create SESSIONS
npx wrangler kv namespace create USERS
```

Then update `wrangler.toml` with the returned IDs.

## Tech Stack

- **Runtime:** Cloudflare Workers (TypeScript) + Durable Objects + KV
- **Framework:** Hono v4.7
- **Frontend:** Static HTML/CSS/JS (no build step)
- **Encryption:** AES-256-GCM with AAD (Web Crypto API)
- **Auth:** Google OAuth 2.0 (optional)
- **Theme:** Terminal Vault — dark background, green accents, IBM Plex Mono

## Security

### Client-Side
- **AES-256-GCM** with secret ID as Additional Authenticated Data
- **PBKDF2** with 600,000 iterations for password derivation
- **No external crypto libraries** — pure Web Crypto API

### Server-Side
- **CSP:** `default-src 'self'; script-src 'self'; style-src 'self'; frame-ancestors 'none'`
- **CSRF:** Origin header verification on all state-changing requests
- **Anti-enumeration:** Status endpoint always returns 200, never reveals if secret exists
- **Input validation:** ID format (22-char base64url), encrypted payload (max 70KB), TTL allowlist

### Platform
- **Durable Objects** ensure atomic single-view semantics
- **Secure cookies:** HttpOnly, Secure, SameSite=Strict
- **Rate limiting:** Configured via Cloudflare dashboard

## Development

```bash
# Type checking
npm run typecheck

# Start dev server
npm run dev

# Deploy
npm run deploy
```

Default port: `8787` (use `--port` flag if conflicts).

## Security Considerations

⚠️ **Limitations:**
- Recovery links to Cloudflare may be logged (HTTPS)
- Browser history may cache the URL — use private/incognito mode for sensitive secrets
- The plaintext exists in your browser memory during the entire session
- Recipients' download/copy actions are their responsibility

✅ **Protections:**
- Server has zero knowledge of plaintext
- Encryption key in URL fragment never sent to server
- Atomic burn prevents viewing multiple times
- AAD prevents ciphertext swapping between secret IDs
- PBKDF2 iteration count meets OWASP 2024 standards

## Files

```
SecretShare/
├── CLAUDE.md                          # Detailed project instructions
├── wrangler.toml                      # Cloudflare Workers config
├── package.json / tsconfig.json
├── src/
│   ├── index.ts                       # Hono app, middleware, SPA routes
│   ├── types.ts                       # TypeScript interfaces
│   ├── secret-do.ts                   # Durable Object (core logic)
│   ├── routes/
│   │   ├── secrets.ts                 # POST/GET /api/secrets/*
│   │   ├── auth.ts                    # Google OAuth flow
│   │   ├── dashboard.ts               # User dashboard
│   │   └── health.ts                  # Health check
│   ├── middleware/
│   │   ├── security-headers.ts        # CSP, HSTS, X-Frame-Options
│   │   ├── csrf.ts                    # Origin verification
│   │   └── auth.ts                    # optionalAuth, requireAuth
│   └── services/
│       └── id.ts                      # ID validation
└── frontend/
    ├── index.html / app.js            # Create secret page
    ├── reveal.html / reveal.js        # Reveal secret page
    ├── status.html / status.js        # Status page
    ├── dashboard.html / dashboard.js  # User dashboard
    ├── login.html / login.js          # OAuth login
    ├── crypto.js                      # Web Crypto (AES-256-GCM, PBKDF2)
    ├── shared.js                      # Auth state, API helpers
    └── style.css                      # Terminal Vault theme
```

## License

MIT

## Contributing

Contributions welcome! Please open an issue or PR.

---

**Made with ❤️ on Cloudflare Workers**
