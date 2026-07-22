-- ============================================================
-- Migration: 20260717_featured_stories
-- Description: Admin-managed "Featured Stories" for the Home dashboard —
--              a shuffled carousel of YouTube videos (autoplay/mute/loop)
--              or article cards. Replaces the old static "Updates" card.
--
--              Written/read exclusively through the NestJS gateway
--              (service-role client), matching jobs/news_posts/chapters.
-- Run order: after 20260709_rewards_deadline.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS featured_stories (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  type         text        NOT NULL CHECK (type IN ('article', 'video')) DEFAULT 'video',
  youtube_id   text        NOT NULL,   -- YouTube video ID (not the full URL) — used for
                                       -- both the embed (autoplay=1&mute=1&loop=1) and the
                                       -- static thumbnail (img.youtube.com/vi/<id>/hqdefault.jpg)
  title        text        NOT NULL,
  article_url  text,                  -- where 'article' stories navigate on tap (in-app path or URL)
  is_active    boolean     NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- featured_stories (public read — mirrors jobs/news_posts in 012_rls_policies.sql)
ALTER TABLE featured_stories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Featured stories are public"
  ON featured_stories FOR SELECT
  USING (is_active = true);
