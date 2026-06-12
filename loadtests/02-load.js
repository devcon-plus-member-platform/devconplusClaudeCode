// LOAD TEST — average expected traffic (a normal evening with an event posted).
// Simulates a realistic member journey: open app → browse events → open one
// event → check jobs → check rewards. Ramps to 50 concurrent users.
//
//   k6 run -e SUPABASE_URL=... -e SUPABASE_ANON_KEY=... loadtests/02-load.js
//
// Target to watch in Supabase dashboard: CPU should stay <60%, no disk IO
// burst consumption. If Nano can't hold 50 VUs here, you have your answer
// for the compute upgrade conversation.

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { REST, APP_URL, anonHeaders } from './config.js';

export const options = {
  stages: [
    { duration: '2m', target: 20 },  // warm up
    { duration: '5m', target: 50 },  // ramp to normal peak
    { duration: '5m', target: 50 },  // hold
    { duration: '2m', target: 0 },   // ramp down
  ],
  thresholds: {
    http_req_failed: ['rate<0.02'],
    http_req_duration: ['p(95)<1200', 'p(99)<3000'],
    'http_req_duration{name:events}': ['p(95)<800'],
  },
};

export default function () {
  group('open app', () => {
    const res = http.get(APP_URL, { tags: { name: 'frontend' } });
    check(res, { 'app loads': (r) => r.status === 200 });
    sleep(Math.random() * 2 + 1); // 1-3s reading the dashboard
  });

  group('browse events', () => {
    const list = http.get(
      `${REST}/events?select=*&visibility=eq.public&order=event_date.asc&limit=20`,
      { headers: anonHeaders, tags: { name: 'events' } }
    );
    check(list, { 'events list 200': (r) => r.status === 200 });

    // Open the first event's detail (mirrors EventDetail page query)
    const events = list.json();
    if (Array.isArray(events) && events.length > 0) {
      const detail = http.get(
        `${REST}/events?select=*&id=eq.${events[0].id}`,
        { headers: anonHeaders, tags: { name: 'event-detail' } }
      );
      check(detail, { 'event detail 200': (r) => r.status === 200 });
    }
    sleep(Math.random() * 3 + 2); // 2-5s reading
  });

  group('browse jobs + rewards', () => {
    http.get(`${REST}/jobs?select=*&is_active=eq.true&order=posted_at.desc&limit=20`, {
      headers: anonHeaders,
      tags: { name: 'jobs' },
    });
    sleep(Math.random() * 2 + 1);
    http.get(`${REST}/rewards?select=*&is_active=eq.true`, {
      headers: anonHeaders,
      tags: { name: 'rewards' },
    });
    sleep(Math.random() * 2 + 1);
  });
}
