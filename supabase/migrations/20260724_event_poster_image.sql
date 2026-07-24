-- Adds a second, square "poster" image slot to events, independent of the
-- existing wide cover_image_url banner. Reuses the existing public `event-covers`
-- storage bucket — no bucket/policy changes needed.

ALTER TABLE events ADD COLUMN IF NOT EXISTS poster_image_url text;
