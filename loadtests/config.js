// Shared config for all DEVCON+ k6 tests.
// Usage: k6 run -e SUPABASE_URL=https://xxxx.supabase.co -e SUPABASE_ANON_KEY=eyJ... loadtests/<script>.js
// Optional: -e APP_URL=https://devconplusbeta-v1.vercel.app

export const SUPABASE_URL = __ENV.SUPABASE_URL || 'http://127.0.0.1:54321'; // default: local stack
export const ANON_KEY = __ENV.SUPABASE_ANON_KEY || '';
export const APP_URL = __ENV.APP_URL || 'https://devconplusbeta-v1.vercel.app';

if (!ANON_KEY) {
  throw new Error('SUPABASE_ANON_KEY is required: k6 run -e SUPABASE_ANON_KEY=... <script>');
}

export const REST = `${SUPABASE_URL}/rest/v1`;
export const FUNCTIONS = `${SUPABASE_URL}/functions/v1`;

// Anonymous (guest) headers — same as the web app before sign-in
export const anonHeaders = {
  apikey: ANON_KEY,
  Authorization: `Bearer ${ANON_KEY}`,
  'Content-Type': 'application/json',
};

// The read queries the app actually fires (mirrors the Zustand stores).
// Each entry: [name, url] — name is used for per-endpoint metrics tagging.
export const READS = [
  ['events', `${REST}/events?select=*&visibility=eq.public&order=event_date.asc&limit=20`],
  ['jobs', `${REST}/jobs?select=*&is_active=eq.true&order=posted_at.desc&limit=20`],
  ['news', `${REST}/news_posts?select=*&order=created_at.desc&limit=20`],
  ['chapters', `${REST}/chapters?select=*`],
  ['rewards', `${REST}/rewards?select=*&is_active=eq.true`],
];
