// crypto.js — Web Crypto API wrapper for SecretShare
// AES-256-GCM with Additional Authenticated Data (AAD), PBKDF2 for password protection

if (!crypto?.subtle) {
  throw new Error('Web Crypto API is not available. SecretShare requires HTTPS.');
}

const IV_LENGTH = 12;       // 12 bytes for AES-GCM (recommended by NIST)
const SALT_LENGTH = 16;     // 16 bytes for PBKDF2 salt
const PBKDF2_ITERATIONS = 600000; // OWASP 2024 guidance

// --- Base64 / Base64URL helpers ---

function base64Encode(bytes) {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function base64Decode(str) {
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function base64urlEncode(bytes) {
  return base64Encode(bytes)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64urlDecode(str) {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) base64 += '=';
  return base64Decode(base64);
}

// --- Key Generation ---

async function generateKey() {
  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,   // extractable — we need to export it for the URL fragment
    ['encrypt', 'decrypt']
  );
  const rawKey = await crypto.subtle.exportKey('raw', key);
  const keyString = base64urlEncode(new Uint8Array(rawKey));
  return { key, keyString };
}

async function importKey(keyString) {
  const rawKey = base64urlDecode(keyString);
  return crypto.subtle.importKey(
    'raw',
    rawKey,
    { name: 'AES-GCM', length: 256 },
    false,  // not extractable — only used for decrypt
    ['decrypt']
  );
}

async function importKeyForEncrypt(keyString) {
  const rawKey = base64urlDecode(keyString);
  return crypto.subtle.importKey(
    'raw',
    rawKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );
}

// --- Encryption (AES-256-GCM with AAD) ---

async function encrypt(plaintext, key, secretId) {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encoded = new TextEncoder().encode(plaintext);
  const aad = new TextEncoder().encode(secretId);

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: aad },
    key,
    encoded
  );

  // Combine IV + ciphertext into single blob
  const blob = new Uint8Array(iv.length + ciphertext.byteLength);
  blob.set(iv, 0);
  blob.set(new Uint8Array(ciphertext), iv.length);

  return base64Encode(blob);
}

async function decrypt(encryptedPayload, key, secretId) {
  const blob = base64Decode(encryptedPayload);
  const iv = blob.slice(0, IV_LENGTH);
  const ciphertext = blob.slice(IV_LENGTH);
  const aad = new TextEncoder().encode(secretId);

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, additionalData: aad },
    key,
    ciphertext
  );

  return new TextDecoder().decode(decrypted);
}

// --- Password Protection (PBKDF2 + double encryption) ---

function generateSalt() {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  return base64Encode(salt);
}

async function deriveKeyFromPassword(password, saltBase64) {
  const salt = base64Decode(saltBase64);
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    passwordKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encryptWithPassword(plaintext, urlKey, password, secretId) {
  // Layer 1: encrypt with URL key + AAD
  const layer1 = await encrypt(plaintext, urlKey, secretId);

  // Layer 2: encrypt layer1 with password-derived key (no AAD on outer layer — AAD is on inner)
  const salt = generateSalt();
  const passwordDerivedKey = await deriveKeyFromPassword(password, salt);
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encoded = new TextEncoder().encode(layer1);

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    passwordDerivedKey,
    encoded
  );

  const blob = new Uint8Array(iv.length + ciphertext.byteLength);
  blob.set(iv, 0);
  blob.set(new Uint8Array(ciphertext), iv.length);

  return { encrypted: base64Encode(blob), salt };
}

async function decryptWithPassword(encryptedPayload, urlKeyString, password, saltBase64, secretId) {
  // Layer 2: decrypt with password-derived key
  const passwordDerivedKey = await deriveKeyFromPassword(password, saltBase64);
  const outerBlob = base64Decode(encryptedPayload);
  const outerIv = outerBlob.slice(0, IV_LENGTH);
  const outerCiphertext = outerBlob.slice(IV_LENGTH);

  const layer1Bytes = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: outerIv },
    passwordDerivedKey,
    outerCiphertext
  );

  const layer1 = new TextDecoder().decode(layer1Bytes);

  // Layer 1: decrypt with URL key + AAD
  const urlKey = await importKey(urlKeyString);
  return decrypt(layer1, urlKey, secretId);
}

// Export for use in app.js / reveal.js
window.SecretCrypto = {
  generateKey,
  importKey,
  importKeyForEncrypt,
  encrypt,
  decrypt,
  encryptWithPassword,
  decryptWithPassword,
  generateSalt,
  deriveKeyFromPassword,
  base64Encode,
  base64Decode,
  base64urlEncode,
  base64urlDecode,
  PBKDF2_ITERATIONS,
};
