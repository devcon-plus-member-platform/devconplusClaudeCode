// SPIKE TEST — "registration just opened" scenario. DO NOT run against prod.
// DEVCON+'s real worst case: an officer posts a hot event, a chapter's FB
// group shares it, and 150 people open the app within 60 seconds.
// Tests sudden surge + recovery, not sustained load.
//
//   k6 run -e SUPABASE_URL=<staging/branch> -e SUPABASE_ANON_KEY=... loadtests/04-spike.js

import http from 'k6/http';
import { check, sleep } from 'k6';
import { REST, APP_URL, anonHeaders } from './config.js';

export const options = {
  stages: [
    { duration: '1m', target: 10 },   // baseline trickle
    { duration: '30s', target: 150 }, // SPIKE — everyone piles in
    { duration: '2m', target: 150 },  // they all browse the event
    { duration: '30s', target: 10 },  // spike ends
    { duration: '2m', target: 10 },   // recovery — latency should normalize
  ],
  thresholds: {
    http_req_failed: ['rate<0.10'],
    // During recovery the system MUST return to normal:
    'http_req_duration{phase:recovery}': ['p(95)<1500'],
  },
};

export default function () {
  // Tag the final stage so the recovery threshold can isolate it
  const phase = __ENV.K6_STAGE === '4' ? 'recovery' : 'main';

  // What a spiking user actually does: load app, load events, open THE event
  const page = http.get(APP_URL, { tags: { name: 'frontend', phase } });
  check(page, { 'app loads': (r) => r.status === 200 });

  const list = http.get(
    `${REST}/events?select=*&visibility=eq.public&order=event_date.asc&limit=20`,
    { headers: anonHeaders, tags: { name: 'events', phase } }
  );
  check(list, { 'events 200': (r) => r.status === 200 });

  const events = list.json();
  if (Array.isArray(events) && events.length > 0) {
    // Everyone opens the SAME first event — true hotspot behavior
    http.get(`${REST}/events?select=*&id=eq.${events[0].id}`, {
      headers: anonHeaders,
      tags: { name: 'event-detail', phase },
    });
  }

  sleep(Math.random() * 2 + 1);
}
