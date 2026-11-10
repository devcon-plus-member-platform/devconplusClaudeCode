-- Fill in events.slug on insert when the writer didn't provide one.
--
-- WHY: 20260331_event_url_slugs.sql made events.slug NOT NULL but only backfilled
-- existing rows — nothing generated a slug for NEW events. On a database built
-- from migrations alone, creating an event failed with:
--   null value in column "slug" of relation "events" violates not-null constraint
--
-- The NestJS gateway now always sends a slug (server/src/events/event-slug.ts),
-- so the app does not depend on this trigger. It's a database-level safety net
-- for any other writer (SQL editor, seed scripts, future code paths).
--
-- Same format as the 20260331 backfill and the gateway: kebab-case title + "-" +
-- first 8 chars of the id ("event" when the title has no letters or digits).
-- Only acts when slug is NULL or empty, so it never changes a provided slug.
--
-- Idempotent: safe to run more than once, and safe alongside any equivalent
-- trigger that was added to a database by hand.

CREATE OR REPLACE FUNCTION public.set_event_slug()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  base text;
BEGIN
  IF NEW.slug IS NULL OR NEW.slug = '' THEN
    base := trim(both '-' from lower(regexp_replace(coalesce(NEW.title, ''), '[^a-zA-Z0-9]+', '-', 'g')));
    NEW.slug := coalesce(nullif(base, ''), 'event') || '-' || substring(NEW.id::text, 1, 8);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_event_slug ON public.events;
CREATE TRIGGER trg_set_event_slug
  BEFORE INSERT ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.set_event_slug();
