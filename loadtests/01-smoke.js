// SMOKE TEST — sanity check, safe to run against prod.
// Verifies every endpoint responds correctly under minimal load (3 VUs, 1 min).
// Run FIRST. If this fails, fix the app before running anything heavier.
//
//   k6 run -e SUPABASE_URL=... -e SUPABASE_ANON_KEY=... loadtests/01-smoke.js

import http from 'k6/http';
import { check, sleep } from 'k6';
import { READS, APP_URL, anonHeaders } from './config.js';

export const options = {
  vus: 3,
  duration: '1m',
  thresholds: {
    http_req_failed: ['rate<0.01'],      // <1% errors
    http_req_duration: ['p(95)<800'],    // 95% of requests under 800ms
    checks: ['rate>0.99'],
  },
};

export default function () {
  // Frontend shell (Vercel — verifies CDN + bundle is served)
  const page = http.get(APP_URL, { tags: { name: 'frontend' } });
  check(page, { 'frontend 200': (r) => r.status === 200 });

  // Every Supabase read the app performs
  for (const [name, url] of READS) {
    const res = http.get(url, { headers: anonHeaders, tags: { name } });
    check(res, {
      [`${name} 200`]: (r) => r.status === 200,
      [`${name} is json array`]: (r) => r.body && r.body.startsWith('['),
    });
  }

  sleep(1);
}
