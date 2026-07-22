/**
 * Cache key catalog + TTLs — the single source of truth for the cache layer.
 *
 * INVALIDATION CONTRACT (read this before adding a key):
 *   Every global key below is keyed by *what the data is*, never by *who asked*.
 *   That means a single shared entry per resource: when ANY user writes to the
 *   underlying table, the owning service deletes the one key and every user is
 *   fresh on the next read. There are no per-user copies to chase.
 *
 *   key                  read site                 invalidated by (service)
 *   ──────────────────── ───────────────────────── ──────────────────────────────
 *   EVENTS_LIST          GET /events               EventsService create/update/delete
 *   JOBS_ACTIVE/ALL      GET /jobs, /jobs/all      JobsService create/update/delete
 *   NEWS_LIST/newsItem   GET /news, /news/:id      NewsService create/update/delete
 *   FEATURED_STORIES_*   GET /featured-stories(/admin) FeaturedStoriesService create/update/delete
 *   CHAPTERS_LIST        GET /chapters             ChaptersService create/update/delete
 *   REWARDS_CATALOG/ALL  GET /rewards, /rewards/all RewardsService create/update/delete
 *                                                  + redeem/refund (rewards.stock_remaining)
 *   XP_TIERS             GET /points/tiers         PointsService tier create/update/delete
 *   INTERESTS_OPTIONS    GET /interests/options    (no writes — static seed data)
 *   MISSIONS_ADMIN_LIST  GET /missions/admin       MissionsService create/update/delete
 *   authProfile(uid)     AuthGuard per-request     Users/Admin/Upgrades role+profile writes
 *
 * Explicit invalidation is the primary mechanism; the TTLs below are only a
 * backstop for out-of-band DB edits (Supabase dashboard / seed scripts).
 */

/** TTLs in seconds. Generous because every write invalidates explicitly. */
export const CACHE_TTL = {
  EVENTS: 60,
  JOBS: 120,
  NEWS: 120,
  FEATURED_STORIES: 120,
  REWARDS: 120,
  MISSIONS: 120,
  CHAPTERS: 600,
  TIERS: 600,
  INTERESTS: 3600,
  /** Short — bounds role/chapter staleness if a cross-user bust is ever missed. */
  AUTH_PROFILE: 30,
} as const;

export const CacheKeys = {
  EVENTS_LIST: 'events:list',
  JOBS_ACTIVE: 'jobs:list:active',
  JOBS_ALL: 'jobs:list:all',
  NEWS_LIST: 'news:list',
  newsItem: (id: string): string => `news:item:${id}`,
  FEATURED_STORIES_ACTIVE: 'featured-stories:list:active',
  FEATURED_STORIES_ALL: 'featured-stories:list:all',
  CHAPTERS_LIST: 'chapters:list',
  REWARDS_CATALOG: 'rewards:catalog',
  REWARDS_ALL: 'rewards:all',
  XP_TIERS: 'points:tiers',
  INTERESTS_OPTIONS: 'interests:options',
  MISSIONS_ADMIN_LIST: 'missions:admin:list',
  /** Keyed by Firebase auth_uid (== AuthenticatedUser.firebaseUid). */
  authProfile: (authUid: string): string => `authprofile:${authUid}`,
} as const;
