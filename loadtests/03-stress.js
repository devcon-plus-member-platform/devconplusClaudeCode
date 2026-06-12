// STRESS TEST — find the breaking point. DO NOT run against prod.
// Ramps well beyond expected capacity to discover where the Nano instance
// falls over and HOW it fails (timeouts? 5xx? connection refused?).
//
//   k6 run -e SUPABASE_URL=<staging/branch> -e SUPABASE_ANON_KEY=... loadtests/03-stress.js
//
// Read the output: the VU level at which http_req_failed starts climbing is
// your real capacity ceiling. Note whether failures are graceful (429/503)
// or ugly (timeouts) — ugly failures mean users see white screens.

import http from 'k6/http';
import { check, sleep } from 'k6';
import { READS } from './config.js';

export const options = {
  stages: [
    { duration: '2m', target: 50 },
    { duration: '3m', target: 100 },
    { duration: '3m', target: 200 },  // ~4x expected peak
    { duration: '3m', target: 300 },  // breaking point territory for Nano
    { duration: '2m', target: 0 },    // recovery — does it come back?
  ],
  thresholds: {
    // Deliberately loose: we EXPECT degradation; we're measuring where.
    http_req_failed: ['rate<0.30'],
  },
};

export default function () {
  // Hit a random read each iteration — spreads load like real mixed traffic
  const [name, url] = READS[Math.floor(Math.random() * READS.length)];
  const res = http.get(url, {
    headers: {
      apikey: __ENV.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${__ENV.SUPABASE_ANON_KEY}`,
    },
    tags: { name },
    timeout: '10s',
  });
  check(res, { 'status 200': (r) => r.status === 200 });
  sleep(Math.random() + 0.5); // 0.5-1.5s — aggressive but not a flood
}
