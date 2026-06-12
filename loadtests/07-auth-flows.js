// AUTH + EDGE FUNCTION TEST — exercises GoTrue and rate-limited functions.
// Staging/branch only. GoTrue JWT issuance is CPU-heavy (bcrypt) and runs on
// the SAME shared Nano CPU as Postgres — sign-in storms are a hidden CPU sink.
//
//   k6 run -e SUPABASE_URL=<staging> -e SUPABASE_ANON_KEY=... \
//          -e TEST_EMAIL=loadtest@example.com -e TEST_PASSWORD=... \
//          loadtests/07-auth-flows.js
//
// NOTE: your check-rate-limit function caps login at 5/5min per IP — from a
// single machine you WILL hit 429s quickly. That's a correct result, not a
// failure: this test verifies the rate limiter degrades gracefully under
// pressure (fast 429s, not slow timeouts). Low VU count is intentional.

import http from 'k6/http';
import { check, sleep } from 'k6';
import { SUPABASE_URL, FUNCTIONS, anonHeaders } from './config.js';

const EMAIL = __ENV.TEST_EMAIL || '';
const PASSWORD = __ENV.TEST_PASSWORD || '';

export const options = {
  vus: 5,
  duration: '3m',
  thresholds: {
    // 429 is an EXPECTED status here; only count 5xx/timeouts as failures
    'http_req_duration{name:login}': ['p(95)<2000'],
    'http_req_duration{name:rate-limit}': ['p(95)<1000'],
  },
};

export default function () {
  // 1. check-rate-limit edge function (called before every login in the app)
  const rl = http.post(
    `${FUNCTIONS}/check-rate-limit`,
    JSON.stringify({ bucket: 'login', email: EMAIL || 'probe@example.com' }),
    { headers: anonHeaders, tags: { name: 'rate-limit' } }
  );
  check(rl, {
    'rate-limit responds': (r) => r.status === 200 || r.status === 429,
    'rate-limit is fast even when limiting': (r) => r.timings.duration < 1000,
  });

  // 2. Actual password grant (only if test creds provided)
  if (EMAIL && PASSWORD) {
    const login = http.post(
      `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
      JSON.stringify({ email: EMAIL, password: PASSWORD }),
      { headers: anonHeaders, tags: { name: 'login' } }
    );
    check(login, {
      'login ok or rate-limited': (r) => r.status === 200 || r.status === 429,
    });

    // 3. If we got a session, do one authenticated read (RLS-checked path)
    if (login.status === 200) {
      const token = login.json('access_token');
      http.get(`${SUPABASE_URL}/rest/v1/profiles?select=*&limit=1`, {
        headers: { ...anonHeaders, Authorization: `Bearer ${token}` },
        tags: { name: 'profile-read' },
      });
    }
  }

  sleep(Math.random() * 5 + 5); // 5-10s — logins are infrequent per user
}
