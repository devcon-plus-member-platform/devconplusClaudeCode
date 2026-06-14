// S2 — authed hot path (the check-in rush). Needs a token pool (run mint-tokens.mjs first).
// Models ~500 ticket screens polling /api/registrations/mine every 5s, plus the
// occasional profile/points read. Exercises the AuthGuard (Firebase JWT verify),
// the 30s auth-profile cache, and the user-scoped queries.
// Run:  k6 run loadtest/k6-authed.js
// Tunables (env):  BASE_URL, VUS, DURATION, POLL_INTERVAL
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE = __ENV.BASE_URL || 'https://api.cloud-engineer.dev';
const VUS = Number(__ENV.VUS || 500);          // ~ one VU per simulated ticket screen
const DURATION = __ENV.DURATION || '3m';
const POLL = Number(__ENV.POLL_INTERVAL || 5);  // seconds between /registrations/mine polls

// Token pool minted by mint-tokens.mjs (gitignored). Array of Firebase ID tokens.
const tokens = JSON.parse(open('./tokens.json'));

export const options = {
  scenarios: {
    checkin_rush: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { target: VUS, duration: '1m' },     // doors open — everyone lands on the ticket screen
        { target: VUS, duration: DURATION },  // sustained polling
        { target: 0, duration: '30s' },
      ],
      gracefulRampDown: '10s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    'http_req_duration{endpoint:/api/registrations/mine}': ['p(95)<800'],
  },
};

export default function () {
  const token = tokens[(__VU - 1) % tokens.length];
  const auth = { headers: { Authorization: `Bearer ${token}` } };

  // The dominant check-in-rush load: poll my registrations every ~5s.
  const regs = http.get(`${BASE}/api/registrations/mine`, {
    ...auth,
    tags: { endpoint: '/api/registrations/mine' },
  });
  check(regs, { 'regs 200': (r) => r.status === 200 });

  // Occasional profile/points reads (dashboard glances) — ~1 in 5 iterations.
  if (Math.random() < 0.2) {
    http.get(`${BASE}/api/users/me`, { ...auth, tags: { endpoint: '/api/users/me' } });
    http.get(`${BASE}/api/points/summary`, { ...auth, tags: { endpoint: '/api/points/summary' } });
  }

  sleep(POLL);
}
