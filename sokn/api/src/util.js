import crypto from 'node:crypto';

// URL-safe random string from the OS CSPRNG. rid(24) = 192 bits.
export const rid = (bytes = 16) => crypto.randomBytes(bytes).toString('base64url');
export const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
export const now = () => Date.now();
