-- Make the '*' inactive-chapter convention readable by queries.
--
-- WHY: a trailing '*' on chapters.name ('Bacolod*', 'Bohol*', 'Cagayan de Oro*',
-- 'Tacloban*') is DEVCON's standard mark for an inactive chapter. It is a house
-- convention no SQL parsed, and /api/chapters is served unfiltered, so inactive
-- chapters stayed selectable in every signup dropdown AND appeared on the
-- participation leaderboard with status 'no-events' — rendered as "No events this
-- season", which per CONTEXT.md asserts a chapter tried and nobody came. For a
-- dormant chapter that is simply false.
--
-- A GENERATED column rather than a plain boolean, deliberately: the name stays the
-- single source of truth, so the convention keeps working exactly as the team
-- already uses it. Add or remove the '*' and the flag follows on the same UPDATE —
-- there is no second field to forget, and the two can never disagree.
--
-- Members already attached to an inactive chapter are NOT moved: profiles.chapter_id
-- is untouched here. They keep their chapter and their history; only the signup
-- dropdowns and the leaderboard change.

BEGIN;

ALTER TABLE chapters
  ADD COLUMN IF NOT EXISTS is_active boolean
  GENERATED ALWAYS AS (rtrim(name) NOT LIKE '%*') STORED;

COMMENT ON COLUMN chapters.is_active IS
  'Derived from the house convention: a trailing * on the name marks an inactive '
  'chapter. Not writable — add or remove the * on chapters.name instead.';

COMMIT;
