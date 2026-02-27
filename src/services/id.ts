// Secure random ID generation — 16 bytes (128-bit entropy), base64url encoded (22 chars)
// Used on the client side for secret IDs. This module is for server-side validation/generation.

export function generateSecretId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return base64urlEncode(bytes);
}

export function isValidSecretId(id: string): boolean {
  // Must be exactly 22 chars of base64url (16 bytes encoded)
  return /^[A-Za-z0-9_-]{22}$/.test(id);
}

function base64urlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
