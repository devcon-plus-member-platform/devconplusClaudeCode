-- Merge duplicate chapter rows into their canonical rows, then make duplicates impossible.
--
-- WHY: chapters.name had no uniqueness guard at any layer, so re-typed and mis-cased names
-- created real duplicate rows. Because /api/chapters is served unfiltered, those duplicates
-- appeared in every chapter dropdown and real members attached themselves to them.
--
-- Canonical rows are kept by ID, not by name. The capital-M 'Manila' row MUST survive:
-- handle_new_user() and create_profile_with_bonus() both resolve the default signup chapter
-- with `WHERE name = 'Manila'` (exact, case-sensitive).
--
-- Safe to run once. Assertions abort the whole block if row counts move.

DO $$
DECLARE
  -- canonical
  c_manila uuid := 'efe33216-9479-480b-9e0d-594ce66461bb';
  c_cebu   uuid := '6e6f6b8a-ee70-4bd9-a5d1-1e5f9df3fa85';
  -- duplicates
  d_cebu   uuid := '4be60b1e-7cc3-4331-8e08-5668fc83d2bc';
  d_man_1  uuid := 'bc3c0108-ab51-4488-9255-1ec26f94c3a8';
  d_man_2  uuid := 'e6a5483b-3562-470f-9f86-5fb38fe4b218';

  profiles_before   int;
  profiles_chaptered_before int;
  events_before     int;
  xp_before         bigint;
  profiles_after    int;
  profiles_chaptered_after int;
  events_after      int;
  xp_after          bigint;
  chapters_after    int;
BEGIN
  -- Preconditions: both canonical rows must exist, or we are not looking at the DB we think.
  IF NOT EXISTS (SELECT 1 FROM chapters WHERE id = c_manila AND name = 'Manila') THEN
    RAISE EXCEPTION 'Canonical Manila row % missing or renamed — aborting', c_manila;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM chapters WHERE id = c_cebu AND name = 'Cebu') THEN
    RAISE EXCEPTION 'Canonical Cebu row % missing or renamed — aborting', c_cebu;
  END IF;

  SELECT count(*), coalesce(sum(lifetime_points), 0) INTO profiles_before, xp_before FROM profiles;
  SELECT count(*) INTO profiles_chaptered_before FROM profiles WHERE chapter_id IS NOT NULL;
  SELECT count(*) INTO events_before FROM events;

  -- Reattach members and events. Officer roles are intentionally preserved.
  UPDATE profiles SET chapter_id = c_cebu   WHERE chapter_id = d_cebu;
  UPDATE events   SET chapter_id = c_cebu   WHERE chapter_id = d_cebu;
  UPDATE profiles SET chapter_id = c_manila WHERE chapter_id IN (d_man_1, d_man_2);
  UPDATE events   SET chapter_id = c_manila WHERE chapter_id IN (d_man_1, d_man_2);

  -- Defensive: currently zero rows, but a signup mid-migration could add one.
  UPDATE profiles SET pending_chapter_id = c_cebu   WHERE pending_chapter_id = d_cebu;
  UPDATE profiles SET pending_chapter_id = c_manila WHERE pending_chapter_id IN (d_man_1, d_man_2);

  -- Now unreferenced, so the foreign keys permit the delete.
  DELETE FROM chapters WHERE id IN (d_cebu, d_man_1, d_man_2);

  -- Assertions: a merge MOVES rows, so these totals must not move.
  SELECT count(*), coalesce(sum(lifetime_points), 0) INTO profiles_after, xp_after FROM profiles;
  SELECT count(*) INTO profiles_chaptered_after FROM profiles WHERE chapter_id IS NOT NULL;
  SELECT count(*) INTO events_after FROM events;
  SELECT count(*) INTO chapters_after FROM chapters;

  IF profiles_after <> profiles_before THEN
    RAISE EXCEPTION 'profiles count changed: % -> %', profiles_before, profiles_after;
  END IF;
  IF profiles_chaptered_after <> profiles_chaptered_before THEN
    RAISE EXCEPTION 'profiles with chapter changed: % -> %',
      profiles_chaptered_before, profiles_chaptered_after;
  END IF;
  IF events_after <> events_before THEN
    RAISE EXCEPTION 'events count changed: % -> %', events_before, events_after;
  END IF;
  IF xp_after <> xp_before THEN
    RAISE EXCEPTION 'lifetime_points sum changed: % -> %', xp_before, xp_after;
  END IF;
  IF chapters_after <> 13 THEN
    RAISE EXCEPTION 'expected 13 chapters after merge, got %', chapters_after;
  END IF;
  IF EXISTS (SELECT 1 FROM chapters GROUP BY lower(name) HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'case-insensitive duplicate chapter names still present';
  END IF;
END $$;

-- Uniqueness is case-insensitive so 'manila' can never coexist with 'Manila'.
-- Storage still preserves display casing — only the comparison is folded.
CREATE UNIQUE INDEX IF NOT EXISTS chapters_name_lower_key ON chapters (lower(name));
