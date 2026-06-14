// S1 — public read throughput. No auth; safe to run anytime.
// Exercises nginx + Node + the Upstash cache + CPU on the cached read path.
// Run:  k6 run loadtest/k6-public.js
// Tunables (env):  BASE_URL, TARGET_RPS, DURATION
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE = __ENV.BASE_URL || 'https://api.cloud-engineer.dev';
const TARGET_RPS = Number(__ENV.TARGET_RPS || 150);
const DURATION = __ENV.DURATION || '3m';

export const options = {
  scenarios: {
    public_reads: {
      executor: 'ramping-arrival-rate',
      startRate: 5,
      timeUnit: '1s',
      preAllocatedVUs: 100,
      maxVUs: 400,
      stages: [
        { target: 20, duration: '30s' },          // warm-up (stay near cap for a dry run)
        { target: TARGET_RPS, duration: '1m' },    // ramp to target
        { target: TARGET_RPS, duration: DURATION }, // hold
        { target: 0, duration: '30s' },             // ramp down
      ],
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],            // <1% errors
    http_req_duration: ['p(95)<800'],          // p95 < 800ms (includes client RTT — judge via CloudWatch too)
  },
};

const paths = ['/api/events', '/api/jobs', '/api/news'];

export default function () {
  const path = paths[Math.floor(Math.random() * paths.length)];
  const res = http.get(`${BASE}${path}`, { tags: { endpoint: path } });
  check(res, { 'status 200': (r) => r.status === 200 });
  sleep(0.2);
}
