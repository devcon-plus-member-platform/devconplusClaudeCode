// Mints a pool of Firebase ID tokens for the authed load test (k6-authed.js).
// Tokens are what the app's AuthGuard verifies as `Authorization: Bearer <token>`.
//
// Usage:
//   1. Create loadtest/test-accounts.json (gitignored): [{ "email": "...", "password": "..." }, ...]
//      Use DEDICATED test accounts (verified email, member role). Supabase is shared
//      staging/prod — do NOT mass-create users; a handful (10-50) is plenty.
//   2. Set FIREBASE_WEB_API_KEY (it's in server/.env). Then:
//        node loadtest/mint-tokens.mjs
//   3. Writes loadtest/tokens.json (gitignored) — Firebase ID tokens expire in ~1h,
//      so mint right before running k6-authed.js.
import { readFileSync, writeFileSync } from 'node:fs';

const API_KEY =
  process.env.FIREBASE_WEB_API_KEY ||
  (() => {
    // fall back to server/.env
    try {
      const env = readFileSync(new URL('../server/.env', import.meta.url), 'utf8');
      const m = env.match(/^FIREBASE_WEB_API_KEY=(.+)$/m);
      return m ? m[1].trim() : '';
    } catch {
      return '';
    }
  })();

if (!API_KEY) {
  console.error('FAIL: FIREBASE_WEB_API_KEY not set (env or server/.env).');
  process.exit(1);
}

const accountsUrl = new URL('./test-accounts.json', import.meta.url);
let accounts;
try {
  accounts = JSON.parse(readFileSync(accountsUrl, 'utf8'));
} catch {
  console.error('FAIL: create loadtest/test-accounts.json — [{ "email": "...", "password": "..." }, ...]');
  process.exit(1);
}

const endpoint = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`;
const tokens = [];

for (const acc of accounts) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: acc.email, password: acc.password, returnSecureToken: true }),
  });
  const data = await res.json();
  if (!res.ok || !data.idToken) {
    console.error(`  ✗ ${acc.email}: ${data?.error?.message || res.status}`);
    continue;
  }
  tokens.push(data.idToken);
  console.log(`  ✓ ${acc.email}`);
}

if (tokens.length === 0) {
  console.error('FAIL: no tokens minted.');
  process.exit(1);
}

writeFileSync(new URL('./tokens.json', import.meta.url), JSON.stringify(tokens, null, 2));
console.log(`\nWrote loadtest/tokens.json (${tokens.length} tokens). Valid ~1h — run k6 now.`);
