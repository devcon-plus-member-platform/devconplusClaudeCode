-- Add 'code_camp' to the events.category CHECK constraint.
-- PostgreSQL inline CHECK constraints are auto-named {table}_{column}_check,
-- so we drop and recreate in one statement.
ALTER TABLE events
  DROP CONSTRAINT IF EXISTS events_category_check,
  ADD CONSTRAINT events_category_check
    CHECK (category IN (
      'tech_talk','hackathon','workshop','brown_bag',
      'summit','social','networking','code_camp'
    ));
