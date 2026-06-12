// SOAK TEST — sustained moderate load over 1 hour. Run against staging/branch.
// This is the test most relevant to your DISK IO BURST exhaustion: Nano's
// 43 Mbps baseline can burst to 2,085 Mbps for only ~30 min/day. A soak test
// reveals whether steady traffic alone drains the burst budget — exactly the
// pattern in your "Disk IO consumed per day" chart (May 13-14 at ~70%).
//
//   k6 run -e SUPABASE_URL=<staging/branch> -e SUPABASE_ANON_KEY=... loadtests/05-soak.js
//
// While it runs, watch in Supabase dashboard:
//   - Disk IO budget % (should NOT decline steadily)
//   - Memory (should plateau, not climb — climbing = leak/cache bloat)
//   - CPU (steady-state level, not spikes)

import http from 'k6/http';
import { check, sleep } from 'k6';
import { READS } from './config.js';

export const options = {
  stages: [
    { duration: '5m', target: 30 },   // ramp
    { duration: '50m', target: 30 },  // hold for nearly an hour
    { duration: '5m', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.02'],
    http_req_duration: ['p(95)<1200'],
  },
};

export default function () {
  for (const [name, url] of READS) {
    const res = http.get(url, {
      headers: {
        apikey: __ENV.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${__ENV.SUPABASE_ANON_KEY}`,
      },
      tags: { name },
    });
    check(res, { [`${name} 200`]: (r) => r.status === 200 });
    sleep(Math.random() * 4 + 3); // 3-7s between actions — leisurely browsing
  }
}
