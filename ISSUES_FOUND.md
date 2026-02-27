# Issues Found During Testing

## Bug 1 (Critical, FIXED): Security Headers Missing on Static Pages

**Severity:** High

**Root Cause:** The `[assets]` binding in wrangler.toml serves static files directly from Cloudflare's CDN, **bypassing the Worker entirely**. The security headers middleware in `src/middleware/security-headers.ts` only runs for requests that reach the Worker.

**Affected pages (before fix):**
- `/` (index.html) — create secret page
- `/login` (login.html) — OAuth login page
- `/dashboard` (dashboard.html) — user dashboard
- `/style.css`, `/crypto.js`, `/shared.js`, etc. — all static assets

**NOT affected** (handled by Worker):
- `/api/*` — all API routes
- `/s/:id` — reveal page (SPA route, Worker proxies to ASSETS)
- `/status/:id` — status page (SPA route, Worker proxies to ASSETS)

**Impact:** All static pages served without CSP, HSTS, X-Frame-Options, Referrer-Policy. XSS protections absent on the main create-secret page.

**Fix:** Added `frontend/_headers` file. Cloudflare Assets supports `_headers` files (like Pages) to apply response headers at the CDN level, before caching.

---

## Bug 2 (Medium, FIXED): passwordProtected=true Accepted Without Salt

**Severity:** Medium (data integrity)

**Location:** `src/routes/secrets.ts` POST `/api/secrets`

**Issue:** The server accepted `{ passwordProtected: true }` without a `salt` field. This stored a permanently undecryptable secret — the reveal page would prompt for a password, but `decryptWithPassword()` would fail because `salt` was undefined.

**Fix:** Added validation requiring `salt` when `passwordProtected` is true. Returns 400: "Password-protected secrets require a salt."

---

## Previously Reported: Status Endpoint "Enumeration Vulnerability" — FALSE POSITIVE

The prior analysis claimed the status endpoint (`/api/secrets/:id/status`) was a critical enumeration vulnerability because it returns different responses for pending/viewed/expired vs. unknown secrets. **This is NOT a real issue:**

1. **128-bit entropy IDs:** Secret IDs are 16 random bytes (base64url, 22 chars). Brute-forcing 2^128 possibilities is infeasible — comparable to UUID v4.

2. **Intentional design:** The status page is a feature for secret creators. When you create a secret, you get a status link (`/status/:id`). The entire purpose is to show whether the secret has been viewed, when, and from where.

3. **CLAUDE.md is correctly implemented:** The doc says "Anti-enumeration: Status endpoint always returns 200 with `'unknown'` for non-existent/cleaned-up secrets." This IS how it works — non-existent secrets return `{"status":"unknown"}`. After the 30-day metadata cleanup alarm fires, viewed/expired secrets also return `{"status":"unknown"}`, becoming indistinguishable from never-existed.

4. **The suggested fix would have broken the feature:** Always returning `{"status":"unknown"}` would make the status page completely useless — creators could never check if their secret was viewed.

---

## Full Test Results (20 tests)

### Passed (18/20):
- Health endpoint returns 200
- Secret creation returns 201
- Atomic burn works (second retrieve returns 404)
- ID collision returns 409
- Password-protected secret stores and retrieves with salt
- CSRF blocks POST without Origin header
- CSRF blocks POST from wrong Origin
- 30-day TTL rejects unauthenticated users (403)
- Invalid TTL values rejected (400)
- Negative/zero TTL rejected (400)
- Oversized payload rejected (400)
- Empty encrypted payload rejected (400)
- Malicious ID format rejected (404)
- SPA route `/s/:id` serves reveal.html with security headers
- Non-existent secret status returns `{"status":"unknown"}`
- Created secret status returns `pending` with metadata
- Viewed secret status returns `viewed` with viewedAt
- Logout CSRF enforced (rejects without Origin)

### Issues Found (2/20):
- **Security headers missing on static pages** — FIXED via `_headers` file
- **passwordProtected=true without salt accepted** — FIXED via server validation

### Minor Observations:
- TTL as string `"3600"` accepted (JS object key coercion) — harmless, TTL value is correct
- `passwordProtected: false` with `salt` provided stores the salt unnecessarily — harmless
- CORS reflects any origin in `Access-Control-Allow-Origin` but does NOT set `Access-Control-Allow-Credentials`, so cross-origin credentialed requests are blocked by browsers — not exploitable
