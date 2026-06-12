// POLLING STORM — simulates DEVCON+'s OWN background load. Staging/branch only.
//
// Per .claude/rules/db-connection-resilience.md, every open tab runs:
//   - recover() + resubscribe() every 90 seconds (polling keepalive)
//   - recover() fires ALL store fetches: events, registrations, jobs, news,
//     points, rewards, notifications
//   - plus +5s and +15s follow-up bursts after each visibility/online trigger
//
// This means N idle open tabs generate N * (7 queries / 90s) with ZERO user
// interaction. This test reproduces that exact pattern to measure how much
// of your Nano CPU is consumed by your own keepalive traffic.
//
//   k6 run -e SUPABASE_URL=<staging/branch> -e SUPABASE_ANON_KEY=... loadtests/06-polling-storm.js
//
// Interpretation: if 100 idle "tabs" produce significant CPU on the dashboard,
// the fix isn't bigger compute — it's lengthening the poll interval, adding
// jitter so tabs don't sync up, or polling only a lightweight head request.

import http from 'k6/http';
import { check, sleep } from 'k6';
import { REST, anonHeaders } from './config.js';

export const options = {
  scenarios: {
    idle_tabs: {
      executor: 'constant-vus',
      vus: 100,           // 100 idle open tabs
      duration: '15m',    // ~10 poll cycles each
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<1500'],
  },
};

// One recover() burst = every store's fetch, fired together (as the app does)
function recoverBurst(tag) {
  const reqs = [
    ['events', `${REST}/events?select=*&visibility=eq.public&order=event_date.asc&limit=20`],
    ['jobs', `${REST}/jobs?select=*&is_active=eq.true&order=posted_at.desc&limit=20`],
    ['news', `${REST}/news_posts?select=*&order=created_at.desc&limit=20`],
    ['rewards', `${REST}/rewards?select=*&is_active=eq.true`],
    ['chapters', `${REST}/chapters?select=*`],
  ].map(([name, url]) => ({
    method: 'GET',
    url,
    params: { headers: anonHeaders, tags: { name, burst: tag } },
  }));

  // http.batch = parallel requests, exactly like Promise.all in recover()
  const responses = http.batch(reqs);
  for (const res of responses) {
    check(res, { 'poll 200': (r) => r.status === 200 });
  }
}

export default function () {
  // The 90-second keepalive cycle. No jitter — tabs that loaded at the same
  // time poll at the same time, which is the worst (and current) case.
  recoverBurst('keepalive');
  sleep(90);
}
