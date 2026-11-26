import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));

export function loadConfig(overrides = {}) {
  const e = process.env;
  const baseUrl = (e.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
  return {
    port: Number(e.PORT || 3000),
    host: e.HOST || '0.0.0.0',
    baseUrl,
    secureCookies: baseUrl.startsWith('https://'),
    dbPath: e.DB_PATH || path.join(here, '..', 'data', 'sokn.db'),
    appDir: e.APP_DIR || path.join(here, '..', '..', 'app'),
    devLogin: e.DEV_LOGIN === '1' || e.NODE_ENV !== 'production',
    vapid: {
      publicKey: e.VAPID_PUBLIC_KEY,
      privateKey: e.VAPID_PRIVATE_KEY,
      subject: e.VAPID_SUBJECT || 'mailto:admin@example.org'
    },
    ...overrides
  };
}
