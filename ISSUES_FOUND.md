# Issues Found During Testing

## Critical: Information Leakage in Status Endpoint

**Severity:** High (Information Disclosure / Enumeration Vulnerability)

**Location:** `src/secret-do.ts` `handleStatus()` method (lines 81-96)

**Issue:**
The `/api/secrets/:id/status` endpoint returns different response shapes based on the secret's state, allowing attackers to enumerate secrets and determine their status:

1. **Non-existent/fully-cleaned-up secret** → `{"status":"unknown"}`
2. **Pending secret** → `{"status":"pending","createdAt":"...","expiresAt":"...","viewedAt":null}`
3. **Viewed secret** → `{"status":"viewed","createdAt":"...","expiresAt":"...","viewedAt":"...","viewerCountry":"..."}`
4. **Expired secret** → `{"status":"expired","createdAt":"...","expiresAt":"...","viewedAt":null}`

**Attack Scenario:**
An attacker can brute-force or enumerate secret IDs and determine:
- Whether a secret was created
- If it has been viewed
- Exact timing of when it was viewed
- Geographic location of the viewer (country code)

This violates the anti-enumeration requirement stated in CLAUDE.md: "Anti-enumeration: Status endpoint always returns 200 with `'unknown'` for non-existent/cleaned-up secrets"

**Fix:**
Modify `handleStatus()` to always return `{"status":"unknown"}` regardless of whether the secret exists or what state it's in:

```typescript
private async handleStatus(): Promise<Response> {
  // Always return uniform response to prevent enumeration
  return Response.json({ status: 'unknown' });
}
```

**Trade-off:** Users will no longer be able to check if their secret was viewed via the status page. The status link would only show "Status unavailable." Consider alternative approaches:
- Store viewer metadata in KV keyed by creatorUserId (only for authenticated users)
- Require authentication to view status (limits to secret creator only)
- Return a pre-shared secret/token in the status link that must be provided to see metadata

---

## Testing Results

✅ **Passed:**
- Health endpoint working
- Secret creation (POST /api/secrets) — 201 response
- Secret retrieval and atomic burn — returns plaintext + burns on second access
- Password protection — salt stored and returned correctly
- CSRF protection — rejects requests from different origins
- Frontend loads correctly
- Auth endpoints (`/api/auth/me`) working
- Input validation — rejects invalid secret IDs and oversized payloads

⚠️ **Needs Investigation:**
- Frontend reveal page decryption (not tested interactively)
- Google OAuth flow (no credentials configured)
- User dashboard with live DO checks (requires auth)
- Alarm-based TTL expiry (time-dependent, hard to test)

---

## Recommendations

1. **Fix the status endpoint immediately** — this is an enumeration vulnerability
2. Consider rate limiting on the status endpoint to prevent brute-force enumeration
3. Test the 30-day TTL metadata cleanup alarm to ensure it triggers correctly
4. Load-test the application with many concurrent secrets and viewers
