-- ── DEVCON+ SEED DATA ─────────────────────────────────────────────────────────
-- Run AFTER all migrations (001–012) have been applied.
-- Order: chapters → organizer_codes → events → jobs → rewards → news_posts


-- ── CHAPTERS (all 11) ────────────────────────────────────────────────────────

INSERT INTO chapters (name, region) VALUES
  ('Manila',           'Luzon'),
  ('Laguna',           'Luzon'),
  ('Pampanga',         'Luzon'),
  ('Bulacan',          'Luzon'),
  ('Cebu',             'Visayas'),
  ('Iloilo',           'Visayas'),
  ('Bacolod',          'Visayas'),
  ('Davao',            'Mindanao'),
  ('Cagayan de Oro',   'Mindanao'),
  ('General Santos',   'Mindanao'),
  ('Zamboanga',        'Mindanao')
ON CONFLICT DO NOTHING;


-- ── ORGANIZER CODES ──────────────────────────────────────────────────────────

INSERT INTO organizer_codes (code, chapter_id, assigned_role, is_active)
SELECT 'ORG-MANILA', id, 'chapter_officer', true FROM chapters WHERE name = 'Manila';

INSERT INTO organizer_codes (code, chapter_id, assigned_role, is_active)
SELECT 'ORG-CEBU', id, 'chapter_officer', true FROM chapters WHERE name = 'Cebu';

INSERT INTO organizer_codes (code, chapter_id, assigned_role, is_active)
SELECT 'ORG-DAVAO', id, 'chapter_officer', true FROM chapters WHERE name = 'Davao';

INSERT INTO organizer_codes (code, chapter_id, assigned_role, is_active)
SELECT 'ORG-LAGUNA', id, 'chapter_officer', true FROM chapters WHERE name = 'Laguna';

INSERT INTO organizer_codes (code, chapter_id, assigned_role, is_active)
SELECT 'DCN-ADMIN', id, 'hq_admin', true FROM chapters WHERE name = 'Manila';


-- ── EVENTS (5 sample, matching mock data) ─────────────────────────────────────
-- Note: created_by is NULL since we have no user rows yet. Update after first sign-up.

INSERT INTO events (chapter_id, title, description, location, event_date, points_value, requires_approval, status, is_featured, is_promoted, cover_image_url, created_at)
SELECT
  c.id,
  'DEVCON Summit 2026',
  '"DEVCON Summit 2026" is a full-day gathering of the Philippines'' top developers, designers, and tech leaders. Featuring keynotes, workshops, and networking across 4 tracks — AI, Web3, Product, and Community.',
  'SMX Convention Center, Pasay',
  '2026-03-15T09:00:00Z',
  300,
  true,
  'upcoming',
  true,
  false,
  '/photos/devcon-summit-group.jpg',
  '2026-01-10T00:00:00Z'
FROM chapters c WHERE c.name = 'Manila';

INSERT INTO events (chapter_id, title, description, location, event_date, points_value, requires_approval, status, is_featured, is_promoted, cover_image_url, created_at)
SELECT
  c.id,
  'Code Camp Visayas',
  'A full-day hands-on coding event for student and professional developers in the Visayas region.',
  'Cebu IT Park',
  '2026-04-05T08:00:00Z',
  200,
  false,
  'upcoming',
  false,
  false,
  '/photos/devcon-code-camp-group.jpg',
  '2026-01-15T00:00:00Z'
FROM chapters c WHERE c.name = 'Cebu';

INSERT INTO events (chapter_id, title, description, location, event_date, points_value, requires_approval, status, is_featured, is_promoted, cover_image_url, created_at)
SELECT
  c.id,
  'AI/ML Workshop',
  'An intensive workshop on practical machine learning applications for Filipino developers.',
  'Ateneo de Davao',
  '2026-04-20T09:00:00Z',
  150,
  true,
  'upcoming',
  false,
  false,
  '/photos/devcon-workshop-session.jpg',
  '2026-01-20T00:00:00Z'
FROM chapters c WHERE c.name = 'Davao';

INSERT INTO events (chapter_id, title, description, location, event_date, points_value, requires_approval, status, is_featured, is_promoted, cover_image_url, created_at)
SELECT
  c.id,
  'Hackathon: Build for Good',
  'A 24-hour hackathon focused on building technology solutions for social good in the Philippines.',
  'Globe Tower, BGC',
  '2026-05-10T08:00:00Z',
  300,
  true,
  'upcoming',
  false,
  false,
  '/photos/devcon-hackathon-group.jpg',
  '2026-02-01T00:00:00Z'
FROM chapters c WHERE c.name = 'Manila';

INSERT INTO events (chapter_id, title, description, location, event_date, points_value, requires_approval, status, is_featured, is_promoted, cover_image_url, created_at)
SELECT
  c.id,
  'DEVCON Kids: Scratch Day',
  'Introducing kids aged 8–14 to programming through fun Scratch projects and games.',
  'SM Seaside, Cebu',
  '2026-05-25T09:00:00Z',
  100,
  false,
  'upcoming',
  false,
  false,
  '/photos/devcon-kids-robotics.jpg',
  '2026-02-05T00:00:00Z'
FROM chapters c WHERE c.name = 'Cebu';


-- ── JOBS (8 — Sui Foundation is 2nd row for PROMOTED badge) ──────────────────
-- Inserted in posted_at order so the 2nd listing by date is Sui Foundation (is_promoted=true).

INSERT INTO jobs (title, company, location, work_type, description, apply_url, is_promoted, is_active, posted_at) VALUES
  (
    'Senior Frontend Developer',
    'Accenture Philippines',
    'BGC, Taguig',
    'onsite',
    'Join our team to build enterprise-scale web applications for global clients. 5+ years React/TypeScript experience required.',
    'https://careers.accenture.com',
    false, true,
    '2026-02-01T00:00:00Z'
  ),
  (
    'Blockchain Developer',
    'Sui Foundation',
    'Remote',
    'remote',
    'Build the next generation of decentralized applications on the Sui blockchain. Strong Move or Solidity experience preferred.',
    'https://sui.io/careers',
    true, true,
    '2026-02-02T00:00:00Z'
  ),
  (
    'UI/UX Designer',
    'ING Philippines',
    'Makati',
    'hybrid',
    'Design intuitive digital banking experiences for millions of Filipino customers. Figma and user research skills required.',
    'https://www.ing.com/careers',
    false, true,
    '2026-02-03T00:00:00Z'
  ),
  (
    'Full Stack Engineer',
    'Thinking Machines',
    'Remote',
    'remote',
    'Work on data-driven products and AI/ML applications for Southeast Asian enterprises. Node.js + Python stack.',
    'https://thinkingmachin.es/careers',
    false, true,
    '2026-02-04T00:00:00Z'
  ),
  (
    'DevOps Engineer',
    'Globe Telecom',
    'BGC, Taguig',
    'onsite',
    'Manage CI/CD pipelines and cloud infrastructure for one of the Philippines'' largest telco providers. AWS + Kubernetes.',
    'https://globe.com.ph/about-us/careers',
    false, true,
    '2026-02-05T00:00:00Z'
  ),
  (
    'Mobile Developer (React Native)',
    'Kumu',
    'Remote',
    'remote',
    'Build and ship features for the Kumu live-streaming app used by 5M+ Filipinos. React Native + TypeScript.',
    'https://kumu.live/careers',
    false, true,
    '2026-02-06T00:00:00Z'
  ),
  (
    'Data Engineer',
    'GCash',
    'Mandaluyong',
    'hybrid',
    'Design and maintain data pipelines powering financial analytics for 80M+ GCash users. Spark + Airflow + BigQuery.',
    'https://gcash.com/careers',
    false, true,
    '2026-02-07T00:00:00Z'
  ),
  (
    'Product Manager',
    'Maya',
    'BGC, Taguig',
    'onsite',
    'Lead product strategy for Maya''s digital banking and payments platform. 3+ years PM experience in fintech preferred.',
    'https://maya.ph/careers',
    false, true,
    '2026-02-08T00:00:00Z'
  );


-- ── REWARDS (7 — all is_coming_soon=true) ────────────────────────────────────

INSERT INTO rewards (name, description, points_cost, type, claim_method, image_url, is_active, is_coming_soon) VALUES
  ('Lanyard',          'Official DEVCON+ branded lanyard.',                                           25,   'physical', 'onsite',            '/rewards/lanyard.jpg',   true, true),
  ('Coffee Voucher',   'PHP 150 coffee voucher redeemable at partner cafes.',                        500,   'digital',  'digital_delivery',   '/rewards/coffee.jpg',    true, true),
  ('DEVCON Cap',       'Limited edition DEVCON+ cap. One size fits all.',                            100,   'physical', 'onsite',            '/rewards/cap.jpg',       true, true),
  ('Mechanical Keyboard', 'TKL mechanical keyboard with DEVCON keycaps.',                           250,   'physical', 'onsite',            '/rewards/keyboard.jpg',  true, true),
  ('Wireless Headset', 'Premium noise-cancelling wireless headset.',                                 950,   'physical', 'onsite',            '/rewards/headset.jpg',   true, true),
  ('DEVCON Shirt',     'Premium cotton shirt with embroidered DEVCON+ logo. Sizes S–2XL.',          2000,  'physical', 'onsite',            '/rewards/shirt.jpg',     true, true),
  ('DEVCON Mug',       'Ceramic mug with DEVCON+ artwork. 350ml.',                                  2500,  'physical', 'onsite',            '/rewards/mug.jpg',       true, true);


-- ── NEWS POSTS ────────────────────────────────────────────────────────────────
-- 2nd post in devcon category → is_promoted=true
-- 2nd post in tech_community category → is_promoted=true

INSERT INTO news_posts (title, body, category, is_featured, is_promoted, cover_image_url, created_at) VALUES
  (
    'XP Rewards: New Items Added to the Store',
    'Check out the latest rewards available for redemption including exclusive DEVCON merch — from caps and mugs to premium hoodies. Log in and head to the Rewards Store to see what''s new.',
    'devcon',
    true, false,
    '/photos/devcon-certificate-ceremony.jpg',
    '2026-02-20T09:00:00Z'
  ),
  (
    'She is DEVCON: Empowering Women in Tech',
    'Our initiative to support and amplify women in the Philippine tech scene continues to grow. Join us for a series of events, mentorship sessions, and networking opportunities throughout 2026.',
    'devcon',
    false, true,
    '/photos/she-is-devcon-group.jpg',
    '2026-02-18T09:00:00Z'
  ),
  (
    'Philippine Tech Startups Raise $500M in Q1 2026',
    'A record-breaking quarter for the Philippine startup ecosystem. Fintech, healthtech, and edtech sectors lead the charge as investors double down on Southeast Asian growth stories.',
    'tech_community',
    false, false,
    'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800&q=80&fit=crop',
    '2026-02-15T09:00:00Z'
  ),
  (
    'Sui Foundation Partners with DEVCON Philippines',
    'The Sui blockchain foundation announces a strategic partnership with DEVCON Philippines to upskill Filipino developers in Web3 technologies and open exclusive job opportunities for community members.',
    'tech_community',
    false, true,
    'https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=800&q=80&fit=crop',
    '2026-02-10T09:00:00Z'
  );
