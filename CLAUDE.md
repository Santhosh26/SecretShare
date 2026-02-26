# SecretShare — End-to-End Encrypted Secret Sharing on Cloudflare

## Project Overview

SecretShare is a self-destructing, end-to-end encrypted secret sharing tool built entirely on Cloudflare's platform. Users paste sensitive text (API keys, passwords, config snippets, credentials), and the app encrypts it **in the browser** before sending it to the server. A unique one-time link is generated. When the recipient opens the link, the secret is decrypted in their browser and the server immediately destroys it. The server never sees plaintext — ever.

**Learning goal:** Deepen hands-on Cloudflare experience (Workers, KV, Pages) while learning browser-native cryptography (Web Crypto API). This complements SecureNotes (CRUD app) and TranscriptGrabber (external API integration + caching) — SecretShare focuses on **client-side encryption, zero-knowledge architecture, and security-first design**. This is the most security-focused project in the series.

**Why this matters:** People share secrets insecurely every day — API keys in Slack, passwords in email, credentials in WhatsApp. These persist forever in chat logs and email archives. Existing tools like OneTimeSecret.com do server-side encryption (they can read your secrets). PrivateBin exists but it's PHP, clunky, and not edge-deployed. A clean, modern, zero-knowledge tool built on Cloudflare Workers doesn't really exist today.

**How the encryption works (the key insight):**
The encryption key never touches the server. Here's the trick — URL fragments (the part after `#`) are **never sent to the server** by browsers. So the share link looks like:
```
https://secretshare.example.com/s/abc123#encryption-key-here
```
The server only sees `/s/abc123`. The browser reads the `#encryption-key-here` part locally and uses it to decrypt. This is the foundation of the zero-knowledge architecture.

**Tech stack:**
- Frontend: Static HTML/CSS/JS (hosted on Cloudflare Pages)
- Backend API: Cloudflare Workers (TypeScript)
- Secret storage: Workers KV (encrypted blobs with TTL for auto-expiry)
- Framework: Hono (lightweight, Workers-native)
- Encryption: Web Crypto API (AES-256-GCM, browser-native, no libraries)

## Who I Am

Santhosh Kumar — Principal SE at Cloudflare, learning the platform hands-on. I have 18 years of AppSec background (OpenText Fortify, SAST/DAST) so I understand security and cryptography concepts deeply — you don't need to over-explain why XSS is bad or what AES is. But I'm still building muscle memory with Cloudflare's specific products and the Web Crypto API. I've built SecureNotes (CRUD with Workers, D1, R2, KV) and am building TranscriptGrabber (external API integration, KV caching, D1 search, R2 exports), so I have solid familiarity with Workers, KV, D1, and R2. You can move faster than a beginner on Cloudflare concepts, but explain new patterns and Web Crypto specifics.

## How to Work With Me

- **Explain crypto patterns clearly.** I know what AES-GCM is conceptually, but I haven't used the Web Crypto API hands-on. Walk me through the key generation, encryption, and decryption flow step by step.
- **Focus on what's new.** I already know Workers, KV basics, and Hono routing from previous projects. Don't re-explain those. Focus on: Web Crypto API, zero-knowledge architecture patterns, KV TTL behavior, and security considerations unique to this project.
- **Security-first.** This is a security tool. Every design decision should prioritize security. If there's a tradeoff between convenience and security, flag it and let me decide.
- **Build incrementally.** Get a working encrypt → store → retrieve → decrypt flow first. Then layer on features.
- **Test before deploying.** Always verify with `wrangler dev` locally before `wrangler deploy`.
- **Link to docs.** Reference the relevant Cloudflare docs and MDN Web Crypto docs when introducing something new.
- **Ask me questions on design decisions.** Don't assume — let me choose when tradeoffs exist.
- **Keep it practical.** This should be a tool I'd actually use to share credentials with clients. Polish and trust matter.

## Prerequisites

Before starting, ensure:
- [ ] Cloudflare account (already set up from previous projects)
- [ ] Node.js v18+ installed
- [ ] Wrangler CLI installed and logged in (`wrangler whoami`)
- [ ] Familiarity with Workers, KV, Hono basics (from SecureNotes and TranscriptGrabber)
- [ ] A modern browser with Web Crypto API support (all modern browsers)

## Folder Structure

```
SecretShare/
├── CLAUDE.md                  # This file (project instructions)
├── wrangler.toml              # Wrangler config with KV bindings
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts               # Main Worker entry point (Hono app)
│   ├── routes/
│   │   ├── secrets.ts         # /api/secrets — store and retrieve encrypted blobs
│   │   └── health.ts          # /api/health — health check endpoint
│   ├── services/
│   │   ├── storage.ts         # KV storage logic (store, retrieve, delete)
│   │   └── id.ts              # Secure random ID generation
│   └── types.ts               # TypeScript interfaces
├── frontend/
│   ├── index.html             # Main page — create and reveal secrets
│   ├── style.css              # Clean, minimal, trust-inspiring styling
│   ├── app.js                 # Frontend logic — encryption, API calls, decryption
│   └── crypto.js              # Web Crypto API wrapper — key gen, encrypt, decrypt
└── notes/
    └── learnings.md           # What I learned building this
```

---

## Phase 1 — Core Encrypt-Store-Retrieve-Decrypt Flow (Get It Working)

**Goal:** Paste a secret, get a one-time link. Open the link, see the secret. The server never sees plaintext.

### Steps

1. **Initialize the project**
   - Scaffold the folder structure above
   - Set up `wrangler.toml` with project name `secret-share`
   - Install Hono: `npm install hono`
   - Create the Worker entry point with Hono routing
   - Since we've used Hono in previous projects, move quickly through setup

2. **Create the KV namespace**
   - Run `wrangler kv namespace create SECRETS`
   - Add the KV binding to `wrangler.toml`
   - Explain: Why KV is ideal for this — write-once, read-once, auto-expiry via TTL. Compare this to how we used KV for caching in TranscriptGrabber (long TTLs, read-many) vs here (short TTLs, read-once-then-delete). This is a fundamentally different KV usage pattern.

3. **Build the crypto module (`frontend/crypto.js`)**
   This is the heart of the project. Everything happens in the browser.

   - **Key generation:**
     - Generate a random 256-bit AES key using `crypto.subtle.generateKey()`
     - Algorithm: AES-GCM (authenticated encryption — provides both confidentiality AND integrity)
     - Export the key to raw bytes, then base64url-encode it for URL-safe inclusion in the fragment
     - Explain: Why AES-GCM over AES-CBC? GCM includes authentication — it detects tampering. If someone modifies the encrypted blob, decryption fails rather than producing garbage. This is critical for a security tool.

   - **Encryption:**
     - Generate a random 12-byte IV (initialization vector) using `crypto.getRandomValues()`
     - Encrypt the plaintext using `crypto.subtle.encrypt()` with AES-GCM, the generated key, and the IV
     - Combine IV + ciphertext into a single blob (IV is not secret, just needs to be unique)
     - Base64-encode the combined blob for transmission
     - Explain: Why the IV must be random and unique per encryption. Why it's safe to store alongside the ciphertext. The role of the authentication tag in GCM.

   - **Decryption:**
     - Extract the key from the URL fragment (after `#`)
     - Base64url-decode the key, import it using `crypto.subtle.importKey()`
     - Fetch the encrypted blob from the API
     - Split the blob back into IV + ciphertext
     - Decrypt using `crypto.subtle.decrypt()` with AES-GCM
     - Display the plaintext
     - Handle decryption failure gracefully (wrong key, tampered data, expired secret)

   - **Important implementation details:**
     - All crypto operations are async (return Promises)
     - The key exists ONLY in the browser's memory and in the URL fragment
     - The key is NEVER sent to the server in any request
     - Use `TextEncoder`/`TextDecoder` for string ↔ ArrayBuffer conversion

4. **Build the storage service (`services/storage.ts`)**
   - `storeSecret(id: string, encryptedBlob: string, ttlSeconds: number)` — store in KV with TTL
   - `retrieveSecret(id: string)` — get from KV, then DELETE immediately (one-time read)
   - `deleteSecret(id: string)` — explicit delete
   - Explain: The retrieve-then-delete pattern. KV's `get()` followed by `delete()` is not atomic — discuss the race condition implications and why it's acceptable for this use case (worst case: two people see the secret, which is better than zero people seeing it).

5. **Build the ID generator (`services/id.ts`)**
   - Generate URL-safe random IDs for secrets
   - Use `crypto.getRandomValues()` on the Worker side (Workers have access to the Web Crypto API too)
   - IDs should be 16+ bytes, base64url-encoded — long enough to be unguessable
   - Explain: Why random IDs matter for security — sequential IDs would let someone enumerate and access other people's secrets. The ID is essentially a second factor of authentication (you need both the ID and the key).

6. **Build the API routes (`routes/secrets.ts`)**
   - `POST /api/secrets` — accepts `{ encrypted: string, ttl: number }`
     - Validate: `encrypted` is a non-empty string, `ttl` is one of the allowed values (3600, 86400, 604800 — 1h, 24h, 7d)
     - Generate a random ID
     - Store the encrypted blob in KV with the specified TTL
     - Return `{ id: string }` — the client appends the key as a fragment to build the share link
     - Do NOT log or store the plaintext, the key, or the full share link
   - `GET /api/secrets/:id` — retrieve and destroy
     - Look up the ID in KV
     - If found: return `{ encrypted: string }`, then delete from KV
     - If not found: return `{ error: "Secret not found or already viewed" }` with 404
     - Do NOT distinguish between "never existed" and "already viewed" — this prevents enumeration
   - Add CORS headers for Pages ↔ Worker communication
   - Explain: Why the API only handles encrypted blobs and never plaintext. Why we don't distinguish between missing and viewed secrets.

7. **Build the frontend (`frontend/index.html`, `app.js`, `style.css`)**

   Two views in a single page:

   **Create view (default — when URL has no `/s/` path):**
   - Large textarea: "Paste your secret here"
   - Expiry selector: 1 hour / 24 hours / 7 days (radio buttons or dropdown)
   - "Create Secret Link" button
   - After creation: display the share link with a "Copy Link" button
   - Clear the textarea immediately after encryption (don't leave the plaintext on screen)
   - Show a brief explanation: "This link can only be opened once. After that, the secret is permanently destroyed."

   **Reveal view (when URL matches `/s/:id#key`):**
   - Show a "Reveal Secret" button (don't auto-decrypt — let the user confirm they're ready)
   - On click: fetch the encrypted blob, decrypt with the key from the fragment, display the secret
   - Show a warning: "This secret has been destroyed. You cannot view it again."
   - If the secret is already gone: show "This secret has already been viewed or has expired."
   - Copy-to-clipboard button for the revealed secret
   - No page reload after reveal — the secret is shown once in the DOM

   **Design principles:**
   - Clean, minimal, professional — this is a security tool, trust matters
   - No heavy frameworks — vanilla HTML/CSS/JS
   - Subtle visual cues that convey security (lock icons, muted colors, clear language)
   - Mobile-responsive

8. **Handle the routing split (Pages vs Worker)**
   - The frontend (Pages) serves the HTML/CSS/JS for all routes
   - API calls go to the Worker (`/api/*`)
   - The reveal page (`/s/:id#key`) is served by Pages (it's a static HTML page — the JS reads the URL and calls the API)
   - Set up the Worker route and Pages deployment so they work together
   - Explain: How Pages + Workers coexist — Pages handles static assets and the SPA routing, Worker handles the API. Options: separate domains, or Pages with a Worker binding (Functions).
   - **Recommended approach:** Use Cloudflare Pages with Functions (file-based routing in a `functions/` directory). This way the frontend and API are deployed together as one unit. Alternatively, discuss the tradeoff of separate Pages + Worker deployments.

9. **Test locally with `wrangler dev`**
   - Create a secret, copy the link, open it in an incognito window
   - Verify the secret is displayed correctly
   - Try opening the same link again — should show "already viewed"
   - Try a link with a wrong key (modify the fragment) — should fail to decrypt
   - Try an expired secret — should show "not found"

### Phase 1 Checkpoint
- [ ] Can paste text, get an encrypted share link
- [ ] Opening the link reveals the secret (after clicking "Reveal")
- [ ] Second open of the same link shows "already viewed or expired"
- [ ] Wrong key in the URL fragment causes decryption failure (clear error message)
- [ ] Server only ever stores encrypted blobs — verified by checking KV directly
- [ ] Secret textarea is cleared after link generation
- [ ] Copy-to-clipboard works for both the share link and the revealed secret
- [ ] Deployed to `*.pages.dev`

**Break it exercise:**
- Create a secret, then check the raw value in KV using `wrangler kv key get`. Verify it's just encrypted gibberish, not plaintext.
- Modify the encrypted blob in KV manually. Try to decrypt — it should fail (GCM authentication).
- Create a secret with 1-hour TTL. Check that KV auto-deletes it after expiry (or simulate with a short TTL during testing).
- Open the browser DevTools Network tab during the entire flow. Verify the encryption key (fragment) NEVER appears in any request.

---

## Phase 2 — Password Protection (Add a Second Layer)

**Goal:** Allow senders to add an optional password on top of the encryption. The recipient needs both the link AND the password to decrypt.

### Steps

1. **Update the crypto module (`frontend/crypto.js`)**
   - When a password is provided:
     - Derive an additional AES-256 key from the password using PBKDF2 (Password-Based Key Derivation Function 2)
     - Use `crypto.subtle.deriveKey()` with PBKDF2, a random salt, 100,000+ iterations, SHA-256
     - **Double encryption:** First encrypt with the random AES key (as before), then encrypt the result with the password-derived key
     - Store the salt alongside the encrypted blob (salt is not secret, like the IV)
   - Explain: Why PBKDF2 and not just using the password directly as a key. Why high iteration counts matter (brute-force resistance). Why a random salt is needed (prevents rainbow table attacks). How this creates a two-factor scheme: something you have (the link) + something you know (the password).

2. **Update the API**
   - `POST /api/secrets` now accepts an optional `passwordProtected: boolean` flag and the `salt` (base64-encoded)
   - Store the salt alongside the encrypted blob in KV (as a JSON object: `{ encrypted: string, salt?: string }`)
   - `GET /api/secrets/:id` returns the salt if present, so the receiver's browser knows to prompt for a password

3. **Update the frontend**
   - **Create view:** Add an optional "Set a password" field (collapsed by default, expandable)
   - **Reveal view:** If the API response includes a salt, show a password input field before the "Reveal" button
   - On reveal: derive the key from the password + salt, decrypt the outer layer, then decrypt the inner layer with the URL key
   - If the password is wrong: decryption fails (GCM authentication error) — show "Wrong password" message
   - Allow 3 attempts before showing a warning (but don't lock — the user might just be mistyping)

4. **Test the password flow**
   - Create a password-protected secret, share the link + tell the recipient the password separately
   - Verify: link alone doesn't decrypt (no password = decryption failure)
   - Verify: link + wrong password = decryption failure
   - Verify: link + correct password = success
   - Verify: non-password-protected secrets still work exactly as before

### Phase 2 Checkpoint
- [ ] Can create secrets with or without password protection
- [ ] Password-protected secrets require both the link and the password
- [ ] Wrong password shows a clear error
- [ ] Salt is stored in KV, password is NOT stored anywhere
- [ ] Non-password-protected flow is unchanged

---

## Phase 3 — Burn Confirmation and Metadata (Make It Trustworthy)

**Goal:** Add features that build trust — let senders know when their secret was viewed, and give both parties more transparency.

### Steps

1. **View confirmation for senders**
   - After creating a secret, generate a separate "status link" (e.g., `/status/:id`)
   - The sender can check this link to see: "Viewed on Feb 26, 2026 at 14:32 UTC" or "Not yet viewed" or "Expired (never viewed)"
   - This requires storing metadata in KV alongside the encrypted blob:
     ```json
     {
       "encrypted": "...",
       "salt": "...",
       "createdAt": "2026-02-26T10:00:00Z",
       "expiresAt": "2026-02-27T10:00:00Z",
       "viewedAt": null,
       "status": "pending"
     }
     ```
   - On view: update `viewedAt` and `status` to "viewed", delete the `encrypted` field (destroy the secret but keep the metadata)
   - Metadata entry has its own TTL (e.g., 30 days) — eventually auto-cleans
   - Explain: The separation of secret data and metadata. Why we keep metadata after burning the secret.

2. **Update the frontend**
   - After creating a secret, show TWO links:
     - "Share link" — for the recipient (the encrypted link)
     - "Status link" — for the sender (to check if it's been viewed)
   - Status page shows: created time, expiry time, viewed time (or "pending")
   - Simple, clean status display — no login required, status link is the auth

3. **Add metadata to KV storage**
   - Update the storage service to handle the richer metadata structure
   - On retrieve: update metadata, delete encrypted content, set new TTL for metadata-only entry
   - Explain: KV's `put()` with metadata vs storing everything in the value. Discuss KV metadata (up to 1024 bytes) vs the value itself — could we use KV metadata for status info and the value for the encrypted blob?

4. **Secret info on reveal page**
   - Before revealing, show: "This secret was created on [date] and expires on [date]"
   - After revealing: "This secret has been permanently destroyed."

### Phase 3 Checkpoint
- [ ] Sender gets a status link alongside the share link
- [ ] Status link shows "pending" / "viewed at [time]" / "expired"
- [ ] After viewing, the encrypted data is gone but metadata remains
- [ ] Metadata auto-expires after 30 days
- [ ] Reveal page shows creation and expiry info

---

## Phase 4 — Rate Limiting, Security Hardening, and Abuse Prevention

**Goal:** Harden the application against abuse, enumeration attacks, and resource exhaustion.

### Steps

1. **Rate limiting**
   - Limit secret creation: max 10 secrets per IP per hour
   - Limit secret retrieval: max 30 requests per IP per minute (prevents brute-force ID guessing)
   - Use Cloudflare's built-in rate limiting rules (dashboard or API) or implement in the Worker
   - Explain: The tradeoffs of Worker-level rate limiting (requires state, adds complexity) vs Cloudflare edge rate limiting (easier, more robust). Recommend the edge approach for this use case.

2. **Content size limits**
   - Maximum secret size: 50KB (generous for text, prevents abuse)
   - Validate on both frontend (before encryption) and backend (before storage)
   - KV values have a 25MB limit, but we don't want people storing large files through this tool
   - Explain: Defense in depth — frontend validation for UX, backend validation for security

3. **Security headers**
   - Set strict security headers on all responses:
     - `Content-Security-Policy` — restrict script sources, prevent XSS
     - `X-Content-Type-Options: nosniff`
     - `X-Frame-Options: DENY` — prevent clickjacking
     - `Strict-Transport-Security` — enforce HTTPS
     - `Referrer-Policy: no-referrer` — don't leak the URL (which contains the fragment on navigation)
   - Explain: Why each header matters specifically for this app. The CSP is especially important — if someone could inject a script, they could steal the encryption key from the URL fragment.

4. **Input validation and sanitization**
   - Validate all inputs on the Worker side (don't trust the frontend)
   - Secret IDs: must match expected format (base64url, expected length)
   - TTL values: must be one of the allowed values (reject arbitrary numbers)
   - Encrypted blobs: must be valid base64, within size limits
   - Return generic error messages — never leak internal details

5. **Prevent enumeration**
   - Use long random IDs (128+ bits of entropy) — practically unguessable
   - Return identical responses for "never existed" and "already viewed" (already done in Phase 1)
   - No timing differences between found/not-found responses (add constant-time comparison if needed)
   - Explain: Enumeration attacks and why consistent responses matter

6. **HTTPS enforcement**
   - The entire flow MUST be over HTTPS (Cloudflare handles this, but verify)
   - The encryption key in the URL fragment is protected by TLS in transit
   - Without HTTPS, the key could be intercepted (even though fragments aren't sent to the server, they're visible on the wire in the full URL during TLS negotiation — wait, actually they're not. Explain this clearly.)
   - Explain: URL fragments and HTTPS — fragments are NOT included in the HTTP request, but the full URL (including fragment) is visible in the browser's address bar and browser history. Discuss the implications.

### Phase 4 Checkpoint
- [ ] Rate limiting is active — tested by sending rapid requests
- [ ] Content size limit enforced on both frontend and backend
- [ ] All security headers present (verify with SecurityHeaders.com)
- [ ] Input validation rejects malformed requests
- [ ] No enumeration possible — responses are identical for missing/viewed secrets
- [ ] HTTPS enforced on all routes

---

## Phase 5 — Polish and Production Readiness

**Goal:** Make it a clean, trustworthy tool you'd actually share with colleagues and clients.

### Steps

1. **Frontend polish**
   - Clean, professional design — convey trust and security
   - Responsive layout (works on mobile — people share secrets from phones)
   - Loading states for encryption and API calls
   - Copy-to-clipboard with visual confirmation
   - Clear step-by-step flow: paste → set options → create → share
   - Subtle animations (nothing flashy — this is a serious tool)
   - Keyboard shortcuts: Enter to create, Ctrl+C to copy
   - Accessibility: proper ARIA labels, keyboard navigation, screen reader support

2. **Error handling**
   - Every failure mode has a clear, non-technical message:
     - "This secret has already been viewed or has expired."
     - "The password you entered is incorrect."
     - "Something went wrong. Please try again."
   - Never show raw error messages, stack traces, or technical details to the user
   - Log errors on the Worker side for debugging (but never log the encrypted content or keys)

3. **Privacy-first touches**
   - "How it works" section on the page explaining the zero-knowledge architecture in simple terms
   - "We can't read your secrets" trust statement
   - No analytics, no tracking, no cookies (or if needed, only essential functional ones)
   - No third-party scripts or CDN dependencies — everything self-hosted
   - Explain: Why self-hosting all assets matters for a security tool (no third-party can inject scripts)

4. **Performance**
   - Encryption/decryption should be near-instant (AES-GCM on modern browsers is fast)
   - KV lookups should be under 50ms globally (Cloudflare's edge)
   - Total flow from paste to share link: under 2 seconds
   - Total flow from link click to revealed secret: under 1 second

5. **Deploy to a custom domain (optional)**
   - Configure a custom domain via Cloudflare DNS
   - Set up proper caching rules (cache static assets, never cache API responses)
   - Verify HTTPS is enforced

6. **Documentation**
   - Brief README with: what it is, how to use it, how the encryption works, self-hosting instructions
   - The "how it works" section should be understandable by non-technical people
   - Include a security model diagram showing what the server can and cannot see

### Phase 5 Checkpoint
- [ ] Frontend is clean, professional, and mobile-responsive
- [ ] All error states have user-friendly messages
- [ ] No third-party scripts or tracking
- [ ] Performance is snappy — create and reveal are near-instant
- [ ] "How it works" section clearly explains the zero-knowledge model
- [ ] Tool is something you'd confidently share with a client for exchanging credentials
- [ ] The whole thing deployed and working end-to-end

---

## Cloudflare Products Used

| Product | How It's Used | Phase |
|---------|--------------|-------|
| **Workers** | API backend — stores and retrieves encrypted blobs, handles all server logic | 1 |
| **Pages** | Hosts the static frontend (HTML/CSS/JS with all crypto logic) | 1 |
| **KV** | Stores encrypted secrets with TTL for auto-expiry, stores status metadata | 1-3 |
| **Rate Limiting** | Protects against abuse and enumeration attacks | 4 |

Note: This project intentionally uses fewer Cloudflare products than TranscriptGrabber. No D1 (no need for relational queries — KV's key-value model is perfect for this use case). No R2 (no file storage needed). The simplicity is a feature — fewer moving parts means a smaller attack surface.

## Key Technical Notes

### Web Crypto API — The Core of the Project

The Web Crypto API is available in both browsers AND Cloudflare Workers. Here's the exact flow:

**Key Generation (browser):**
```javascript
// Generate a random AES-256-GCM key
const key = await crypto.subtle.generateKey(
  { name: "AES-GCM", length: 256 },
  true,  // extractable (we need to export it for the URL)
  ["encrypt", "decrypt"]
);

// Export to raw bytes, then base64url encode for URL
const rawKey = await crypto.subtle.exportKey("raw", key);
const keyString = base64urlEncode(new Uint8Array(rawKey));
```

**Encryption (browser):**
```javascript
// Random IV — 12 bytes for AES-GCM
const iv = crypto.getRandomValues(new Uint8Array(12));

// Encrypt
const ciphertext = await crypto.subtle.encrypt(
  { name: "AES-GCM", iv: iv },
  key,
  new TextEncoder().encode(plaintext)
);

// Combine IV + ciphertext into one blob
const blob = new Uint8Array(iv.length + ciphertext.byteLength);
blob.set(iv, 0);
blob.set(new Uint8Array(ciphertext), iv.length);

// Base64 encode for API transmission
const encryptedPayload = base64Encode(blob);
```

**Decryption (browser):**
```javascript
// Decode the key from URL fragment
const rawKey = base64urlDecode(keyString);
const key = await crypto.subtle.importKey(
  "raw", rawKey,
  { name: "AES-GCM", length: 256 },
  false,
  ["decrypt"]
);

// Decode the blob, split IV and ciphertext
const blob = base64Decode(encryptedPayload);
const iv = blob.slice(0, 12);
const ciphertext = blob.slice(12);

// Decrypt
const plaintext = await crypto.subtle.decrypt(
  { name: "AES-GCM", iv: iv },
  key,
  ciphertext
);

const text = new TextDecoder().decode(plaintext);
```

### KV TTL Behavior

KV's TTL (time-to-live) is the backbone of auto-expiry:
- `put(key, value, { expirationTtl: 3600 })` — auto-deletes after 1 hour
- Minimum TTL is 60 seconds
- Expiry is best-effort (may take a few seconds longer than the TTL)
- After expiry, `get()` returns `null` — indistinguishable from "never existed"
- This is exactly what we want — expired secrets simply vanish

### Zero-Knowledge Architecture

What the server (Worker) knows:
- A random ID
- An encrypted blob (gibberish without the key)
- When the secret was created
- When it was viewed (if status tracking is enabled)
- The TTL / expiry time

What the server NEVER knows:
- The plaintext secret
- The encryption key
- The password (if set — only the salt is stored)
- Who created the secret or who viewed it (no auth, no tracking)

### URL Fragment Security

The URL fragment (`#key`) is:
- Never sent to the server in HTTP requests (by browser specification, RFC 3986)
- Not included in the `Referer` header when navigating away (with proper `Referrer-Policy`)
- Visible in the browser's address bar and history
- Could be leaked via browser extensions that read the full URL (out of scope for this project, but worth noting)
- Protected in transit by TLS (the fragment is part of the URL only in the browser, never on the wire)

### Password-Derived Key (Phase 2)

When a password is used, the flow becomes:
1. Generate random AES key (K1) → encrypt secret → get ciphertext1
2. Derive AES key from password (K2) via PBKDF2 → encrypt ciphertext1 → get ciphertext2
3. Store ciphertext2 + salt on server, put K1 in URL fragment
4. Recipient needs: the link (contains K1) + the password (to derive K2)
5. Decrypt with K2 first (password), then decrypt with K1 (URL key)

This means even if someone intercepts the link, they still can't decrypt without the password. Two-factor secret sharing.

### Legal and Ethical Considerations

- This tool enables private communication — ensure it complies with local regulations
- UAE and KSA have encryption regulations — the tool itself is fine (TLS is universally accepted), but be aware of the regulatory landscape
- Don't market this as a tool for hiding illegal activity — position it as a secure credential-sharing tool for professionals
- Consider adding a brief acceptable use policy on the page

## Getting Started

When I say "let's start", begin by:
1. Creating the full folder structure inside the existing `SecretShare/` directory
2. Initializing the project with `npm init` and installing Hono
3. Setting up `wrangler.toml` with the project name and KV binding
4. Starting Phase 1, Step 1 — get a basic Hono Worker running, then build toward the crypto module and the encrypt/store/retrieve/decrypt flow
5. The crypto module (`frontend/crypto.js`) should be built early — it's the core of the project and everything else depends on it
